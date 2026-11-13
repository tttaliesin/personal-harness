#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
const packageName = '@tttaliesin/personal-harness';
const packageDirectory = path.join('node_modules', '@tttaliesin', 'personal-harness');
const gitSpec = 'git+https://github.com/tttaliesin/personal-harness.git';

const usage = `Usage: personal-harness <install|update> [options]

Install or update the Windows harness and check the result.
Python 3.11+, Git, Node/npm and Codex must already be installed.
The public GitHub source can be downloaded without signing in.

Options:
  --host NAME           Bundled host profile (defaults to COMPUTERNAME)
  --home PATH           Target home; also isolates the manager by default
  --codex-home PATH     Target Codex profile
  --codex PATH          Codex executable or command
  --python PATH         Python 3.11+ executable or command
  --local-config PATH   Host configuration override
  --install-root PATH   Manager (defaults to LocalAppData/PersonalHarness)
  --state-root PATH     Persistent dependency state (defaults to manager/state)
  --locked              Reproduce the persistent dependency lock
  --help                Display this help

Paths are literal and relative paths use the caller's working directory.
Executable source is removed after managed runs. Concurrent managed runs fail promptly.
`;

const valueOptions = new Map([
  ['--host', 'host'], ['--home', 'home'], ['--codex-home', 'codexHome'],
  ['--codex', 'codex'], ['--python', 'python'], ['--local-config', 'localConfig'],
  ['--install-root', 'installRoot'], ['--state-root', 'stateRoot'],
]);

function assertCanonical(target) {
  const absolute = path.resolve(target);
  let current = absolute;
  while (true) {
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Source cleanup refused a linked path.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (fs.realpathSync.native(absolute).toLowerCase() !== absolute.toLowerCase()) {
    throw new Error('Source cleanup refused a path alias.');
  }
}

function readMetadata(filename) {
  assertCanonical(filename);
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.nlink !== 1) throw new Error('Source cleanup refused linked metadata.');
  try { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
  catch { throw new Error('Source cleanup refused unreadable npm metadata.'); }
}

function verifyPackage(entry) {
  assertCanonical(sourceRoot);
  if (path.relative(entry, sourceRoot) !== packageDirectory) {
    throw new Error('Source cleanup refused an unexpected package directory.');
  }
  const manifest = readMetadata(path.join(sourceRoot, 'package.json'));
  const request = readMetadata(path.join(entry, 'package.json'));
  const lock = readMetadata(path.join(entry, 'package-lock.json'));
  const installed = lock.packages?.['node_modules/@tttaliesin/personal-harness'];
  const expectedBin = value => value?.['personal-harness'] === 'bin/personal-harness.mjs';
  if (manifest.name !== packageName || !expectedBin(manifest.bin) ||
      !expectedBin(installed?.bin) || installed.version !== manifest.version ||
      !/^git\+(?:ssh:\/\/git@|https:\/\/)github\.com\/tttaliesin\/personal-harness\.git#[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(installed.resolved || '') ||
      request.dependencies?.[packageName] !== 'github:tttaliesin/personal-harness' ||
      lock.packages?.['']?.dependencies?.[packageName] !== request.dependencies[packageName] ||
      !Array.isArray(request._npx?.packages) || !request._npx.packages.includes(gitSpec)) {
    throw new Error('Source cleanup refused unverified npm package ownership.');
  }
}

function verifyTree(directory) {
  for (const name of fs.readdirSync(directory)) {
    if (name.toLowerCase() === '.git') throw new Error('Source cleanup refused a Git checkout.');
    const filename = path.join(directory, name);
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink() || (!stat.isDirectory() && (!stat.isFile() || stat.nlink !== 1))) {
      throw new Error('Source cleanup refused a linked or special package member.');
    }
    if (stat.isDirectory()) verifyTree(filename);
  }
}

function acquirePackage() {
  if (process.env.npm_command !== 'exec') return null;
  const entry = path.resolve(sourceRoot, '../../..');
  if (path.basename(path.dirname(entry)) !== '_npx') return null;
  if (!/^[a-f0-9]{16}$/.test(path.basename(entry))) {
    throw new Error('Source cleanup refused an unexpected npm cache entry.');
  }
  const npm = process.env.npm_execpath;
  if (!npm || !path.isAbsolute(npm) || path.basename(npm) !== 'npm-cli.js') {
    throw new Error('Source cleanup cannot establish the effective npm cache.');
  }
  const result = spawnSync(process.execPath, [npm, 'config', 'get', 'cache'], {
    encoding: 'utf8', shell: false,
  });
  const cache = result.stdout?.trim();
  if (result.error || result.status !== 0 || !cache || !path.isAbsolute(cache) ||
      path.relative(path.join(cache, '_npx'), entry) !== path.basename(entry)) {
    throw new Error('Source cleanup refused a package outside the effective npm cache.');
  }
  assertCanonical(entry);
  const launcher = path.resolve(process.argv[1]);
  assertCanonical(launcher);
  if (launcher !== path.join(sourceRoot, 'bin', 'personal-harness.mjs')) {
    throw new Error('Source cleanup refused an aliased launcher.');
  }
  verifyPackage(entry);
  verifyTree(sourceRoot);
  const lease = path.join(entry, '.personal-harness-source.lease');
  try { fs.mkdirSync(lease); }
  catch { throw new Error('Source cleanup lease is unavailable; another launcher may be running.'); }
  const token = randomUUID();
  const owner = path.join(lease, 'owner');
  try { fs.writeFileSync(owner, token, { flag: 'wx' }); }
  catch (error) {
    fs.rmdirSync(lease);
    throw error;
  }
  return { entry, lease, owner, token };
}

function removePackage(owned) {
  try {
    assertCanonical(owned.lease);
    if (fs.readFileSync(owned.owner, 'utf8') !== owned.token) {
      throw new Error('Source cleanup refused a changed package lease.');
    }
    verifyPackage(owned.entry);
    verifyTree(sourceRoot);
    fs.rmSync(sourceRoot, { recursive: true });
  } finally {
    assertCanonical(owned.lease);
    if (fs.readFileSync(owned.owner, 'utf8') === owned.token) {
      fs.unlinkSync(owned.owner);
      fs.rmdirSync(owned.lease);
    }
  }
}

function main(args) {
  if (args.length === 0 || (args.length === 1 && args[0] === '--help')) {
    process.stdout.write(usage);
    return 0;
  }
  const command = args.shift();
  if (!['install', 'update'].includes(command)) {
    throw new Error('Expected install or update. Use --help for usage.');
  }
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--help' && args.length === 1) {
      process.stdout.write(usage);
      return 0;
    }
    const key = flag === '--locked' ? 'locked' : valueOptions.get(flag);
    if (!key) throw new Error(`Unknown option: ${flag}`);
    if (Object.hasOwn(options, key)) throw new Error(`Repeated option: ${flag}`);
    if (flag === '--locked') {
      options.locked = true;
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith('--') || value.includes('\0')) {
      throw new Error(`Expected a value for ${flag}.`);
    }
    options[key] = value;
  }
  if (process.platform !== 'win32') throw new Error('This installer requires Windows.');
  const request = Buffer.from(JSON.stringify({
    command, options, sourceRoot, cwd: process.cwd(),
  }), 'utf8').toString('base64');
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows',
    'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const result = spawnSync(powershell, [
    '-NoLogo', '-NoProfile', '-NonInteractive', '-File',
    path.join(sourceRoot, 'scripts', 'bootstrap.ps1'), '-RequestBase64', request,
  ], { stdio: 'inherit', shell: false });
  if (result.error) throw new Error(`Cannot start Windows PowerShell: ${result.error.message}`);
  if (result.signal) throw new Error(`Windows PowerShell stopped with signal ${result.signal}.`);
  return result.status ?? 1;
}

let owned;
let exitCode = 1;
try {
  owned = acquirePackage();
  exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`personal-harness: ${error.message}\n`);
} finally {
  if (owned) {
    try { removePackage(owned); }
    catch (error) {
      process.stderr.write(`personal-harness: npm executable source cleanup failed (${error.code || error.message}); persistent Harness state was retained.\n`);
      if (exitCode === 0) exitCode = 1;
    }
  }
}
process.exitCode = exitCode;
