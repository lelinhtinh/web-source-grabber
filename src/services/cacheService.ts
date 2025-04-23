import fs from 'fs-extra';

/**
 * Class for managing cache of downloaded URLs
 */
export class CacheService {
  private cacheFile: string;
  private processedUrls: Set<string>;
  private forceDownload: boolean;

  /**
   * Initialize CacheService
   * @param cacheFile Path to cache file
   * @param forceDownload Whether to force redownload
   */
  constructor(cacheFile: string, forceDownload: boolean) {
    this.cacheFile = cacheFile;
    this.processedUrls = new Set();
    this.forceDownload = forceDownload;
  }

  /**
   * Load list of previously downloaded URLs
   */
  async loadProcessedUrls(): Promise<void> {
    if (this.forceDownload) {
      console.log('Force mode: Will redownload all files');
      return;
    }

    try {
      if (await fs.pathExists(this.cacheFile)) {
        const urlsData: string[] = await fs.readJson(this.cacheFile);
        if (Array.isArray(urlsData)) {
          urlsData.forEach(url => this.processedUrls.add(url));
          console.log(`Loaded ${this.processedUrls.size} URLs from cache file`);
        }
      }
    } catch (error) {
      console.error('Error reading cache file:', (error as Error).message);
    }
  }

  /**
   * Save list of downloaded URLs
   */
  async saveProcessedUrls(): Promise<void> {
    try {
      const urlsArray: string[] = Array.from(this.processedUrls);
      await fs.writeJson(this.cacheFile, urlsArray, { spaces: 2 });
      console.log(`Saved ${urlsArray.length} URLs to cache file`);
    } catch (error) {
      console.error('Error saving cache file:', (error as Error).message);
    }
  }

  /**
   * Check if a URL has been processed before
   */
  isUrlProcessed(url: string): boolean {
    return this.processedUrls.has(url);
  }

  /**
   * Mark a URL as processed
   */
  markUrlProcessed(url: string): void {
    this.processedUrls.add(url);
  }

  /**
   * Get the total number of processed URLs
   */
  get processedCount(): number {
    return this.processedUrls.size;
  }
}