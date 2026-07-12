import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createNodeSourceFileReader } from '../src/actions/findRelevantTests/nodeSourceFileReader';

describe('createNodeSourceFileReader', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sf-find-tests-'));
    mkdirSync(join(dir, 'classes', 'nested'), { recursive: true });
    writeFileSync(join(dir, 'classes', 'A.cls'), 'public class A {}');
    writeFileSync(join(dir, 'classes', 'nested', 'B.cls'), '@IsTest class B {}');
    writeFileSync(join(dir, 'classes', 'A.cls-meta.xml'), '<xml/>');
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('lists .cls files recursively, ignoring meta files', () => {
    const files = createNodeSourceFileReader().listApexClassFiles(dir).sort();
    expect(files).toEqual([join(dir, 'classes', 'A.cls'), join(dir, 'classes', 'nested', 'B.cls')]);
  });

  it('reads a file as UTF-8', () => {
    expect(createNodeSourceFileReader().readFile(join(dir, 'classes', 'A.cls'))).toBe(
      'public class A {}',
    );
  });
});
