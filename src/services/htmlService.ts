import * as cheerio from 'cheerio';
import { FileService } from './fileService.js';
import { FetchService } from './fetchService.js';
import { SourceMapService } from './sourceMapService.js';
import { CacheService } from './cacheService.js';
import { urlToFilePath, resolveUrl } from '../utils/url.js';
import { Asset } from '../types/index.js';

/**
 * Service for HTML content processing
 */
export class HtmlService {
  private fileService: FileService;
  private fetchService: FetchService;
  private sourceMapService: SourceMapService;
  private cacheService: CacheService;
  private distDir: string;
  private srcDir: string;
  private debug: boolean;

  constructor(
    fileService: FileService,
    fetchService: FetchService,
    sourceMapService: SourceMapService,
    cacheService: CacheService,
    distDir: string,
    srcDir: string,
    debug = false
  ) {
    this.fileService = fileService;
    this.fetchService = fetchService;
    this.sourceMapService = sourceMapService;
    this.cacheService = cacheService;
    this.distDir = distDir;
    this.srcDir = srcDir;
    this.debug = debug;
  }

  /**
   * Process HTML content, extract and download CSS and JS resources
   */
  async processHtml(htmlContent: string, baseUrl: string): Promise<void> {
    const $ = cheerio.load(htmlContent);
    const cssLinks: string[] = [];
    const jsLinks: string[] = [];
    const otherAssets: string[] = [];

    // Find CSS link tags
    $('link[rel="stylesheet"], link[as="style"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href && !href.startsWith('data:')) {
        cssLinks.push(href);
      }
    });

    // Find JS script tags
    $('script').each((_, element) => {
      const src = $(element).attr('src');
      if (src && !src.startsWith('data:')) {
        jsLinks.push(src);
      }
    });

    // Find img tags
    $('img').each((_, element) => {
      const src = $(element).attr('src');
      if (src && !src.startsWith('data:')) {
        otherAssets.push(src);
      }
    });

    // Find source tags in picture/video elements
    $('source').each((_, element) => {
      const src = $(element).attr('src');
      if (src && !src.startsWith('data:')) {
        otherAssets.push(src);
      }
    });

    // Extract CSS imports from style tags
    $('style').each((_, element) => {
      const cssContent = $(element).html();
      if (cssContent) {
        const importMatches = cssContent.match(/@import\s+["']([^"']+)["']/g);
        if (importMatches) {
          importMatches.forEach(match => {
            const importUrlMatch = match.match(/@import\s+["']([^"']+)["']/);
            if (importUrlMatch && importUrlMatch[1]) {
              cssLinks.push(importUrlMatch[1]);
            }
          });
        }
      }
    });

    // Prepare resource list
    const assets: Asset[] = [
      ...cssLinks.map(url => ({
        url,
        absoluteUrl: resolveUrl(baseUrl, url),
        type: 'css' as const
      })),
      ...jsLinks.map(url => ({
        url,
        absoluteUrl: resolveUrl(baseUrl, url),
        type: 'js' as const
      })),
      ...otherAssets.map(url => ({
        url,
        absoluteUrl: resolveUrl(baseUrl, url),
        type: 'other' as const
      }))
    ];

    // Filter out already processed assets
    const assetsToProcess = assets.filter(asset =>
      !this.cacheService.isUrlProcessed(asset.absoluteUrl)
    );

    if (this.debug) {
      console.log(`[DEBUG] Total ${assets.length} assets, need to download ${assetsToProcess.length} new assets`);
      console.log(`[DEBUG] - CSS: ${cssLinks.length}`);
      console.log(`[DEBUG] - JS: ${jsLinks.length}`);
      console.log(`[DEBUG] - Other: ${otherAssets.length}`);
    } else {
      console.log(`Found ${assets.length} assets, need to download ${assetsToProcess.length} new assets`);
    }

    // Process all assets concurrently
    await this.processAssetsBatch(assetsToProcess, baseUrl);
  }

  /**
   * Process multiple assets concurrently
   */
  private async processAssetsBatch(assets: Asset[], baseUrl: string): Promise<void> {
    const promises = assets.map(asset =>
      this.processAssetWithType(asset.url, baseUrl, asset.type)
        .catch(error => console.error(`Error processing ${asset.url}:`, error.message))
    );

    await Promise.all(promises);
  }

  /**
   * Process asset download with specific type
   */
  private async processAssetWithType(
    assetUrl: string,
    baseUrl: string,
    type: 'css' | 'js' | 'image' | 'font' | 'other'
  ): Promise<void> {
    const mainType: 'css' | 'js' | 'other' =
      type === 'css' ? 'css' :
      type === 'js' ? 'js' : 'other';

    await this.processAsset(assetUrl, baseUrl, mainType);
  }

  /**
   * Process asset download (CSS/JS/Other)
   */
  async processAsset(assetUrl: string, baseUrl: string, type: 'css' | 'js' | 'other'): Promise<void> {
    const absoluteUrl = resolveUrl(baseUrl, assetUrl);

    // Check if URL is already processed
    if (this.cacheService.isUrlProcessed(absoluteUrl)) {
      if (this.debug) {
        console.log(`[DEBUG] Skip (already downloaded): ${absoluteUrl}`);
      }
      return;
    }

    // Download asset
    const result = await this.fetchService.fetchContent<string>(absoluteUrl);
    if (!result.success || !result.data) return;

    // Save asset
    const filePath = urlToFilePath(absoluteUrl, this.distDir);
    await this.fileService.saveToFile(filePath, result.data);

    // Mark URL as processed
    this.cacheService.markUrlProcessed(absoluteUrl);

    // Process source map if JS or CSS
    if ((type === 'js' || type === 'css') && typeof result.data === 'string') {
      await this.sourceMapService.processSourceMap(result.data, absoluteUrl, filePath, this.srcDir);

      // If CSS, process URLs in CSS content
      if (type === 'css') {
        await this.processCssUrls(result.data, absoluteUrl);
      }
    }
  }

  /**
   * Process URLs in CSS content
   */
  async processCssUrls(cssContent: string, baseUrl: string): Promise<void> {
    // Find all URLs in CSS (with or without quotes)
    const urlRegex = /url\(['"]?((?!data:)[^'")\s]+)['"]?\)/g;
    const urlMatches = cssContent.match(urlRegex);
    if (!urlMatches) return;

    // Create array for assets to download
    const cssAssets: Asset[] = [];

    for (const urlMatch of urlMatches) {
      // Extract URL from url() syntax
      const urlRegexSingle = /url\(['"]?((?!data:)[^'")\s]+)['"]?\)/;
      const matches = urlMatch.match(urlRegexSingle);
      if (!matches || !matches[1]) continue;

      const url = matches[1];
      const absoluteUrl = resolveUrl(baseUrl, url);

      // Check if URL is already processed
      if (this.cacheService.isUrlProcessed(absoluteUrl)) {
        if (this.debug) {
          console.log(`[DEBUG] Skip (already downloaded): ${absoluteUrl}`);
        }
        continue;
      }

      // Add to download list
      cssAssets.push({
        url,
        absoluteUrl,
        type: url.match(/\.(woff|woff2|ttf|eot|otf)$/i) ? 'font' :
              url.match(/\.(png|jpe?g|gif|svg|webp|ico)$/i) ? 'image' : 'other'
      });
    }

    if (cssAssets.length > 0) {
      if (this.debug) {
        console.log(`[DEBUG] Found ${cssAssets.length} assets in CSS: ${baseUrl}`);
      } else {
        console.log(`Found ${cssAssets.length} assets in CSS: ${baseUrl}`);
      }

      // Process all assets from CSS concurrently
      await this.processAssetsBatch(cssAssets, baseUrl);
    }
  }
}