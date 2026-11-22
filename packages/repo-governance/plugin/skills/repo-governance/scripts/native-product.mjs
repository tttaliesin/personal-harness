import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, isAbsolute, join } from 'node:path';
import { lstat, readFile } from 'node:fs/promises';

const execute = promisify(execFile);

export function nativeGitEnvironment() {
  return {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^GIT_/i.test(key))),
    GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: '', GIT_TERMINAL_PROMPT: '0', GIT_NO_REPLACE_OBJECTS: '1'
  };
}

export async function nativeMetadataLocations(repository, gitEnvironment = nativeGitEnvironment()) {
  const options = { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 64 * 1024, env: { ...gitEnvironment, LC_ALL: 'C' } };
  try {
    const { stdout } = await execute('git', ['-C', repository, '-c', 'core.fsmonitor=false', 'rev-parse', '--is-inside-work-tree', '--path-format=absolute', '--git-path', 'repo-governance/product.json', '--git-common-dir'], options);
    const lines = stdout.replace(/\r?\n$/, '').split(/\r?\n/);
    if (lines[0] === 'false') return undefined;
    if (lines.length !== 3 || lines[0] !== 'true' || lines.slice(1).some(path => !isAbsolute(path) || /[\x00-\x1f]/.test(path)))
      throw new TypeError('Git returned an invalid governance metadata path');
    const [, localProductPath, commonDirectory] = lines;
    return { localProductPath, localAdoptionPath: join(dirname(localProductPath), 'adoption.json'),
      cloneAdoptionPath: join(commonDirectory, 'repo-governance', 'clone-adoption.json') };
  } catch (error) {
    if (error.code === 128 && /^fatal: not a git repository(?: |:|$)/m.test(error.stderr ?? '')) return undefined;
    throw error;
  }
}

export async function localProductLocation(repository, gitEnvironment) {
  return (await nativeMetadataLocations(repository, gitEnvironment))?.localProductPath;
}

async function entry(path) {
  try { return await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
}

function adoptionFrom(value, version, scope) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== 2 || value.schemaVersion !== version || value.mode !== 'enforce')
    throw new TypeError(`The ${scope} adoption marker must be {schemaVersion:${version},mode:"enforce"}.`);
}

async function readAdoption(path, version, scope) {
  const directoryEntry = await entry(dirname(path));
  if (directoryEntry && (!directoryEntry.isDirectory() || directoryEntry.isSymbolicLink()))
    throw new TypeError(`The ${scope} governance metadata must be a regular directory.`);
  const marker = await entry(path);
  if (!marker) return false;
  if (!marker.isFile() || marker.isSymbolicLink()) throw new TypeError(`The ${scope} adoption marker must be a regular file.`);
  adoptionFrom(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(path))), version, scope);
  return true;
}

export function readCloneAdoption(path) {
  return readAdoption(path, 2, 'clone');
}

/** A legacy worktree binding takes precedence over clone-wide defaults. */
export async function localNativeScope(repository, gitEnvironment) {
  const locations = await nativeMetadataLocations(repository, gitEnvironment);
  if (!locations) return { adopted: false };
  const { localProductPath, localAdoptionPath, cloneAdoptionPath } = locations;
  const local = { ...locations, productPath: localProductPath, adoptionPath: localAdoptionPath };
  if (await readAdoption(localAdoptionPath, 1, 'worktree'))
    return { ...local, adopted: true, adoption: 'marker' };
  // lstat sees broken links so a broken legacy input keeps its enforcement scope.
  if (await entry(localProductPath)) return { ...local, adopted: true, adoption: 'legacy-product' };
  if (await readCloneAdoption(cloneAdoptionPath))
    return { ...locations, adopted: true, adoption: 'clone-marker', adoptionPath: cloneAdoptionPath };
  return { ...local, adopted: false };
}
