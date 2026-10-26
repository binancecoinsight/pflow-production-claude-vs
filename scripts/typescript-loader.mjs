import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const TYPESCRIPT_CANDIDATES = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

/**
 * Preserve the repository's bundler-style extensionless TypeScript imports
 * when tests run through this esbuild-backed ESM loader instead of `tsx`.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    const isExtensionlessLocalImport =
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !/\.[a-z0-9]+$/i.test(specifier);

    if (!isExtensionlessLocalImport || !context.parentURL) {
      throw error;
    }

    for (const suffix of TYPESCRIPT_CANDIDATES) {
      const candidate = new URL(`${specifier}${suffix}`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return nextResolve(candidate.href, context);
      }
    }

    throw error;
  }
}

export async function load(url, context, nextLoad) {
  if (!url.endsWith('.ts') && !url.endsWith('.tsx')) {
    return nextLoad(url, context);
  }

  const source = await readFile(fileURLToPath(url), 'utf8');
  const transpiled = await transform(source, {
    format: 'esm',
    loader: url.endsWith('.tsx') ? 'tsx' : 'ts',
    sourcefile: fileURLToPath(url),
    sourcemap: false,
    target: 'es2022',
  });

  return {
    format: 'module',
    shortCircuit: true,
    source: transpiled.code,
  };
}
