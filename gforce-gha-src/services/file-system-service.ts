/**
 * The ONE place file I/O happens. `node:fs` is owned by this service; every
 * other layer reads the filesystem through it (and tests mock it at this
 * boundary).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export class FileSystemService {
  private static instance: FileSystemService;

  private constructor() {}

  public static getInstance(): FileSystemService {
    if (!FileSystemService.instance) {
      FileSystemService.instance = new FileSystemService();
    }
    return FileSystemService.instance;
  }

  /** Read a file as UTF-8; throws when unreadable. */
  public readFile(path: string): string {
    return readFileSync(path, 'utf8');
  }

  /** Recursively list paths of files under `dir` ending with `extension`. */
  public listFilesByExtension(dir: string, extension: string): readonly string[] {
    const normalizedExtension = extension.toLowerCase();
    const found: string[] = [];
    const walk = (current: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const path = join(current, entry.name);
        if (entry.isDirectory()) {
          walk(path);
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith(normalizedExtension)) {
          found.push(path);
        }
      }
    };
    walk(dir);
    return found;
  }

  public static resetInstance(): void {
    FileSystemService.instance = undefined as unknown as FileSystemService;
  }
}
