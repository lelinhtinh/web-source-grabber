#!/usr/bin/env node

import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { setupCommandLine } from './cli/program.js';
import { FileService } from './services/fileService.js';
import { FetchService } from './services/fetchService.js';
import { CacheService } from './services/cacheService.js';
import { SourceMapService } from './services/sourceMapService.js';
import { HtmlService } from './services/htmlService.js';

// Get current path to read package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Display banner and configuration information
 * @param config Application configuration
 */
function displayBanner(config: any) {
  // Read version information from package.json
  const packageInfo = JSON.parse(
    fs.readFileSync(path.join(dirname(__dirname), 'package.json'), 'utf8')
  );

  console.log(`
  ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
  ┃                 Web Source Grabber v${packageInfo.version}                ┃
  ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

  Configuration:
  - URL: ${config.targetUrl}
  - Domain: ${config.domain}
  - Root directory: ${config.rootDir}
  - Output directory: ${config.outputRootDir}
  - Force mode: ${config.forceDownload ? 'On' : 'Off'}
  - Timeout: ${config.timeout}ms
  - Retries: ${config.retries}
  - Concurrency: ${config.concurrency}
  - Debug: ${config.debug ? 'On' : 'Off'}
  `);
}

/**
 * Main application function
 */
async function main(): Promise<void> {
  try {
    // Process command line parameters using commander
    const config = setupCommandLine();

    if (!config) {
      return;
    }

    // Display banner and configuration information
    displayBanner(config);

    // Initialize services
    const fileService = new FileService();
    const fetchService = new FetchService({
      timeout: config.timeout,
      retries: config.retries,
      concurrency: config.concurrency,
      debug: config.debug
    });
    const cacheService = new CacheService(config.cacheFile, config.forceDownload);
    const sourceMapService = new SourceMapService(fileService, fetchService);
    const htmlService = new HtmlService(
      fileService,
      fetchService,
      sourceMapService,
      cacheService,
      config.distDir,
      config.srcDir,
      config.debug
    );

    // Create dist and src directories
    await fileService.ensureDir(config.distDir);
    await fileService.ensureDir(config.srcDir);

    // Read list of downloaded URLs from cache file (if not using force)
    await cacheService.loadProcessedUrls();

    console.log(`\n Starting download from ${config.targetUrl}`);

    // Download original web page
    const startTime = Date.now();
    const htmlResult = await fetchService.fetchContent<string>(config.targetUrl);
    if (!htmlResult.success || !htmlResult.data) {
      console.error('Unable to download original web page or content is not text.');
      return;
    }

    const htmlContent = htmlResult.data;

    // Save original web page
    const indexHtmlPath = path.join(config.distDir, 'index.html');
    await fileService.saveToFile(indexHtmlPath, htmlContent);
    cacheService.markUrlProcessed(config.targetUrl);

    // Process CSS and JS files
    await htmlService.processHtml(htmlContent, config.targetUrl);

    // Save list of downloaded URLs
    await cacheService.saveProcessedUrls();

    // Calculate runtime
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    console.log('\n---------------------------------------------------------');
    console.log(`✓ Download completed in ${duration.toFixed(2)} seconds!`);
    console.log(`✓ Downloaded ${cacheService.processedCount} resources`);
    console.log(`✓ Files have been saved to ${config.outputRootDir}/dist`);
    console.log(`✓ Original source code has been saved to ${config.outputRootDir}/src`);
    console.log(`✓ List of downloaded URLs has been saved to ${config.cacheFile}`);
    console.log('---------------------------------------------------------\n');
  } catch (error) {
    console.error('\n❌ Error:', (error as Error).message);
    process.exit(1);
  }
}

// Run main function
main();