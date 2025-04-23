/**
 * Source map data structure
 */
export interface SourceMapData {
  sources: string[];
  sourcesContent?: (string | null)[];
  version: number;
  names: string[];
  mappings: string;
  file?: string;
  sourceRoot?: string;
}

/**
 * Application configuration settings
 */
export interface AppConfig {
  targetUrl: string;
  outputDir: string;
  forceDownload: boolean;
  rootDir: string;
  outputRootDir: string;
  distDir: string;
  srcDir: string;
  cacheFile: string;
  domain: string;
  timeout: number;     // Request timeout in ms
  retries: number;     // Number of retry attempts
  concurrency: number; // Maximum concurrent requests
  debug: boolean;      // Debug mode flag
}

export interface FetchResult<T = string | object | null> {
  success: boolean;
  data: T;
  error?: Error;
}

export interface RetryError extends Error {
  attemptNumber: number;
  retriesLeft: number;
}

export interface AxiosRequestConfig {
  headers?: Record<string, string>;
  responseType?: 'arraybuffer' | 'blob' | 'document' | 'json' | 'text' | 'stream';
  timeout?: number;
  [key: string]: any;
}

export interface Asset {
  url: string;
  absoluteUrl: string;
  type: 'css' | 'js' | 'image' | 'font' | 'other';
}

export interface CommandOptions {
  output?: string;
  force?: boolean;
  timeout?: string;
  retries?: string;
  concurrency?: string;
  debug?: boolean;
}