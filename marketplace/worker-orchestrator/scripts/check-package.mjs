import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { lstat, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptParent = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portableSchema = 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json';

export function isSemVer(value) {
  if (typeof value !== 'string') return false;
  const match = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(value);
  return match?.[0] === value && !match[1]?.split('.').some(identifier => /^0[0-9]+$/.test(identifier));
}

async function hasOutputLock(filename) {
  try {
    const stat = await lstat(filename);
    assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size === 0, `Expected an empty regular build lock file: ${filename}`);
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return false;
  }
}

export async function withBuildOutputLock(outputRoot, action, { readOnly = false } = {}) {
  const filename = path.join(outputRoot, '.worker-orchestrator-build.sqlite');
  if (!readOnly) {
    try {
      await writeFile(filename, '', { flag: 'wx' });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    assert.ok(await hasOutputLock(filename), `Missing build lock: ${filename}`);
  } else if (!await hasOutputLock(filename)) {
    // Older builds have no lock file. Retry under the lock if a rebuild created one during the check.
    try {
      const result = await action();
      if (!await hasOutputLock(filename)) return result;
    } catch (error) {
      if (!await hasOutputLock(filename)) throw error;
    }
  }

  // SQLite holds OS locks on the empty file and releases them even if a process exits abruptly.
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(filename, { readOnly });
  try {
    if (readOnly) db.exec('BEGIN');
    const acquire = readOnly ? 'SELECT name FROM sqlite_schema' : 'PRAGMA journal_mode = MEMORY; BEGIN EXCLUSIVE';
    const deadline = performance.now() + 30_000;
    for (;;) {
      try {
        db.exec(acquire);
        break;
      } catch (error) {
        if (error.errcode !== 5) throw error; // SQLITE_BUSY
        if (performance.now() >= deadline) throw new Error(`Timed out waiting for package build lock: ${filename}`, { cause: error });
        await delay(25);
      }
    }
    return await action();
  } finally {
    db.close();
  }
}

function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function safeName(name) {
  assert.equal(typeof name, 'string', 'Manifest paths must be strings.');
  assert.ok(name && !name.includes('\\') && !name.includes(':') && !name.startsWith('/'), `Nonportable manifest path: ${name}`);
  assert.ok(name.split('/').every(part => part && part !== '.' && part !== '..'), `Non-normalized manifest path: ${name}`);
  return name;
}

async function regularFiles(root, prefix = '') {
  const stat = await lstat(root);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), `Expected real directory: ${root}`);
  const files = [];
  for (const name of (await readdir(root)).sort()) {
    const relative = prefix ? `${prefix}/${name}` : name;
    safeName(relative);
    const filename = path.join(root, name);
    const info = await lstat(filename);
    assert.ok(!info.isSymbolicLink(), `Symlinks are not portable package resources: ${relative}`);
    if (info.isDirectory()) {
      assert.ok(!['node_modules', '.git', 'src'].includes(name), `Unexpected source or dependency directory: ${relative}`);
      files.push(...await regularFiles(filename, relative));
    } else {
      assert.ok(info.isFile(), `Expected regular package file: ${relative}`);
      files.push(relative);
    }
  }
  return files;
}

async function readJSON(filename) {
  const value = JSON.parse(await readFile(filename, 'utf8'));
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), `Expected JSON object: ${filename}`);
  return value;
}

function insideResource(root, from, reference, files) {
  const target = path.resolve(path.dirname(path.join(root, from)), reference);
  assert.ok(contained(root, target), `Resource escapes package: ${from} -> ${reference}`);
  const relative = path.relative(root, target).split(path.sep).join('/');
  assert.ok(files.has(relative), `Missing resource: ${from} -> ${reference}`);
}

async function checkLinks(root, relative, files) {
  const source = await readFile(path.join(root, relative), 'utf8');
  const patterns = [
    /!?\[[^\]\n]*\]\((?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\)/g,
    /^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*(?:<([^>]+)>|([^\s]+))(?:[ \t]+["'(].*)?$/gm,
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
    const reference = match[1] ?? match[2];
    if (/^https?:\/\//i.test(reference) || reference.startsWith('#')) continue;
    assert.ok(!/^[a-z][a-z\d+.-]*:/i.test(reference) && !reference.startsWith('/'), `Nonportable Markdown link: ${relative} -> ${reference}`);
    insideResource(root, relative, decodeURIComponent(reference.split(/[?#]/)[0]), files);
  }
}

function discoveryFields(frontmatter, relative) {
  const fields = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const match = line.match(/^(name|description):[ \t]+(.+?)\s*$/);
    assert.ok(match, `Unsupported discovery field: ${relative}`);
    const [, key, scalar] = match;
    assert.ok(!Object.hasOwn(fields, key), `Duplicate discovery field: ${relative}`);
    let value;
    if (scalar.startsWith('"')) {
      value = JSON.parse(scalar);
    } else if (scalar.startsWith("'")) {
      assert.match(scalar, /^'(?:[^']|'')*'$/, `Invalid quoted YAML scalar: ${relative}`);
      value = scalar.slice(1, -1).replaceAll("''", "'");
    } else {
      assert.ok(!/^[\[\]{}&*!|>#%@`]/.test(scalar) && !/: | #/.test(scalar), `Expected a plain YAML scalar: ${relative}`);
      assert.ok(!/^(?:null|true|false|~|[-+]?\d+(?:\.\d+)?)$/i.test(scalar), `Discovery values must be YAML strings: ${relative}`);
      value = scalar;
    }
    assert.ok(typeof value === 'string' && value.trim(), `Discovery values must be nonempty strings: ${relative}`);
    fields[key] = value;
  }
  assert.deepEqual(Object.keys(fields).sort(), ['description', 'name'], `Missing discovery field: ${relative}`);
  return fields;
}

async function checkImports(root, relative, files) {
  const source = await readFile(path.join(root, relative), 'utf8');
  const patterns = [
    /\b(?:import|export)\s+(?:[^;]*?\s+from\s*)?['"]([^'"\n]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) for (const match of source.matchAll(pattern)) {
    const reference = match[1];
    if (reference.startsWith('node:')) continue;
    assert.ok(reference.startsWith('./') || reference.startsWith('../'), `External runtime dependency: ${relative} -> ${reference}`);
    insideResource(root, relative, reference, files);
  }
}

async function checkMarketplace(marketplaceRoot, packageRoot, name) {
  const catalogs = ['marketplace.json', '.agents/plugins/marketplace.json'];
  const first = await readJSON(path.join(marketplaceRoot, catalogs[0]));
  assert.equal(first.name, 'worker-orchestrator-local');
  assert.equal(typeof first.interface?.displayName, 'string');
  assert.equal(first.plugins?.length, 1);
  const entry = first.plugins[0];
  assert.equal(entry.name, name);
  assert.equal(entry.source?.source, 'local');
  assert.ok(/^\.\/(?:[a-zA-Z\d_.-]+\/)*[a-zA-Z\d_.-]+$/.test(entry.source.path), 'Marketplace path must be ./-prefixed and normalized.');
  assert.ok(entry.source.path.slice(2).split('/').every(part => part !== '.' && part !== '..'), 'Marketplace cannot leave its root.');
  const target = path.resolve(marketplaceRoot, entry.source.path);
  assert.ok(contained(marketplaceRoot, target));
  assert.equal(target, packageRoot, 'Marketplace paths resolve against marketplace root, not .agents/plugins.');
  assert.deepEqual(await readJSON(path.join(marketplaceRoot, catalogs[1])), first, 'Marketplace copies must match.');
}

function runInstalled(root, command, stateDir, input) {
  const args = [path.join(root, 'dist/cli.mjs'), command, '--state-dir', stateDir];
  if (input !== undefined) args.push('--input', '-');
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', input: JSON.stringify(input), windowsHide: true, timeout: 30_000 });
  assert.equal(result.error, undefined, `Installed CLI ${command} could not start: ${result.error?.message}`);
  return result;
}

function isInstalled() {
  return existsSync(path.join(scriptParent, 'package-manifest.json')) || existsSync(path.join(scriptParent, 'dist/cli.mjs'));
}

/** Checks a standalone install or a package in its build catalog. */
export async function checkPackage({ root, marketplaceRoot, smoke = true, stateDir } = {}) {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'Package requires Node.js 24 or newer.');
  root = path.resolve(root ?? (isInstalled() ? scriptParent : path.join(scriptParent, 'dist/codex/worker-orchestrator')));
  const outputRoot = path.dirname(root);
  const check = () => checkInstalledPackage(root, marketplaceRoot, smoke, stateDir);
  if (path.relative(path.join(outputRoot, 'worker-orchestrator'), root)) return check();
  return withBuildOutputLock(outputRoot, check, { readOnly: true });
}

async function checkInstalledPackage(root, marketplaceRoot, smoke, stateDir) {
  const files = new Set(await regularFiles(root));
  const manifest = await readJSON(path.join(root, 'package-manifest.json'));
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.name, 'worker-orchestrator');
  assert.ok(isSemVer(manifest.version), 'Manifest version must be valid SemVer.');
  if (Object.hasOwn(manifest, 'releaseTag')) {
    assert.equal(manifest.releaseTag, `v${manifest.version}`, 'Manifest release tag must match the version.');
  }
  assert.ok(manifest.revision === null || /^[a-f\d]{40,64}$/.test(manifest.revision), 'Revision must be a Git object ID or null for no available revision.');
  assert.equal(manifest.runtime?.name, 'node');
  assert.equal(manifest.runtime?.range, '>=24.0.0');
  assert.match(manifest.runtime?.builtWith, /^\d+\.\d+\.\d+$/);
  assert.ok(manifest.files && typeof manifest.files === 'object' && !Array.isArray(manifest.files));
  const expected = Object.keys(manifest.files).map(safeName).sort();
  assert.deepEqual([...files].filter(name => name !== 'package-manifest.json').sort(), expected, 'File inventory differs from manifest; rebuild or inspect stale files.');
  for (const relative of expected) {
    const entry = manifest.files[relative];
    const data = await readFile(path.join(root, relative));
    assert.ok(entry && typeof entry === 'object');
    assert.match(entry.sha256, /^[a-f\d]{64}$/);
    assert.equal(entry.bytes, data.length, `Size mismatch: ${relative}`);
    assert.equal(entry.sha256, createHash('sha256').update(data).digest('hex'), `Hash mismatch: ${relative}`);
  }

  const portable = await readJSON(path.join(root, 'plugin.json'));
  assert.equal(portable.$schema, portableSchema);
  assert.match(portable.name, /^[a-z\d](?:[a-z\d.-]*[a-z\d])?$/);
  assert.ok(portable.name.length <= 64 && !/--|\.\./.test(portable.name));
  assert.equal(portable.name, manifest.name);
  assert.equal(portable.version, manifest.version);
  for (const field of ['skills', 'mcpServers', 'apps', 'interface']) assert.ok(!Object.hasOwn(portable, field), `Portable manifest uses fixed component locations: ${field}`);
  const presentation = portable.extensions?.['com.openai']?.interface;
  assert.ok(presentation && typeof presentation === 'object');
  for (const field of ['displayName', 'shortDescription']) assert.ok(typeof presentation[field] === 'string' && presentation[field].trim());
  assert.ok(presentation.shortDescription.length <= 30);
  assert.ok(Array.isArray(presentation.capabilities) && presentation.capabilities.every(value => typeof value === 'string' && value.trim()));
  assert.ok(!portable.extensions['com.openai'].apps, 'No app dependency is declared by this package.');
  const compatibility = await readJSON(path.join(root, '.codex-plugin/plugin.json'));
  for (const key of ['name', 'version', 'description']) assert.equal(compatibility[key], portable[key]);
  assert.deepEqual(compatibility.interface, presentation);
  assert.equal(compatibility.skills, './skills/');
  assert.ok(!compatibility.apps && !compatibility.mcpServers, 'Compatibility manifest cannot invent app or MCP dependencies.');
  assert.ok(!files.has('mcp.json') && !files.has('.mcp.json') && !files.has('.app.json'), 'MVP provides skills and local CLI only.');

  const required = ['dist/cli.mjs', 'lib/cli/main.mjs', 'lib/contracts/README.md', 'scripts/check-package.mjs', 'workflows/controller.md', 'workflows/worker.md', 'workflows/worker-result.schema.json', 'docs/architecture.md', 'docs/usage.md', 'docs/packaging.md', 'README.md'];
  for (const relative of required) assert.ok(files.has(relative), `Missing required file: ${relative}`);
  const skillFiles = [...files].filter(name => /^skills\/[^/]+\/SKILL\.md$/.test(name));
  assert.equal(skillFiles.length, 2, 'Package must contain the focused controller and worker skills.');
  const skillNames = new Set();
  for (const relative of skillFiles) {
    const source = await readFile(path.join(root, relative), 'utf8');
    assert.ok(Buffer.byteLength(source) <= 1024 * 1024);
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
    assert.ok(frontmatter, `Missing skill frontmatter: ${relative}`);
    // Discovery uses two simple scalar strings; no YAML dependency is needed.
    const fields = discoveryFields(frontmatter[1], relative);
    assert.equal(fields.name, relative.split('/')[1]);
    assert.ok(fields.description?.trim());
    assert.ok(!skillNames.has(fields.name), 'Duplicate skill name.');
    skillNames.add(fields.name);
    assert.equal(path.resolve(path.dirname(path.join(root, relative)), '../..'), root, 'Skill must resolve installed root two directories above its own directory.');
  }
  assert.deepEqual([...skillNames].sort(), ['worker-controller', 'worker-executor']);
  const resultSchema = await readJSON(path.join(root, 'workflows/worker-result.schema.json'));
  assert.deepEqual(resultSchema.required, ['runId', 'status', 'summary', 'verification', 'pendingRequests']);
  for (const relative of files) {
    if (relative.endsWith('.md')) await checkLinks(root, relative, files);
    if (relative.endsWith('.mjs')) await checkImports(root, relative, files);
    if (relative.endsWith('.json')) await readJSON(path.join(root, relative));
  }
  if (marketplaceRoot) await checkMarketplace(path.resolve(marketplaceRoot), root, portable.name);

  let capabilities = null;
  if (smoke) {
    stateDir = path.resolve(stateDir ?? await mkdtemp(path.join(os.tmpdir(), 'worker-orchestrator-check-')));
    const version = runInstalled(root, '--version', stateDir);
    assert.equal(version.status, 0, `Installed CLI --version failed: ${version.stderr}\n${version.stdout}`);
    assert.equal(JSON.parse(version.stdout).version, manifest.version, 'Installed CLI version must match the manifest.');
    const result = runInstalled(root, 'capabilities', stateDir);
    assert.equal(result.status, 0, `Installed CLI capabilities failed: ${result.stderr}\n${result.stdout}`);
    capabilities = JSON.parse(result.stdout);
    assert.equal(capabilities.ok, true);
    assert.equal(capabilities.adapter, 'codex-desktop');
    assert.equal(capabilities.execution, 'controller-mediated');
    assert.ok(['create', 'send', 'archive', 'unarchive', 'wait', 'observe'].every(value => capabilities.supports?.includes(value)));

    // This error is returned only after opening, migrating, and querying SQLite.
    const status = runInstalled(root, 'status', stateDir, { projectId: `package-smoke-${randomUUID()}` });
    const statusFailure = `Installed CLI SQLite status failed: ${status.stderr}\n${status.stdout}`;
    assert.equal(status.status, 2, statusFailure);
    const response = JSON.parse(status.stdout);
    assert.equal(response.ok, false, statusFailure);
    assert.equal(response.error?.code, 'PROJECT_NOT_FOUND', statusFailure);
  }
  return { ok: true, root, version: manifest.version, revision: manifest.revision, files: expected.length, skills: [...skillNames].sort(), marketplaceChecked: Boolean(marketplaceRoot), capabilities };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const options = {};
    for (let index = 0; index < args.length; index += 2) {
      const key = { '--root': 'root', '--marketplace-root': 'marketplaceRoot', '--state-dir': 'stateDir' }[args[index]];
      if (!key || !args[index + 1] || options[key]) throw new Error('Usage: node scripts/check-package.mjs [--root <installed-root>] [--marketplace-root <catalog-root>] [--state-dir <temporary-absolute-path>]');
      options[key] = args[index + 1];
      if (key === 'stateDir') assert.ok(path.isAbsolute(options[key]), '--state-dir must be absolute.');
    }
    if (!options.root && !isInstalled()) options.marketplaceRoot ??= path.join(scriptParent, 'dist/codex');
    console.log(JSON.stringify(await checkPackage(options), null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, error: error.message }));
    process.exitCode = 1;
  }
}
