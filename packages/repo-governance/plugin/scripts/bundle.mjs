import { readFile, readdir, lstat, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const manifestName = 'skills/repo-governance/assets/bundle.json';
export const bundlePath = join(root, manifestName);
export const sha256 = data => createHash('sha256').update(data).digest('hex');

export async function resourcePaths(directory = root) {
  const files = [];
  async function visit(prefix) {
    for (const name of await readdir(join(directory, prefix))) {
      const path = join(prefix, name);
      const item = await lstat(join(directory, path));
      if (item.isSymbolicLink()) throw new Error('Plugin files cannot be symbolic links: ' + path);
      if (item.isDirectory()) await visit(path);
      else if (item.isFile()) files.push(path.split(sep).join('/'));
      else throw new Error('Plugin files must be regular files: ' + path);
    }
  }
  await visit('');
  return files.sort();
}

export async function readPackageIdentity(directory = root) {
  const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string')
    throw new Error('Package name and version are required.');
  for (const path of ['.codex-plugin/plugin.json', '.claude-plugin/plugin.json']) {
    const plugin = JSON.parse(await readFile(join(directory, path), 'utf8'));
    if (plugin.name !== pkg.name || plugin.version !== pkg.version) throw new Error('Package/plugin identity differs: ' + path);
  }
  return pkg;
}

function npmCli() {
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(dirname(process.execPath)), 'lib/node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find(path => path && /npm-cli\.[cm]?js$/.test(path) && existsSync(path));
  if (!cli) throw new Error('Cannot locate npm-cli.js. Run npm run verify:bundle.');
  return cli;
}

export async function verifyBundle({ pack = true, directory = root } = {}) {
  const actualRoot = await realpath(directory);
  const pkg = await readPackageIdentity(actualRoot);
  const bytes = await readFile(join(actualRoot, manifestName));
  const manifest = JSON.parse(bytes);
  if (manifest.schemaVersion !== 1 || manifest.checkerSchemaVersion !== 3 || manifest.version !== pkg.version || manifest.root !== '../../..' || !Array.isArray(manifest.files)) throw new Error('Invalid bundle manifest identity or schema');

  const paths = await resourcePaths(actualRoot);
  const records = paths.filter(path => path !== manifestName);
  if (JSON.stringify(manifest.files.map(file => file.path)) !== JSON.stringify(records))
    throw new Error('Plugin file inventory differs from the bundle manifest. Review the plugin files and run npm run bundle:build from the source checkout.');
  for (const item of manifest.files) {
    const path = await realpath(join(actualRoot, item.path));
    const rel = relative(actualRoot, path);
    if (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('Bundle path escapes its root: ' + item.path);
    if (sha256(await readFile(path)) !== item.sha256) throw new Error('Bundle bytes differ: ' + item.path);
  }

  let packedFiles;
  if (pack) {
    const report = execFileSync(process.execPath, [npmCli(), 'pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: actualRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024, timeout: 60000 });
    const packed = JSON.parse(report);
    if (packed.length !== 1 || !Array.isArray(packed[0].files)) throw new Error('Unexpected npm pack output');
    const members = new Set(packed[0].files.map(file => file.path));
    const missing = paths.filter(path => !members.has(path));
    if (missing.length) throw new Error('npm pack omits bundle resources: ' + missing.join(', '));
    const expected = new Set(paths);
    const unexpected = [...members].filter(path => !expected.has(path));
    if (unexpected.length) throw new Error('npm pack includes resources outside the plugin tree: ' + unexpected.join(', '));
    packedFiles = members.size;
  }
  return { operation: 'verify-bundle', version: manifest.version, files: manifest.files.length, packedFiles, sha256: sha256(bytes), decision: 'pass', scope: 'bundle-bytes-and-package' };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const operation = process.argv[2];
    if (process.argv.length !== 3 || !['verify', 'assert-runtime'].includes(operation)) throw new Error('Use bundle.mjs verify or assert-runtime.');
    const report = operation === 'assert-runtime'
      ? { ...await verifyBundle({ pack: false, directory: process.env.REPO_GOVERNANCE_INSTALL_SOURCE || root }), operation: 'verify-install-source' }
      : await verifyBundle();
    process.stdout.write(JSON.stringify(report) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ operation: 'bundle', decision: 'error', message: error.message }) + '\n');
    process.exitCode = 1;
  }
}
