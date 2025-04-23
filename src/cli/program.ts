import { Command } from 'commander';
import path from 'path';
import { createDateFolderName } from '../utils/path.js';
import { AppConfig, CommandOptions } from '../types/index.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

// Get current path to read package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(
  fs.readFileSync(path.join(dirname(__dirname), '..', 'package.json'), 'utf8')
);

const { version, description } = packageJson;

/**
 * Initialize CLI and process command line parameters
 */
export function setupCommandLine(): AppConfig | null {
  const program = new Command();
  let targetUrl = '';

  program
    .name('web-source-grabber')
    .description(description)
    .version(version)
    .argument('<url>', 'URL of the website to download source from')
    .option('-o, --output <dir>', 'Output directory (defaults to current directory)')
    .option('-f, --force', 'Force download all files even if previously downloaded', false)
    .option('-t, --timeout <ms>', 'Request timeout in milliseconds', '30000')
    .option('-r, --retries <number>', 'Number of retry attempts for failed requests', '3')
    .option('-c, --concurrency <number>', 'Maximum concurrent requests', '5')
    .option('-d, --debug', 'Show debug information', false)
    .helpOption('-h, --help', 'Show help')
    .action((url) => {
      targetUrl = url;
    });

  program.parse();

  const options = program.opts() as CommandOptions;

  if (!targetUrl) {
    program.help();
    return null;
  }

  return buildAppConfig(targetUrl, options);
}

/**
 * Build application config from command line parameters
 */
function buildAppConfig(targetUrl: string, options: CommandOptions): AppConfig {
  const outputDir = options.output || process.cwd();
  const forceDownload = options.force || false;
  const timeout = parseInt(options.timeout || '30000', 10);
  const retries = parseInt(options.retries || '3', 10);
  const concurrency = parseInt(options.concurrency || '5', 10);
  const debug = options.debug || false;

  const urlObj = new URL(targetUrl);
  const domain = urlObj.hostname.replace(/^www\./, '');

  const rootDir = path.resolve(outputDir);

  let outputRootDir: string;
  if (!forceDownload) {
    const dateFolder = createDateFolderName();
    outputRootDir = path.join(rootDir, 'output', dateFolder, domain);
  } else {
    outputRootDir = path.join(rootDir, 'output', domain);
  }

  const distDir = path.join(outputRootDir, 'dist');
  const srcDir = path.join(outputRootDir, 'src');
  const cacheFile = path.join(outputRootDir, 'downloaded_urls.json');

  return {
    targetUrl,
    outputDir,
    forceDownload,
    rootDir,
    outputRootDir,
    distDir,
    srcDir,
    cacheFile,
    domain,
    timeout,
    retries,
    concurrency,
    debug
  };
}