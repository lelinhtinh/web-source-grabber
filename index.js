const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs-extra');
const path = require('path');
const URL = require('url-parse');
const sourceMap = require('source-map');

// Phân tích tham số dòng lệnh
const args = process.argv.slice(2);
let targetUrl = null;
let outputDir = null; // Thư mục gốc để lưu trữ kết quả
let forceDownload = false; // Có tải lại các file đã tải trước đó không

// Xử lý các tham số
for (let i = 0; i < args.length; i++) {
  const arg = args[i];

  if (arg === '--output' || arg === '-o') {
    if (i + 1 < args.length) {
      outputDir = args[i + 1];
      i++; // Bỏ qua tham số tiếp theo vì đã xử lý
    }
  } else if (arg === '--force' || arg === '-f') {
    forceDownload = true;
  } else if (!targetUrl && !arg.startsWith('-')) {
    // Giả định tham số đầu tiên không bắt đầu bằng - là URL
    targetUrl = arg;
  }
}

// Kiểm tra URL
if (!targetUrl) {
  console.error('Vui lòng cung cấp URL. Ví dụ: node index.js https://example.com/ [--output /path/to/dir] [--force]');
  process.exit(1);
}

// Tạo tên thư mục output dựa trên domain của URL
const urlObj = new URL(targetUrl);
const domain = urlObj.hostname.replace(/^www\./, '');

// Thư mục gốc lưu trữ kết quả
const ROOT_DIR = outputDir ? path.resolve(outputDir) : __dirname;

// Nếu không sử dụng force, tạo thư mục theo ngày, ngược lại sử dụng output trực tiếp
let OUTPUT_DIR;
if (!forceDownload) {
  const dateFolder = createDateFolderName();
  OUTPUT_DIR = path.join(ROOT_DIR, 'output', dateFolder, domain);
} else {
  OUTPUT_DIR = path.join(ROOT_DIR, 'output', domain);
}

const DIST_DIR = path.join(OUTPUT_DIR, 'dist');
const SRC_DIR = path.join(OUTPUT_DIR, 'src');
const CACHE_FILE = path.join(OUTPUT_DIR, 'downloaded_urls.json');

// Danh sách các URL đã xử lý để tránh trùng lặp
const processedUrls = new Set();

// Đọc danh sách URL đã tải trước đó (nếu tồn tại và không dùng force)
async function loadProcessedUrls() {
  if (forceDownload) {
    console.log('Chế độ force: Sẽ tải lại tất cả các file');
    return;
  }

  try {
    if (await fs.pathExists(CACHE_FILE)) {
      const urlsData = await fs.readJson(CACHE_FILE);
      if (Array.isArray(urlsData)) {
        urlsData.forEach(url => processedUrls.add(url));
        console.log(`Đã tải ${processedUrls.size} URL từ cache file`);
      }
    }
  } catch (error) {
    console.error('Lỗi khi đọc cache file:', error.message);
  }
}

// Lưu danh sách URL đã tải
async function saveProcessedUrls() {
  try {
    const urlsArray = Array.from(processedUrls);
    await fs.writeJson(CACHE_FILE, urlsArray, { spaces: 2 });
    console.log(`Đã lưu ${urlsArray.length} URL vào cache file`);
  } catch (error) {
    console.error('Lỗi khi lưu cache file:', error.message);
  }
}

// Kiểm tra liệu một URL đã được xử lý trước đó chưa
function isUrlProcessed(url) {
  return processedUrls.has(url);
}

// Đánh dấu một URL đã được xử lý
function markUrlProcessed(url) {
  processedUrls.add(url);
}

/**
 * Tạo tên thư mục dựa trên ngày hiện tại
 */
function createDateFolderName() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Tải nội dung từ URL
 */
async function fetchContent(url) {
  try {
    console.log(`Đang tải: ${url}`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      responseType: url.endsWith('.map') ? 'json' : 'text'
    });
    return response.data;
  } catch (error) {
    console.error(`Lỗi khi tải ${url}:`, error.message);
    return null;
  }
}

/**
 * Lưu nội dung vào file
 */
async function saveToFile(filePath, content) {
  try {
    await fs.ensureDir(path.dirname(filePath));

    if (typeof content === 'string') {
      await fs.writeFile(filePath, content, 'utf8');
    } else {
      // Trường hợp binary data
      await fs.writeFile(filePath, content);
    }
    console.log(`Đã lưu: ${filePath}`);
    return true;
  } catch (error) {
    console.error(`Lỗi khi lưu file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Tạo URL tuyệt đối từ URL tương đối
 */
function resolveUrl(baseUrl, relativeUrl) {
  // Kiểm tra nếu relativeUrl đã là URL tuyệt đối
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }

  const parsedBase = new URL(baseUrl);

  // Xử lý URL tương đối bắt đầu bằng //
  if (relativeUrl.startsWith('//')) {
    return `${parsedBase.protocol}${relativeUrl}`;
  }

  // Xử lý URL tương đối bắt đầu bằng /
  if (relativeUrl.startsWith('/')) {
    return `${parsedBase.origin}${relativeUrl}`;
  }

  // Xử lý URL tương đối bắt đầu bằng ./
  if (relativeUrl.startsWith('./') || relativeUrl.startsWith('../') || relativeUrl.startsWith('.')) {
    try {
      return new URL(relativeUrl, baseUrl).href;
    } catch (error) {
      console.error(`Lỗi khi giải quyết URL tương đối: ${relativeUrl}`, error.message);
    }
  }

  // Xử lý URL tương đối không bắt đầu bằng / hoặc ./
  return `${parsedBase.origin}/${relativeUrl}`;
}

/**
 * Tạo đường dẫn file local từ URL
 */
function urlToFilePath(url, baseDir) {
  const parsedUrl = new URL(url);
  let filePath = parsedUrl.pathname;

  // Xử lý đường dẫn không có extension
  if (!path.extname(filePath)) {
    filePath = path.join(filePath, 'index.html');
  }

  // Loại bỏ dấu / đầu tiên nếu có
  if (filePath.startsWith('/')) {
    filePath = filePath.substring(1);
  }

  return path.join(baseDir, filePath);
}

/**
 * Quét và xử lý các file CSS và JS từ HTML
 */
async function processHtml(htmlContent, baseUrl) {
  const $ = cheerio.load(htmlContent);
  const cssLinks = [];
  const jsLinks = [];

  // Tìm các thẻ link CSS
  $('link[rel="stylesheet"], link[as="style"]').each((_, element) => {
    const href = $(element).attr('href');
    if (href && !href.startsWith('data:')) {
      cssLinks.push(href);
    }
  });

  // Tìm các thẻ script JS
  $('script').each((_, element) => {
    const src = $(element).attr('src');
    if (src && !src.startsWith('data:')) {
      jsLinks.push(src);
    }
  });

  // Thêm các file CSS được import trong các thẻ style
  $('style').each((_, element) => {
    const cssContent = $(element).html();
    if (cssContent) {
      const importMatches = cssContent.match(/@import\s+["']([^"']+)["']/g);
      if (importMatches) {
        importMatches.forEach(match => {
          const importUrl = match.match(/@import\s+["']([^"']+)["']/)[1];
          cssLinks.push(importUrl);
        });
      }
    }
  });

  console.log(`Tìm thấy ${cssLinks.length} file CSS và ${jsLinks.length} file JS`);

  // Xử lý các file CSS
  for (const cssLink of cssLinks) {
    await processAsset(cssLink, baseUrl, 'css');
  }

  // Xử lý các file JS
  for (const jsLink of jsLinks) {
    await processAsset(jsLink, baseUrl, 'js');
  }
}

/**
 * Xử lý tải xuống asset (CSS/JS)
 */
async function processAsset(assetUrl, baseUrl, type) {
  const absoluteUrl = resolveUrl(baseUrl, assetUrl);

  // Kiểm tra nếu URL đã được xử lý và không phải chế độ force
  if (!forceDownload && isUrlProcessed(absoluteUrl)) {
    console.log(`Bỏ qua (đã tải trước đó): ${absoluteUrl}`);
    return;
  }

  // Tải asset
  const content = await fetchContent(absoluteUrl);
  if (!content) return;

  // Lưu asset
  const filePath = urlToFilePath(absoluteUrl, DIST_DIR);
  await saveToFile(filePath, content);

  // Đánh dấu URL đã được xử lý
  markUrlProcessed(absoluteUrl);

  // Xử lý source map nếu là JS hoặc CSS
  if (type === 'js' || type === 'css') {
    await processSourceMap(content, absoluteUrl, filePath);

    // Nếu là CSS, xử lý các URL trong nội dung CSS
    if (type === 'css') {
      await processCssUrls(content, absoluteUrl);
    }
  }
}

/**
 * Xử lý source map
 */
async function processSourceMap(content, assetUrl, assetFilePath) {
  // Tìm URL source map trong nội dung
  let sourceMapUrl = null;
  let isInlineSourceMap = false;
  let inlineSourceMapContent = null;

  // Tìm theo định dạng //# sourceMappingURL=
  const sourceMappingMatch = content.match(/\/\/# sourceMappingURL=([^\s'"]+)/);
  if (sourceMappingMatch) {
    sourceMapUrl = sourceMappingMatch[1];

    // Kiểm tra xem có phải là source map inline không
    if (sourceMapUrl.startsWith('data:application/json;base64,')) {
      isInlineSourceMap = true;
      try {
        const base64Data = sourceMapUrl.replace('data:application/json;base64,', '');
        inlineSourceMapContent = JSON.parse(Buffer.from(base64Data, 'base64').toString());
        console.log(`Tìm thấy source map inline cho ${assetUrl}`);
      } catch (error) {
        console.error(`Lỗi khi giải mã source map inline: ${error.message}`);
      }
    }
  } else {
    // Tìm theo định dạng /*# sourceMappingURL= */ (cho CSS)
    const cssSourceMappingMatch = content.match(/\/\*# sourceMappingURL=([^\s*]+)\s*\*\//);
    if (cssSourceMappingMatch) {
      sourceMapUrl = cssSourceMappingMatch[1];

      // Kiểm tra xem có phải là source map inline không (CSS)
      if (sourceMapUrl.startsWith('data:application/json;base64,')) {
        isInlineSourceMap = true;
        try {
          const base64Data = sourceMapUrl.replace('data:application/json;base64,', '');
          inlineSourceMapContent = JSON.parse(Buffer.from(base64Data, 'base64').toString());
          console.log(`Tìm thấy source map inline cho ${assetUrl}`);
        } catch (error) {
          console.error(`Lỗi khi giải mã source map inline: ${error.message}`);
        }
      }
    }
  }

  if (isInlineSourceMap && inlineSourceMapContent) {
    // Lưu source map inline
    const mapFilePath = assetFilePath + '.map';
    await saveToFile(mapFilePath, JSON.stringify(inlineSourceMapContent, null, 2));

    // Xử lý các file nguồn trong source map inline
    await extractSourcesFromMap(inlineSourceMapContent, assetUrl);
    return;
  }

  // Nếu không tìm thấy source map URL trong nội dung hoặc không phải inline, thử tải map file với đuôi .map
  if (!sourceMapUrl || isInlineSourceMap) {
    sourceMapUrl = assetUrl + '.map';
  } else if (!isInlineSourceMap) {
    sourceMapUrl = resolveUrl(assetUrl, sourceMapUrl);
  }

  // Tải source map
  try {
    const mapContent = await fetchContent(sourceMapUrl);
    if (!mapContent) return;

    // Lưu source map
    const mapFilePath = assetFilePath + '.map';
    await saveToFile(mapFilePath, JSON.stringify(mapContent, null, 2));

    // Xử lý các file nguồn trong source map
    await extractSourcesFromMap(mapContent, sourceMapUrl);
  } catch (error) {
    console.log(`Không tìm thấy source map cho ${assetUrl}`);
  }
}

/**
 * Xử lý các URL trong CSS
 */
async function processCssUrls(cssContent, baseUrl) {
  // Tìm tất cả các URL trong CSS (có và không có dấu ngoặc đơn hoặc ngoặc kép)
  const urlRegex = /url\(['"]?((?!data:)[^'")\s]+)['"]?\)/g;
  const urlMatches = cssContent.match(urlRegex);
  if (!urlMatches) return;

  for (const urlMatch of urlMatches) {
    // Trích xuất URL từ cú pháp url()
    const urlRegexSingle = /url\(['"]?((?!data:)[^'")\s]+)['"]?\)/;
    const matches = urlMatch.match(urlRegexSingle);
    if (!matches || !matches[1]) continue;

    const url = matches[1];
    const absoluteUrl = resolveUrl(baseUrl, url);

    // Không xử lý URL đã xử lý
    if (!forceDownload && isUrlProcessed(absoluteUrl)) {
      console.log(`Bỏ qua (đã tải trước đó): ${absoluteUrl}`);
      continue;
    }

    // Tải và lưu file
    try {
      const content = await fetchContent(absoluteUrl);
      if (!content) continue;

      const filePath = urlToFilePath(absoluteUrl, DIST_DIR);
      await saveToFile(filePath, content);

      markUrlProcessed(absoluteUrl);
    } catch (error) {
      console.error(`Lỗi khi xử lý URL CSS ${absoluteUrl}:`, error.message);
    }
  }
}

/**
 * Trích xuất các file nguồn từ source map
 */
async function extractSourcesFromMap(mapContent, mapUrl) {
  try {
    // Parse source map
    const consumer = await new sourceMap.SourceMapConsumer(
      typeof mapContent === 'string' ? mapContent : JSON.stringify(mapContent)
    );

    const sourceContentList = consumer.sourcesContent || [];
    const sourceList = consumer.sources || [];

    // Lưu các file nguồn
    for (let i = 0; i < sourceList.length; i++) {
      const sourceRelativePath = sourceList[i];
      const sourceContent = sourceContentList[i];

      if (sourceContent) {
        // Tạo đường dẫn tương đối cho file nguồn
        let sourcePath = sourceRelativePath;

        // Xử lý đường dẫn webpack://
        if (sourcePath.startsWith('webpack://')) {
          sourcePath = sourcePath.replace('webpack://', '');
          // Loại bỏ tên project nếu có
          const parts = sourcePath.split('/');
          if (parts.length > 1 && parts[0].startsWith('.')) {
            parts.shift();
          }
          sourcePath = parts.join('/');
        }

        // Loại bỏ dấu / ở đầu nếu có
        if (sourcePath.startsWith('/')) {
          sourcePath = sourcePath.substring(1);
        }

        // Lưu file nguồn
        const sourceFilePath = path.join(SRC_DIR, sourcePath);
        await saveToFile(sourceFilePath, sourceContent);
      }
    }

    consumer.destroy();
  } catch (error) {
    console.error('Lỗi khi xử lý source map:', error.message);
  }
}

/**
 * Hàm chính
 */
async function main() {
  try {
    // Hiển thị cấu hình
    console.log(`Cấu hình:`);
    console.log(`- URL: ${targetUrl}`);
    console.log(`- Thư mục gốc: ${ROOT_DIR}`);
    console.log(`- Thư mục output: ${OUTPUT_DIR}`);
    console.log(`- Chế độ Force: ${forceDownload ? 'Bật' : 'Tắt'}`);
    console.log(`- Cache file: ${CACHE_FILE}`);

    // Tạo thư mục dist và src
    await fs.ensureDir(DIST_DIR);
    await fs.ensureDir(SRC_DIR);

    // Đọc danh sách URL đã tải từ cache file (nếu không dùng force)
    await loadProcessedUrls();

    console.log(`Bắt đầu tải từ ${targetUrl}`);

    // Tải trang web gốc
    const htmlContent = await fetchContent(targetUrl);
    if (!htmlContent) {
      console.error('Không thể tải trang web gốc.');
      return;
    }

    // Lưu trang web gốc
    const indexHtmlPath = path.join(DIST_DIR, 'index.html');
    await saveToFile(indexHtmlPath, htmlContent);
    markUrlProcessed(targetUrl);

    // Xử lý các file CSS và JS
    await processHtml(htmlContent, targetUrl);

    // Lưu danh sách URL đã tải
    await saveProcessedUrls();

    console.log('Quá trình tải xuống hoàn tất!');
    console.log(`Các file đã được lưu vào thư mục ${OUTPUT_DIR}/dist`);
    console.log(`Mã nguồn gốc đã được lưu vào thư mục ${OUTPUT_DIR}/src`);
    console.log(`Danh sách URL đã tải được lưu vào ${CACHE_FILE}`);
  } catch (error) {
    console.error('Lỗi:', error.message);
  }
}

main();