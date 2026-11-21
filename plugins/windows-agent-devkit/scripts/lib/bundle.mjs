import { join } from 'node:path';

export const BUNDLE_PATH = 'dist/cli.mjs';

export function bundleOptions(root, outputRoot = root) {
  return {
    absWorkingDir: root,
    entryPoints: ['src/cli.mjs'],
    outfile: join(outputRoot, BUNDLE_PATH),
    platform: 'node',
    target: 'node24',
    format: 'esm',
    bundle: true,
    banner: { js: 'import { createRequire as __devkitCreateRequire } from "node:module"; const require = __devkitCreateRequire(import.meta.url);' },
    legalComments: 'eof',
    sourcemap: false,
    metafile: true,
  };
}
