#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const usage = `Usage: personal-harness <install|update> [options]

Install or update the private Windows harness and check the result.
Python 3.11+, Git, Node/npm and Codex must already be installed.
Git and npm handle private repository authentication.

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
Old source releases are retained. Concurrent managed runs fail promptly.
`;

const valueOptions = new Map([
  ['--host', 'host'], ['--home', 'home'], ['--codex-home', 'codexHome'],
  ['--codex', 'codex'], ['--python', 'python'], ['--local-config', 'localConfig'],
  ['--install-root', 'installRoot'], ['--state-root', 'stateRoot'],
]);

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
  const sourceRoot = fileURLToPath(new URL('../', import.meta.url));
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

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`personal-harness: ${error.message}\n`);
  process.exitCode = 1;
}
