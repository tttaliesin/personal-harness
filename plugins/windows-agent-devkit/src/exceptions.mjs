import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const LIMIT = 8 * 1024 * 1024;

function failure(code) {
  return Object.assign(new Error(code), { code });
}

async function statMaybe(filename) {
  try { return await lstat(filename); }
  catch (error) {
    if (error.code === 'ENOENT') return null;
    throw failure('PATH_UNREADABLE');
  }
}

async function checkParents(directory) {
  let current = path.parse(directory).root;
  for (const part of path.relative(current, directory).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = await statMaybe(current);
    if (info && (!info.isDirectory() || info.isSymbolicLink())) throw failure('UNSAFE_PATH');
  }
}

async function physical(filename) {
  if (await statMaybe(filename)) return realpath(filename);
  const parent = path.dirname(filename);
  if (parent === filename) throw failure('INVALID_PATH');
  return path.join(await physical(parent), path.basename(filename));
}

function inside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

async function readSavedExceptions(filename) {
  await checkParents(path.dirname(filename));
  const before = await statMaybe(filename);
  if (!before) return null;
  if (!before.isFile() || before.isSymbolicLink() || before.nlink > 1 || before.size > LIMIT) throw failure('UNSAFE_FILE');
  const file = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = await file.stat();
    if (info.ino !== before.ino || info.dev !== before.dev || info.size > LIMIT) throw failure('FILE_CHANGED');
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, length);
      if (!bytesRead) break;
      length += bytesRead;
    }
    const after = await file.stat();
    if (length !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs) throw failure('FILE_CHANGED');
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length)));
    } catch {
      throw failure('INVALID_STATE');
    }
  } finally {
    await file.close();
  }
}

/** Read keep decisions saved by earlier releases without creating state. */
export async function loadExceptions(projectRoot, stateDir) {
  const candidate = stateDir ?? (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'WindowsAgentDevkit', 'state'));
  if (!candidate) throw failure('STATE_DIR_REQUIRED');
  if (!path.isAbsolute(candidate)) throw failure('ABSOLUTE_STATE_DIR_REQUIRED');
  await checkParents(path.resolve(candidate));
  const state = await physical(path.resolve(candidate));
  let repository = projectRoot;
  for (let folder = projectRoot; ; folder = path.dirname(folder)) {
    if (await statMaybe(path.join(folder, '.git'))) { repository = folder; break; }
    if (path.dirname(folder) === folder) break;
  }
  if (inside(repository, state) || inside(state, projectRoot) || state === path.parse(state).root || state === await physical(tmpdir())) {
    throw failure('STATE_DIR_MUST_BE_OUTSIDE_REPOSITORY');
  }
  const projectKey = process.platform === 'win32' ? projectRoot.toLowerCase() : projectRoot;
  const key = createHash('sha256').update(projectKey).digest('hex');
  const saved = await readSavedExceptions(path.join(state, 'exceptions', `${key}.json`));
  if (saved === null) return [];
  if (saved.projectPath !== projectRoot || !Array.isArray(saved.exceptions) || saved.exceptions.some((entry) =>
    typeof entry?.role !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(entry.role)
    || typeof entry.reason !== 'string' || !entry.reason.trim() || typeof entry.scope !== 'string')) {
    throw failure('INVALID_EXCEPTIONS');
  }
  return saved.exceptions;
}
