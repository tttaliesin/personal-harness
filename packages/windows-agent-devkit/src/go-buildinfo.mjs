import { open, stat } from 'node:fs/promises';

const MAGIC = Buffer.from([0xff, 0x20, 0x47, 0x6f, 0x20, 0x62, 0x75, 0x69, 0x6c, 0x64, 0x69, 0x6e, 0x66, 0x3a]);

// Go >=1.18 inline build-info header, as documented by Go's debug/buildinfo.
// Only the compiler version is returned; module/environment records are not read out.
export function parseGoBuildVersion(buffer) {
  for (let offset = buffer.indexOf(MAGIC); offset >= 0; offset = buffer.indexOf(MAGIC, offset + 1)) {
    if (offset % 16 !== 0 || offset + 34 > buffer.length || !(buffer[offset + 15] & 2)) continue;
    let position = offset + 32;
    let length = 0;
    let shift = 0;
    while (position < buffer.length && shift < 21) {
      const value = buffer[position++];
      length |= (value & 0x7f) << shift;
      if (!(value & 0x80)) break;
      shift += 7;
    }
    if (length < 3 || length > 128 || position + length > buffer.length) continue;
    const version = buffer.toString('utf8', position, position + length);
    if (/^go\d+\.\d+(?:\.\d+)?(?:rc\d+|beta\d+)?$/.test(version)) return version;
  }
  return null;
}

export async function readGoBuildVersion(path) {
  const information = await stat(path);
  if (!information.isFile() || information.size > 128 * 1024 * 1024) return null;
  const file = await open(path, 'r');
  try {
    const buffer = await file.readFile();
    return parseGoBuildVersion(buffer);
  } finally { await file.close(); }
}
