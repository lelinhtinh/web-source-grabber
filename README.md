# Web Source Grabber

A command-line tool for downloading website source code including JavaScript, CSS and related resources from source maps.

## Features

- Download JavaScript, CSS, and related resources from a website
- Automatically process and extract original source code through source maps
- Support for inline and external source maps
- Store downloaded resources in a directory structure based on URLs
- Support for concurrent downloading of multiple resources for increased performance
- Automatic retry of failed requests
- Limit the number of concurrent requests to avoid overload
- Cache downloaded resources to avoid unnecessary redownloading
- Display debug information to monitor the download process

## Installation

```bash
npm install -g web-source-grabber
```

Or use it without installation:

```bash
npx web-source-grabber <url>
```

## Usage

```bash
web-source-grabber <url> [options]
```

Example:

```bash
web-source-grabber https://example.com -o ./output -c 10
```

### Parameters

- `<url>`: URL of the website you want to download source code from (required)
- `-o, --output <dir>`: Directory to save results (default: current directory)
- `-f, --force`: Re-download all previously downloaded files (default: false)
- `-t, --timeout <ms>`: Maximum request timeout in milliseconds (default: 30000)
- `-r, --retries <number>`: Number of retries if a request fails (default: 3)
- `-c, --concurrency <number>`: Maximum number of concurrent requests (default: 5)
- `-d, --debug`: Display debug information (default: false)
- `-h, --help`: Display help information
- `-v, --version`: Display version

### Output Directory Structure

```tree
output/
  └── YYYY-MM-DD/           # Download date (if not using --force)
      └── example.com/      # Domain of URL
          ├── dist/         # Downloaded resources (js, css, images, ...)
          ├── src/          # Source code extracted from source maps
          └── downloaded_urls.json  # List of downloaded URLs
```

## Development

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Run in development environment

```bash
npm run dev -- https://example.com
```

### Watch mode (automatically rebuild when changes occur)

```bash
npm run watch
```

## License

ISC
