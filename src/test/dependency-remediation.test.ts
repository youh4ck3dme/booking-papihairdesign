/// <reference types="node" />
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const workboxRequire = createRequire(createRequire(require.resolve('vite-plugin-pwa')).resolve('workbox-build'));
const resolveEntry = workboxRequire.resolve('@rollup/plugin-node-resolve');

it('retains independent frozen resolver defaults in patched CJS and ESM exports', async () => {
  const cjs = workboxRequire('@rollup/plugin-node-resolve');
  const esm = await import(pathToFileURL(resolveEntry.replace('/dist/cjs/', '/dist/es/')).href);
  for (const entry of [cjs, esm]) {
    expect(entry.DEFAULTS.extensions).toEqual(['.mjs', '.js', '.json', '.node']);
    expect(entry.DEFAULTS.moduleDirectories).toEqual(['node_modules']);
    expect(entry.DEFAULTS.allowExportsFolderMapping).toBe(true);
    expect(Object.isFrozen(entry.DEFAULTS)).toBe(true);
    expect(Object.isFrozen(entry.DEFAULTS.extensions)).toBe(true);
    expect(entry.nodeResolve({ extensions: ['.js'] }).name).toBe('node-resolve');
    expect(entry.DEFAULTS.extensions).toHaveLength(4);
  }
  // pnpm can retain an unrelated hoisted old module until a clean install;
  // verify the consumed entrypoints and frozen graph, not ambient resolution.
  for (const entry of [resolveEntry, resolveEntry.replace('/dist/cjs/', '/dist/es/')]) {
    expect(await readFile(entry, 'utf8')).not.toMatch(/(?:require\(['"]deepmerge['"]\)|from ['"]deepmerge['"])/);
  }
  expect(await readFile(join(process.cwd(), 'pnpm-lock.yaml'), 'utf8')).not.toMatch(/^\s+deepmerge@/m);
});

it('actually resolves and bundles a package using the patched resolver', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'papi-node-resolve-'));
  try {
    await mkdir(join(directory, 'node_modules', 'fixture-dep'), { recursive: true });
    await writeFile(join(directory, 'node_modules', 'fixture-dep', 'package.json'), JSON.stringify({ name: 'fixture-dep', version: '1.0.0', type: 'module', main: 'index.js' }));
    await writeFile(join(directory, 'node_modules', 'fixture-dep', 'index.js'), 'export const fixtureValue = "resolved-package";');
    await writeFile(join(directory, 'main.js'), 'export { fixtureValue } from "fixture-dep";');
    const { rollup } = workboxRequire('rollup');
    const { nodeResolve } = workboxRequire('@rollup/plugin-node-resolve');
    const bundle = await rollup({ input: join(directory, 'main.js'), plugins: [nodeResolve()] });
    try {
      const { output } = await bundle.generate({ format: 'es' });
      expect(output[0].code).toContain('resolved-package');
      expect(output[0].code).not.toContain('from "fixture-dep"');
    } finally { await bundle.close(); }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
