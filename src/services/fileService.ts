import fs from 'fs-extra';
import path from 'path';

/**
 * Service for file operations
 */
export class FileService {
  /**
   * Save content to file
   */
  async saveToFile(filePath: string, content: string | Buffer | object): Promise<boolean> {
    try {
      await fs.ensureDir(path.dirname(filePath));

      if (typeof content === 'string') {
        await fs.writeFile(filePath, content, 'utf8');
      } else if (Buffer.isBuffer(content)) {
        await fs.writeFile(filePath, content);
      } else {
        await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf8');
      }

      console.log(`Saved: ${filePath}`);
      return true;
    } catch (error) {
      console.error(`Error saving file ${filePath}:`, (error as Error).message);
      return false;
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      return await fs.pathExists(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Read file content
   */
  async readFile(filePath: string): Promise<string | null> {
    try {
      if (await this.fileExists(filePath)) {
        return await fs.readFile(filePath, 'utf8');
      }
      return null;
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, (error as Error).message);
      return null;
    }
  }

  /**
   * Read JSON file content
   */
  async readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
    try {
      if (await this.fileExists(filePath)) {
        return await fs.readJson(filePath);
      }
      return null;
    } catch (error) {
      console.error(`Error reading JSON file ${filePath}:`, (error as Error).message);
      return null;
    }
  }

  /**
   * Ensure directory exists
   */
  async ensureDir(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath);
  }
}