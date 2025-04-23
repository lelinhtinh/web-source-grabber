import path from 'path';
import URLParse from 'url-parse';

/**
 * Create absolute URL from relative URL
 */
export function resolveUrl(baseUrl: string, relativeUrl: string): string {
  // Check if relativeUrl is already an absolute URL
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }

  const parsedBase = new URLParse(baseUrl);

  // Handle relative URL starting with //
  if (relativeUrl.startsWith('//')) {
    return `${parsedBase.protocol}${relativeUrl}`;
  }

  // Handle relative URL starting with /
  if (relativeUrl.startsWith('/')) {
    return `${parsedBase.origin}${relativeUrl}`;
  }

  // Handle relative URL starting with ./ or ../
  if (relativeUrl.startsWith('./') || relativeUrl.startsWith('../') || relativeUrl.startsWith('.')) {
    try {
      return new URLParse(relativeUrl, baseUrl).href;
    } catch (error) {
      console.error(`Error resolving relative URL: ${relativeUrl}`, (error as Error).message);
      // Return original URL as fallback
      return baseUrl;
    }
  }

  // Handle relative URL not starting with / or ./
  return `${parsedBase.origin}/${relativeUrl}`;
}

/**
 * Create local file path from URL
 */
export function urlToFilePath(url: string, baseDir: string): string {
  const parsedUrl = new URLParse(url);
  let filePath = parsedUrl.pathname;

  // Handle path without extension
  if (!path.extname(filePath)) {
    filePath = path.join(filePath, 'index.html');
  }

  // Remove leading / if present
  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }

  return path.join(baseDir, filePath);
}