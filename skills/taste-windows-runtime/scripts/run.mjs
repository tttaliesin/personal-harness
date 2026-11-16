import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { browserPath, childEnvironment } from './runtime.mjs';

const args = process.argv.slice(2);
if (!args.length || args[0] === '--help') {
  console.log('Usage: node <taste-windows-runtime>/scripts/run.mjs <original Taste .mjs script> [original arguments...]');
  process.exitCode = args.length ? 0 : 2;
} else {
  try {
    const script = path.resolve(args[0]);
    if (!script.endsWith('.mjs') || !fs.statSync(script).isFile()) throw new Error('Provide an existing original .mjs script');
    const browser = browserPath();
    const env = childEnvironment(process.env, browser, new URL('./preload.mjs', import.meta.url).href);
    const windows = process.platform === 'win32';
    if (windows) env.PERSONAL_HARNESS_TASTE_IPC_TOKEN = randomUUID();
    const child = spawn(process.execPath, [script, ...args.slice(1)], { env, stdio: windows ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit', windowsHide: true });
    child.on('error', error => { console.error(error.message); process.exitCode = 2; });
    child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 2); });
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      if (!windows) { child.kill(signal); return; }
      if (child.connected) child.send({ type: 'personal-harness-taste-signal', signal, token: env.PERSONAL_HARNESS_TASTE_IPC_TOKEN }, () => {});
      const deadline = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      }, 10000);
      deadline.unref();
    });
  } catch (error) {
    console.error(`Taste Windows runtime: ${error.message}`);
    process.exitCode = 2;
  }
}
