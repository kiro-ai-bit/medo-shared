import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgDir = fileURLToPath(new URL('..', import.meta.url));
const presets = ['base.json', 'node.json', 'nextjs.json'];

function readPreset(name: string) {
  return JSON.parse(readFileSync(join(pkgDir, name), 'utf8')) as {
    compilerOptions: Record<string, unknown>;
    extends?: string;
  };
}

describe('@kiro-ai-bit/tsconfig presets', () => {
  it('ships base/node/nextjs presets', () => {
    for (const name of presets) {
      expect(() => readPreset(name)).not.toThrow();
    }
  });

  it('base preset enforces strict + noEmit + ES modules', () => {
    const base = readPreset('base.json').compilerOptions;
    expect(base.strict).toBe(true);
    expect(base.noEmit).toBe(true);
    expect(base.target).toBe('ES2022');
    expect(base.module).toBe('NodeNext');
    expect(base.moduleResolution).toBe('NodeNext');
    expect(base.skipLibCheck).toBe(true);
    expect(base.forceConsistentCasingInFileNames).toBe(true);
    expect(base.verbatimModuleSyntax).toBe(true);
  });

  it('node preset adds node types', () => {
    const node = readPreset('node.json');
    expect(node.extends).toBe('./base.json');
    expect(node.compilerOptions.types).toEqual(['node']);
  });

  it('nextjs preset enables JSX + bundler resolution', () => {
    const next = readPreset('nextjs.json');
    expect(next.extends).toBe('./base.json');
    expect(next.compilerOptions.jsx).toBe('preserve');
    expect(next.compilerOptions.module).toBe('ESNext');
    expect(next.compilerOptions.moduleResolution).toBe('Bundler');
  });

  it('a consumer tsconfig extending base passes tsc --noEmit on strict-clean code', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tsconfig-test-'));
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
      writeFileSync(
        join(dir, 'tsconfig.json'),
        JSON.stringify({
          extends: join(pkgDir, 'base.json').replaceAll('\\', '/'),
          compilerOptions: { types: [] },
          include: ['src'],
        }),
      );
      execFileSync('mkdir', [join(dir, 'src')], { shell: true });
      writeFileSync(
        join(dir, 'src', 'ok.ts'),
        'export const answer: number = 42;\nexport function double(n: number): number {\n  return n * 2;\n}\n',
      );
      const tsc = join(pkgDir, '..', '..', 'node_modules', 'typescript', 'bin', 'tsc');
      expect(() =>
        execFileSync(process.execPath, [tsc, '--noEmit', '-p', join(dir, 'tsconfig.json')], {
          stdio: 'pipe',
        }),
      ).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
