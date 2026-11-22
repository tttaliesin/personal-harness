import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLE_PATH, bundleOptions } from './lib/bundle.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const options = bundleOptions(root);
await mkdir(dirname(options.outfile), { recursive: true });
await build(options);
process.stdout.write(`설치용 CLI 번들 빌드 완료: ${BUNDLE_PATH}\n`);
