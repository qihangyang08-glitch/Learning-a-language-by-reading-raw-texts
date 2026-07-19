import * as FileSystem from 'expo-file-system';
import { BOOKS_DIR } from '../utils/constants';
import type { BookFormat } from '../types/book';
import { v4 as uuidv4 } from '../utils/uuid';

/**
 * Book storage service.
 * Manages copying imported books to the app's Books/ directory
 * and provides access to stored files.
 */
export class StorageService {
  private booksDir: string;

  constructor() {
    this.booksDir = `${FileSystem.documentDirectory}${BOOKS_DIR}/`;
  }

  /**
   * Ensure the Books directory exists.
   */
  async ensureDirectory(): Promise<void> {
    const dirInfo = await FileSystem.getInfoAsync(this.booksDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(this.booksDir, {
        intermediates: true,
      });
    }
  }

  /**
   * Copy an imported file into the Books/ directory.
   * Returns the new file path.
   */
  async importBook(
    sourceUri: string,
    fileName: string,
    format: BookFormat,
  ): Promise<{ filePath: string; bookId: string }> {
    await this.ensureDirectory();

    const bookId = uuidv4();
    const ext = fileName.split('.').pop() || format;
    const safeName = `${bookId}.${ext}`;
    const destPath = `${this.booksDir}${safeName}`;

    await FileSystem.copyAsync({
      from: sourceUri,
      to: destPath,
    });

    return { filePath: destPath, bookId };
  }

  /**
   * Delete a book file from storage.
   */
  async deleteBook(filePath: string): Promise<void> {
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      await FileSystem.deleteAsync(filePath, { idempotent: true });
    }
  }

  /**
   * Get the path to the Books directory.
   */
  getBooksDirectory(): string {
    return this.booksDir;
  }

  /**
   * Check if a book file exists.
   */
  async fileExists(filePath: string): Promise<boolean> {
    const info = await FileSystem.getInfoAsync(filePath);
    return info.exists;
  }
}
