/**
 * Node `fs`-backed SourceFileReader. Kept apart from the use case so tests can
 * inject an in-memory fake; `node:fs` is portable Node, not a runner API.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceFileReader } from './types';

export function createNodeSourceFileReader(): SourceFileReader {
  return {
    readFile(path: string): string {
      return readFileSync(path, 'utf8');
    },
    listApexClassFiles(dir: string): string[] {
      const found: string[] = [];
      const walk = (current: string): void => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
          const path = join(current, entry.name);
          if (entry.isDirectory()) {
            walk(path);
          } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.cls')) {
            found.push(path);
          }
        }
      };
      walk(dir);
      return found;
    },
  };
}
