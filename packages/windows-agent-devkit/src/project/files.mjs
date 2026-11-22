import { constants } from 'node:fs';
import { lstat, open, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';

export const MAX_BYTES = 256 * 1024;
export const MAX_ENTRIES = 4096;
export const MAX_FILES = 128;
export const MAX_DEPTH = 32;

export function inside(base, target) {
  const relative = path.relative(base, target);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

export const portable = (value) => value.split(path.sep).join('/');

export function matches(pattern, value) {
  const pieces = pattern.replace(/^!/, '').replace(/^\.\//, '').replace(/\/$/, '').split('/');
  const parts = value.split('/');
  const memo = new Map();
  function match(left, right) {
    const key = `${left}:${right}`;
    if (memo.has(key)) return memo.get(key);
    let yes;
    if (left === pieces.length) yes = right === parts.length;
    else if (pieces[left] === '**') yes = match(left + 1, right) || (right < parts.length && match(left, right + 1));
    else yes = right < parts.length && new RegExp(`^${pieces[left].split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`).test(parts[right]) && match(left + 1, right + 1);
    memo.set(key, yes);
    return yes;
  }
  return match(0, 0);
}
export const memberOf = (patterns, value) => Array.isArray(patterns) && patterns.some((pattern) => typeof pattern === 'string' && !pattern.startsWith('!') && matches(pattern, value)) && !patterns.some((pattern) => typeof pattern === 'string' && pattern.startsWith('!') && matches(pattern, value));

export async function existingEntry(filename) {
  try { return await lstat(filename); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function safeDirectories(base, directory, physicalBase) {
  if (!inside(base, directory)) throw new Error();
  if (physicalBase !== undefined) {
    if (await realpath(base) !== physicalBase) throw new Error();
  } else {
    const info = await lstat(base);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
  }
  let cursor = base;
  for (const segment of path.relative(base, directory).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    const info = await lstat(cursor);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
  }
  return inside(await realpath(base), await realpath(directory));
}

const unreadable = '선언 파일의 폴더 링크·접근 권한·대상을 안전하게 확인할 수 없습니다.';
const tooLarge = '선언 파일이 256 KiB 읽기 한도를 초과했습니다.';
const readFailure = (state, error) => ({ state, error, text: null });

export async function readDeclarationFile(filename, { anchor = path.dirname(filename), physicalAnchor, contents = true } = {}) {
  let handle;
  try {
    const directory = path.dirname(filename);
    if (!await safeDirectories(anchor, directory, physicalAnchor)) throw new Error();
    const before = await existingEntry(filename);
    if (!before) return readFailure('absent', unreadable);
    if (!before.isFile() || before.isSymbolicLink()) {
      return readFailure('unsupported_file', '선언 파일이 일반 파일이 아니거나 링크이므로 읽지 않았습니다.');
    }
    if (!inside(await realpath(anchor), await realpath(filename))) {
      return readFailure('unreadable', '허용한 선언 경계 밖의 파일은 읽지 않았습니다.');
    }
    handle = await open(filename, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const info = await handle.stat();
    if (!info.isFile() || info.ino !== before.ino || info.dev !== before.dev) {
      return readFailure('unreadable', '조회 중 선언 파일의 대상이 변경되어 읽지 않았습니다.');
    }
    let text = '';
    if (contents) {
      if (info.size > MAX_BYTES) return readFailure('file_too_large', tooLarge);
      const bytes = Buffer.alloc(MAX_BYTES + 1);
      let length = 0;
      while (length < bytes.length) {
        const chunk = await handle.read(bytes, length, bytes.length - length, length);
        if (!chunk.bytesRead) break;
        length += chunk.bytesRead;
      }
      if (length > MAX_BYTES) return readFailure('file_too_large', tooLarge);
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, length)).replace(/^\uFEFF/, ''); }
      catch { return readFailure('unreadable', '선언 파일을 UTF-8 텍스트로 읽을 수 없습니다.'); }
      if (text.includes('\0')) return readFailure('unreadable', '선언 파일에 지원하지 않는 바이너리 데이터가 있습니다.');
    }
    const after = await handle.stat(), linked = await lstat(filename);
    if (after.size !== info.size || after.mtimeMs !== info.mtimeMs || linked.isSymbolicLink() || linked.ino !== info.ino || linked.dev !== info.dev ||
        !await safeDirectories(anchor, directory, physicalAnchor) || !inside(await realpath(anchor), await realpath(filename))) {
      return readFailure('unreadable', '조회 중 선언 파일이나 폴더가 변경되어 요구를 확정하지 않았습니다.');
    }
    return { state: 'read', text };
  } catch {
    return readFailure('unreadable', unreadable);
  } finally {
    if (handle) await handle.close().catch(() => {});
  }
}

export function projectFileAccess(root, physicalRoot) {
  const cache = new Map();
  let reads = 0;
  const physical = (base) => base === root ? physicalRoot : undefined;
  const checkDirectory = (base, directory) => safeDirectories(base, directory, physical(base));

  async function list(directory, base = root) {
    if (!await checkDirectory(base, directory)) throw new Error();
    const entries = [];
    for await (const entry of await opendir(directory)) {
      if (entries.length >= MAX_ENTRIES) throw new Error('디렉터리 항목 수가 정적 탐색 한도를 초과했습니다.');
      entries.push(entry);
    }
    return entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  }

  async function read({ filename, anchor, spec }) {
    if (cache.has(filename)) return cache.get(filename);
    const result = ++reads > MAX_FILES
      ? readFailure('file_limit', '선언 파일 수가 정적 분석 한도를 초과했습니다.')
      : await readDeclarationFile(filename, { anchor, physicalAnchor: physical(anchor), contents: Boolean(spec.parser) });
    cache.set(filename, result);
    return result;
  }

  return { safeDirectories: checkDirectory, list, read };
}
