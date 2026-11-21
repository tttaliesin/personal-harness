import { spawnSync } from 'node:child_process';
import { lstat, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, bundlePath, manifestName, readPackageIdentity, resourcePaths, sha256, verifyBundle } from '../plugin/scripts/bundle.mjs';
import { nativeGitEnvironment } from '../plugin/skills/repo-governance/scripts/native-product.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));

async function exists(path) {
  try { await lstat(path); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

async function hasGitMetadata(directory) {
  let current = await realpath(directory);
  while (!(await exists(join(current, '.git')))) {
    const parent = dirname(current);
    if (parent === current) return false;
    current = parent;
  }
  return true;
}

function git(args, { input, accepted = [0] } = {}) {
  const result = spawnSync('git', ['-C', repository, '-c', 'core.fsmonitor=false', ...args], {
    input, encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024, env: nativeGitEnvironment()
  });
  if (result.error) throw result.error;
  if (!accepted.includes(result.status)) throw new Error(result.stderr.trim() || 'Git could not inspect the source bundle.');
  return result.stdout;
}

async function sourceResourcePaths() {
  const paths = await resourcePaths();
  const input = paths.map(path => 'plugin/' + path + '\0').join('');
  const check = options => git([...options, 'check-ignore', '--stdin', '-z'], { input, accepted: [0, 1] });
  let ignored;
  if (await hasGitMetadata(repository)) {
    ignored = check([]);
  } else if (await exists(join(repository, '.gitignore')) || paths.some(path => path.split('/').at(-1) === '.gitignore')) {
    // A source archive can retain ignore rules without retaining the Git index.
    const parent = await realpath(tmpdir());
    const temporary = await mkdtemp(join(parent, 'repo-governance-ignore-'));
    try {
      git(['init', '--quiet', '--bare', '--template=', temporary]);
      ignored = check(['--git-dir=' + temporary, '--work-tree=' + repository]);
    } finally {
      if (dirname(temporary) === parent && await realpath(temporary) === temporary)
        await rm(temporary, { recursive: true, force: true });
    }
  }
  if (ignored) throw new Error('Git excludes files from the bundle: ' + ignored.split('\0').filter(Boolean).join(', '));
  return paths;
}

export async function verifySourceBundle({ pack = true } = {}) {
  await sourceResourcePaths();
  return verifyBundle({ pack });
}

export async function buildBundle() {
  const pkg = await readPackageIdentity();
  const files = [];
  for (const path of await sourceResourcePaths()) {
    if (path !== manifestName) files.push({ path, sha256: sha256(await readFile(join(root, path))) });
  }
  const manifest = { schemaVersion: 1, version: pkg.version, checkerSchemaVersion: 3, root: '../../..', files };
  const bytes = JSON.stringify(manifest, null, 2) + '\n';
  await writeFile(bundlePath, bytes);
  return { operation: 'build-bundle', version: manifest.version, files: files.length, path: bundlePath, sha256: sha256(bytes) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const operation = process.argv[2];
    if (process.argv.length !== 3 || !['build', 'verify'].includes(operation)) throw new Error('Use bundle.mjs build or verify.');
    process.stdout.write(JSON.stringify(operation === 'build' ? await buildBundle() : await verifySourceBundle()) + '\n');
  } catch (error) {
    process.stdout.write(JSON.stringify({ operation: 'bundle', decision: 'error', message: error.message }) + '\n');
    process.exitCode = 1;
  }
}
