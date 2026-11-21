import { lstat, readFile } from 'node:fs/promises';
import { dirname, join, isAbsolute } from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { readGoBuildVersion } from './go-buildinfo.mjs';
import { verifyExecutable } from './windows.mjs';

async function boundedText(file) {
  try { const info = await lstat(file); if (!info.isFile() || info.isSymbolicLink() || info.size > 256 * 1024) return null; return await readFile(file, 'utf8'); } catch { return null; }
}

export async function enhanceRuntimes({ host, project, tools, query, environment = process.env }) {
  if (tools.includes('go')) {
    const candidate = host.commands?.go?.[0];
    const checked = await verifyExecutable('go', candidate, { projectPath: project.root });
    if (checked.executable) {
      const version = await readGoBuildVersion(checked.executable);
      if (version) host.probes.go = { state: 'metadata_verified', executable: checked.executable, arguments: [], exitCode: null, version, versionVerified: true, method: 'pe_go_buildinfo', reason: 'Go 실행 파일의 내장 버전만 읽었습니다. Go 프로세스와 telemetry는 실행하지 않았습니다.' };
    }
  }
  if (tools.includes('rustc') && host.probes?.rustc?.state !== 'succeeded') {
    const roots = [environment.RUSTUP_HOME, environment.USERPROFILE ? join(environment.USERPROFILE, '.rustup') : null].filter((p) => typeof p === 'string' && isAbsolute(p));
    for (const root of roots) {
      let settings;
      try { settings = parseToml(await boundedText(join(root, 'settings.toml')) ?? '', { unsafeKeyBehaviour: 'throw' }); } catch { continue; }
      const requests = project.requirements.rust.versionRequests.filter((i) => ['channel', 'exact'].includes(i.kind));
      const channel = environment.RUSTUP_TOOLCHAIN ?? requests[0]?.value ?? settings.default_toolchain;
      if (typeof channel !== 'string' || !/^[\w.-]{1,160}$/.test(channel)) continue;
      const hostTarget = /-(?:x86_64|aarch64)-pc-windows-(?:msvc|gnu)$/.exec(settings.default_toolchain ?? '')?.[0] ?? '-x86_64-pc-windows-msvc';
      const directory = /-pc-windows-/.test(channel) ? channel : `${channel}${hostTarget}`;
      const executable = join(root, 'toolchains', directory, 'bin', 'rustc.exe');
      const result = await query('rustc', ['--version'], { executable });
      const version = /^rustc (\d+\.\d+\.\d+(?:-[\w.-]+)?)/.exec(result.stdout ?? '')?.[1];
      if (result.state !== 'succeeded' || !version) continue;
      host.probes.rustc = { ...result, version, method: 'rustup_installed_toolchain', channel, versionVerified: true };
      project.requirements.rust.metadata.selectedChannel = channel;
      project.requirements.rust.metadata.channelVerified = true;
      break;
    }
  }
}
