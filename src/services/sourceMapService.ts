import path from 'path';
import * as sourceMap from 'source-map';
import { SourceMapData } from '../types/index.js';
import { FileService } from './fileService.js';
import { resolveUrl } from '../utils/url.js';
import { FetchService } from './fetchService.js';

/**
 * Service for processing source maps
 */
export class SourceMapService {
  private fileService: FileService;
  private fetchService: FetchService;

  /**
   * Initialize SourceMapService
   * @param fileService Service for file operations
   * @param fetchService Service for downloading content
   */
  constructor(fileService: FileService, fetchService: FetchService) {
    this.fileService = fileService;
    this.fetchService = fetchService;
  }

  /**
   * Process source map from file content
   * @param content Content of the file to process
   * @param assetUrl URL of the file
   * @param assetFilePath Path where the file is saved
   * @param srcDir Directory to save source files
   */
  async processSourceMap(
    content: string,
    assetUrl: string,
    assetFilePath: string,
    srcDir: string
  ): Promise<void> {
    // Find source map URL in the content
    let sourceMapUrl: string | null = null;
    let isInlineSourceMap = false;
    let inlineSourceMapContent: SourceMapData | null = null;

    // Find using format //# sourceMappingURL=
    const sourceMappingMatch = content.match(/\/\/# sourceMappingURL=([^\s'"]+)/);
    if (sourceMappingMatch) {
      sourceMapUrl = sourceMappingMatch[1];

      // Check if it's an inline source map
      if (sourceMapUrl.startsWith('data:application/json;base64,')) {
        isInlineSourceMap = true;
        try {
          const base64Data = sourceMapUrl.replace('data:application/json;base64,', '');
          inlineSourceMapContent = JSON.parse(Buffer.from(base64Data, 'base64').toString()) as SourceMapData;
          console.log(`Found inline source map for ${assetUrl}`);
        } catch (error) {
          console.error(`Error decoding inline source map: ${(error as Error).message}`);
        }
      }
    } else {
      // Find using format /*# sourceMappingURL= */ (for CSS)
      const cssSourceMappingMatch = content.match(/\/\*# sourceMappingURL=([^\s*]+)\s*\*\//);
      if (cssSourceMappingMatch) {
        sourceMapUrl = cssSourceMappingMatch[1];

        // Check if it's an inline source map (CSS)
        if (sourceMapUrl.startsWith('data:application/json;base64,')) {
          isInlineSourceMap = true;
          try {
            const base64Data = sourceMapUrl.replace('data:application/json;base64,', '');
            inlineSourceMapContent = JSON.parse(Buffer.from(base64Data, 'base64').toString()) as SourceMapData;
            console.log(`Found inline source map for ${assetUrl}`);
          } catch (error) {
            console.error(`Error decoding inline source map: ${(error as Error).message}`);
          }
        }
      }
    }

    if (isInlineSourceMap && inlineSourceMapContent) {
      // Save inline source map
      const mapFilePath = assetFilePath + '.map';
      await this.fileService.saveToFile(mapFilePath, JSON.stringify(inlineSourceMapContent, null, 2));

      // Process source files in the inline source map
      await this.extractSourcesFromMap(inlineSourceMapContent, srcDir);
      return;
    }

    // If source map URL not found in the content or not inline, try to download the map file with .map extension
    if (!sourceMapUrl || isInlineSourceMap) {
      sourceMapUrl = assetUrl + '.map';
    } else if (!isInlineSourceMap) {
      sourceMapUrl = resolveUrl(assetUrl, sourceMapUrl);
    }

    // Download source map
    try {
      const mapResult = await this.fetchService.fetchContent<SourceMapData>(sourceMapUrl);
      if (!mapResult.success || !mapResult.data) return;

      // Save source map
      const mapFilePath = assetFilePath + '.map';
      await this.fileService.saveToFile(mapFilePath, JSON.stringify(mapResult.data, null, 2));

      // Process source files in the source map
      await this.extractSourcesFromMap(mapResult.data, srcDir);
    } catch {
      // Silence the error, just log that source map wasn't found
      console.log(`Source map not found for ${assetUrl}`);
    }
  }

  /**
   * Extract source files from source map
   * @param mapContent Source map content
   * @param srcDir Directory to save source files
   */
  async extractSourcesFromMap(mapContent: SourceMapData, srcDir: string): Promise<void> {
    try {
      // Parse source map
      const consumer = await new sourceMap.SourceMapConsumer(
        typeof mapContent === 'string' ? mapContent : JSON.stringify(mapContent)
      );

      // Get list of sources and content
      const sourceList = consumer.sources || [];
      const sourceContentList: (string | null)[] = [];

      // Get content of each source using sourceContentFor
      for (let i = 0; i < sourceList.length; i++) {
        const source = sourceList[i];
        const content = source ? consumer.sourceContentFor(source, true) : null;
        sourceContentList.push(content);
      }

      // Save source files
      for (let i = 0; i < sourceList.length; i++) {
        const sourceRelativePath = sourceList[i];
        const sourceContent = sourceContentList[i];

        if (sourceContent) {
          // Create relative path for source file
          let sourcePath = sourceRelativePath;

          // Process webpack:// paths
          if (sourcePath.startsWith('webpack://')) {
            sourcePath = sourcePath.replace('webpack://', '');
            // Remove project name if present
            const parts = sourcePath.split('/');
            if (parts.length > 1 && parts[0].startsWith('.')) {
              parts.shift();
            }
            sourcePath = parts.join('/');
          }

          // Remove leading / if present
          if (sourcePath.startsWith('/')) {
            sourcePath = sourcePath.substring(1);
          }

          // Save source file
          const sourceFilePath = path.join(srcDir, sourcePath);
          await this.fileService.saveToFile(sourceFilePath, sourceContent);
        }
      }

      consumer.destroy();
    } catch (error) {
      console.error('Error processing source map:', (error as Error).message);
    }
  }
}