import axios from 'axios';
import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { FetchResult, RetryError, AxiosRequestConfig } from '../types/index.js';

/**
 * Service for downloading content from URLs
 */
export class FetchService {
  private readonly userAgent: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly concurrency: number;
  private readonly debug: boolean;
  private limiter: ReturnType<typeof pLimit>;

  constructor(options: {
    userAgent?: string;
    timeout?: number;
    retries?: number;
    concurrency?: number;
    debug?: boolean;
  } = {}) {
    this.userAgent = options.userAgent ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 3;
    this.concurrency = options.concurrency || 5;
    this.debug = options.debug || false;

    this.limiter = pLimit(this.concurrency);

    if (this.debug) {
      console.log(`[DEBUG] FetchService initialized with config:`);
      console.log(`[DEBUG] - User-Agent: ${this.userAgent}`);
      console.log(`[DEBUG] - Timeout: ${this.timeout}ms`);
      console.log(`[DEBUG] - Retries: ${this.retries}`);
      console.log(`[DEBUG] - Concurrency: ${this.concurrency}`);
    }
  }

  /**
   * Download content from URL with retry and concurrency limit
   */
  async fetchContent<T = string | object | null>(url: string, options?: AxiosRequestConfig): Promise<FetchResult<T>> {
    return this.limiter(async () => {
      try {
        const result = await pRetry(
          async () => {
            if (this.debug) {
              console.log(`[DEBUG] Downloading: ${url}`);
            } else {
              console.log(`Downloading: ${url}`);
            }

            const config: AxiosRequestConfig = {
              headers: {
                'User-Agent': this.userAgent
              },
              responseType: url.endsWith('.map') ? 'json' : 'text',
              timeout: this.timeout,
              ...options
            };

            const response = await axios.get(url, config);

            if (this.debug) {
              console.log(`[DEBUG] Download successful: ${url}`);
            }

            return {
              success: true,
              data: response.data as T
            };
          },
          {
            retries: this.retries,
            onFailedAttempt: (error: RetryError) => {
              const { attemptNumber, retriesLeft } = error;
              console.error(`Attempt ${attemptNumber} failed for ${url}. ${retriesLeft} attempts remaining.`);
              console.error(`Error: ${error.message}`);
            }
          }
        );

        return result;
      } catch (error: unknown) {
        console.error(`All attempts to download ${url} failed:`, (error as Error).message);
        return {
          success: false,
          data: null as unknown as T,
          error: error as Error
        };
      }
    });
  }

  /**
   * Download multiple URLs concurrently with limits
   */
  async fetchMultiple<T = string | object | null>(
    urls: string[],
    options?: AxiosRequestConfig
  ): Promise<FetchResult<T>[]> {
    if (this.debug) {
      console.log(`[DEBUG] Downloading ${urls.length} URLs with concurrency=${this.concurrency}`);
    }

    const promises = urls.map(url => this.fetchContent<T>(url, options));
    return Promise.all(promises);
  }
}