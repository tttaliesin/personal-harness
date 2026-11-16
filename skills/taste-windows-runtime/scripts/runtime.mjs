import fs from 'node:fs';
import path from 'node:path';

export function browserPath(env = process.env, platform = process.platform, isFile = p => { try { return fs.statSync(p).isFile(); } catch { return false; } }) {
  if (platform !== 'win32') return null;
  if (env.CHROME_PATH) {
    if (!isFile(env.CHROME_PATH)) throw new Error('CHROME_PATH does not name an existing browser file');
    return env.CHROME_PATH;
  }
  const roots = [...new Set([env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA, 'C:/Program Files', 'C:/Program Files (x86)'].filter(Boolean))];
  const candidates = roots.flatMap(root => [path.join(root, 'Google/Chrome/Application/chrome.exe'), path.join(root, 'Microsoft/Edge/Application/msedge.exe')]);
  const found = candidates.find(isFile);
  if (!found) throw new Error('Taste browser check: install Chrome or Edge, or provide CHROME_PATH');
  return found;
}

export function edgeArguments(command, args, browser, platform = process.platform) {
  if (platform !== 'win32' || !browser || typeof command !== 'string' || !Array.isArray(args)) return args;
  const canonical = value => path.win32.resolve(value).toLowerCase();
  if (canonical(command) !== canonical(browser) || path.win32.basename(command).toLowerCase() !== 'msedge.exe') return args;
  if (!args.some(arg => typeof arg === 'string' && /^--headless(?:=|$)/.test(arg)) || args.includes('--edge-skip-compat-layer-relaunch')) return args;
  return [...args, '--edge-skip-compat-layer-relaunch'];
}

export function childEnvironment(env, browser, preloadUrl) {
  if (!browser) return { ...env };
  const preload = `--import=${preloadUrl}`;
  const nodeOptions = env.NODE_OPTIONS || '';
  return { ...env, CHROME_PATH: browser, PERSONAL_HARNESS_TASTE_RUNTIME: '1',
    NODE_OPTIONS: nodeOptions.includes(preload) ? nodeOptions : [nodeOptions, preload].filter(Boolean).join(' ') };
}
