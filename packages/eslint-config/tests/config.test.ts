import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import config from '../eslint.config.mjs';

async function lint(code: string) {
  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: config,
  });
  return eslint.lintText(code, { filePath: 'sample.ts' });
}

describe('@kiro-ai-bit/eslint-config', () => {
  it('exports a non-empty flat config array', () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);
  });

  it('reports unused variables in TypeScript', async () => {
    const [result] = await lint('const unused = 1;\nexport const used = 2;\n');
    const messages = result.messages.map((m) => m.ruleId);
    expect(messages).toContain('@typescript-eslint/no-unused-vars');
  });

  it('passes clean TypeScript', async () => {
    const [result] = await lint(
      'export function add(a: number, b: number): number {\n  return a + b;\n}\n',
    );
    expect(result.errorCount).toBe(0);
  });

  it('applies prettier-compatible rules (no stylistic conflicts)', async () => {
    const [result] = await lint('export const x=1\n');
    const stylistic = result.messages.filter((m) =>
      /indent|quotes|semi|comma-dangle|space/.test(String(m.ruleId)),
    );
    expect(stylistic).toEqual([]);
  });
});
