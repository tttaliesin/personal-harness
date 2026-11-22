import { readFile, mkdir, writeFile, lstat, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { dirname, join, resolve, relative, isAbsolute, sep } from 'node:path';
import { runCheck } from '../skills/repo-governance/scripts/check.mjs';
import { productFrom } from '../skills/repo-governance/scripts/contracts.mjs';
import { localNativeScope, nativeGitEnvironment, nativeMetadataLocations, readCloneAdoption } from '../skills/repo-governance/scripts/native-product.mjs';
import { root, bundlePath, verifyBundle } from './bundle.mjs';

const operation = process.argv[2];
const env = process.env;
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const hash = data => createHash('sha256').update(data).digest('hex');

async function check() {
  if (env.REPO_GOVERNANCE_DEPRECATED_CATALOG || env.REPO_GOVERNANCE_POLICY) throw new Error('CATALOG and POLICY were removed. Use a schemaVersion 3 check request with BUNDLE and optional PRODUCT.');
  const requestPath = env.REPO_GOVERNANCE_REQUEST;
  if (!requestPath) throw new Error('Specify REQUEST=<request.json>');
  const text = await readFile(requestPath, 'utf8');
  const request = JSON.parse(text);
  const args = [];
  for (const [key, value] of [['bundle', env.REPO_GOVERNANCE_BUNDLE], ['repository', env.REPO_GOVERNANCE_REPOSITORY], ['product', env.REPO_GOVERNANCE_PRODUCT]]) {
    if (value) args.push('--' + key, value);
  }
  if (!env.REPO_GOVERNANCE_BUNDLE && !request?.context?.bundlePath) args.push('--bundle', bundlePath);
  const result = await runCheck(text, args);
  process.stdout.write(result.line);
  process.exitCode = result.exitCode;
}

async function demo() {
  const request = JSON.parse(await readFile(join(root, 'skills/repo-governance/assets/examples/name-invalid.json'), 'utf8'));
  request.context = { ...request.context, bundlePath };
  const result = await runCheck(JSON.stringify(request));
  const value = JSON.parse(result.line);
  if (result.exitCode !== 2 || value.decision !== 'violation' || !value.findings.some(item => item.ruleId.startsWith('K1'))) throw new Error('The demo must report a K1 name-format violation.');
  process.stdout.write(result.line);
}

async function doctor() {
  const result = await runCheck(JSON.stringify({ schemaVersion: 3, operation: 'check', check: 'name', sources: [{ kind: 'text', text: 'product-inventory-api' }], context: { bundlePath } }));
  let gitVersion;
  try { gitVersion = execFileSync('git', ['--version'], { encoding: 'utf8', windowsHide: true }).trim(); } catch { gitVersion = null; }
  emit({ operation: 'doctor', root, bundlePath, node: process.version, git: gitVersion, checker: JSON.parse(result.line), connections: ['codex', 'claude-code', 'pi', 'ci'].map(harness => ({ harness, execution: 'not-observed', note: '설정·설치 확인은 실제 호출·차단 증거가 아닙니다.' })) });
  process.exitCode = result.exitCode || (gitVersion ? 0 : 3);
}

async function adopt() {
  if (!env.REPO_GOVERNANCE_TARGET) throw new Error('Specify TARGET=<repository>');
  const repository = resolve(env.REPO_GOVERNANCE_TARGET);
  const locations = await nativeMetadataLocations(repository);
  if (!locations) throw new Error('TARGET must identify an existing Git worktree.');
  await verifyBundle({ pack: false });
  const adoptionPath = locations.cloneAdoptionPath;
  let changed = false;
  if (!(await readCloneAdoption(adoptionPath))) {
    await mkdir(dirname(adoptionPath), { recursive: true });
    try {
      await writeFile(adoptionPath, JSON.stringify({schemaVersion: 2, mode: 'enforce'}) + '\n', { flag: 'wx' });
      changed = true;
    } catch (error) {
      if (error.code !== 'EEXIST' || !(await readCloneAdoption(adoptionPath))) throw error;
    }
  }
  emit({ operation: 'adopt', decision: 'pass', changed, repository, adoptionPath, scope: 'local-clone', execution: 'not-observed' });
}

async function bindProduct() {
  if (!env.REPO_GOVERNANCE_TARGET || !env.REPO_GOVERNANCE_PRODUCT) throw new Error('Specify TARGET=<repository> and PRODUCT=<product.json>');
  const target = resolve(env.REPO_GOVERNANCE_TARGET);
  const repository = target;
  const selected = resolve(env.REPO_GOVERNANCE_PRODUCT);
  const bytes = await readFile(selected);
  productFrom(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)));
  const adoption = await localNativeScope(repository);
  const { localProductPath: destination, localAdoptionPath: adoptionPath } = adoption;
  if (!destination) throw new Error('TARGET must identify an existing Git worktree.');
  let before;
  try {
    const entry = await lstat(destination);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('Review the existing local product input; it must be a regular file.');
    before = await readFile(destination);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (before && !before.equals(bytes)) {
    if (!env.REPO_GOVERNANCE_BACKUP) {
      emit({ operation: 'bind-product', decision: 'needs-context', changed: false, repository, destination, reason: 'A different local product input already exists. Review that input before replacing its binding, or specify a new external BACKUP file.' });
      process.exitCode = 3;
      return;
    }
  }
  let backupPath;
  if (before && !before.equals(bytes)) {
    backupPath = await externalNewFile(env.REPO_GOVERNANCE_BACKUP, repository);
    await writeFile(backupPath, before, { flag: 'wx' });
    await writeFile(destination, bytes);
  }
  if (!before) {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: 'wx' });
  }
  const adoptionChanged = adoption.adoption !== 'marker';
  if (adoptionChanged) await writeFile(adoptionPath, JSON.stringify({schemaVersion: 1, mode: 'enforce'}) + '\n', { flag: 'wx' });
  emit({ operation: 'bind-product', decision: 'pass', changed: !before || adoptionChanged || !!backupPath, repository, destination,
    ...(backupPath ? { backupPath, backupSha256: hash(before) } : {}),
    adoptionPath, adoptionChanged, sha256: hash(bytes), scope: 'local-native-configuration', execution: 'not-observed' });
}

function inside(directory, path) {
  const name = relative(directory, path);
  return name === '' || name !== '..' && !name.startsWith('..' + sep) && !isAbsolute(name);
}

async function externalNewFile(path, repository) {
  const destination = resolve(path);
  const excluded = [resolve(root), await realpath(root)];
  if (repository) excluded.push(await realpath(execFileSync('git', ['-C', repository, '-c', 'core.fsmonitor=false', 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8', windowsHide: true, env: nativeGitEnvironment(), timeout: 10000, maxBuffer: 64 * 1024
  }).trim()));
  if (excluded.some(directory => inside(directory, destination))) throw new Error('OUTPUT and BACKUP must be outside the runtime distribution and selected product worktree.');
  for (let parent = dirname(destination); ; parent = dirname(parent)) {
    const entry = await lstat(parent);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('OUTPUT and BACKUP require existing regular parent directories without symbolic links.');
    if (parent === dirname(parent)) break;
  }
  try { await lstat(destination); throw new Error('OUTPUT and BACKUP must name a new file; an existing path is preserved.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  return destination;
}

async function showProduct() {
  if (env.REPO_GOVERNANCE_TARGET && env.REPO_GOVERNANCE_PRODUCT) throw new Error('Specify either TARGET or PRODUCT, not both.');
  let source;
  if (env.REPO_GOVERNANCE_TARGET) {
    const selected = await localNativeScope(resolve(env.REPO_GOVERNANCE_TARGET));
    if (!selected.productPath) throw new Error('TARGET must identify an existing Git worktree with a local product input.');
    source = selected.productPath;
  } else if (env.REPO_GOVERNANCE_PRODUCT) source = resolve(env.REPO_GOVERNANCE_PRODUCT);
  let product;
  if (source) {
    const entry = await lstat(source);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error('The existing product input must be a regular file.');
    product = productFrom(JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await readFile(source))));
    if (product.bundle) {
      const bundleBytes = await readFile(bundlePath);
      product.bundle = { version: JSON.parse(bundleBytes).version, sha256: hash(bundleBytes) };
    }
  } else {
    product = productFrom(JSON.parse(await readFile(join(root, 'skills/repo-governance/assets/product.example.json'), 'utf8')));
  }
  if (!env.REPO_GOVERNANCE_OUTPUT) { emit(product); return; }
  const destination = await externalNewFile(env.REPO_GOVERNANCE_OUTPUT, env.REPO_GOVERNANCE_TARGET);
  const bytes = Buffer.from(JSON.stringify(product, null, 2) + '\n', 'utf8');
  await writeFile(destination, bytes, { flag: 'wx' });
  emit({ operation: 'show-product', decision: 'pass', changed: true, destination, ...(source ? { source } : {}),
    ...(product.bundle ? { bundle: product.bundle } : {}), sha256: hash(bytes), scope: 'external-product-input' });
}

function verifyNative() {
  const args = ['native', '--harness', env.REPO_GOVERNANCE_HARNESS ?? ''];
  if (env.REPO_GOVERNANCE_EVIDENCE) args.push('--evidence', env.REPO_GOVERNANCE_EVIDENCE);
  const result = spawnSync(process.execPath, [join(root, 'scripts/verify.mjs'), ...args], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

async function installCodex() {
  const source = await realpath(env.REPO_GOVERNANCE_INSTALL_SOURCE || root);
  const { sha256: bundleSha256 } = await verifyBundle({ pack: false, directory: source });
  const marketplace = 'repo-governance-local';
  const pluginId = 'repo-governance@' + marketplace;
  const catalog = JSON.parse(await readFile(join(source, '.agents', 'plugins', 'marketplace.json'), 'utf8'));
  const plugin = catalog.plugins?.find(item => item?.name === 'repo-governance');
  if (catalog.name !== marketplace || plugin?.source?.source !== 'local')
    throw new Error('Expected the Repo Governance local marketplace in the verified bundle.');

  function run(args, cwd = source) {
    const result = spawnSync('codex', ['plugin', ...args], {
      cwd, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 1024 * 1024
    });
    if (result.error) throw result.error;
    return result;
  }

  function checked(result) {
    if (result.status !== 0) throw new Error(result.stderr?.trim() || result.stdout?.trim() || 'Codex plugin command failed.');
    return result.stdout;
  }

  const add = ['marketplace', 'add', '--json', '.'];
  const remove = ['marketplace', 'remove', '--json', marketplace];
  const registration = run(add);
  const conflict = "Error: marketplace '" + marketplace + "' is already added from a different source; remove it before adding this source";
  let previousSource;
  if (registration.status === 1 && registration.stderr?.trim().split(/\r?\n/).at(-1) === conflict) {
    const list = JSON.parse(checked(run(['marketplace', 'list', '--json'])));
    const matches = list.marketplaces?.filter(item => item?.name === marketplace) ?? [];
    if (matches.length !== 1 || typeof matches[0].root !== 'string' || !isAbsolute(matches[0].root))
      throw new Error('Could not identify the previous Repo Governance source. Its registration was preserved.');
    previousSource = matches[0].root;
    checked(run(remove));
  } else {
    checked(registration);
  }

  let replacementRegistered = false;
  let installedPath;
  try {
    if (previousSource) {
      checked(run(add));
      replacementRegistered = true;
    }
    const installed = JSON.parse(checked(run(['add', '--json', pluginId])));
    if (installed.pluginId !== pluginId || typeof installed.installedPath !== 'string' || !isAbsolute(installed.installedPath))
      throw new Error('Codex did not report the installed Repo Governance path.');
    installedPath = installed.installedPath;
    const actual = await verifyBundle({ pack: false, directory: installedPath });
    if (actual.sha256 !== bundleSha256) throw new Error('The installed Repo Governance bundle differs from the selected source.');
  } catch (error) {
    if (previousSource) {
      try {
        if (replacementRegistered) checked(run(remove));
        checked(run(add, previousSource));
      } catch (rollback) {
        throw new Error(error.message + '\nCould not restore the previous marketplace registration: ' + rollback.message);
      }
    }
    throw error;
  }

  emit({
    operation: 'install-codex',
    decision: 'pass',
    scope: 'verified-installed-files',
    installedPath,
    bundleSha256,
    replacedMarketplace: !!previousSource,
    desktopState: 'verify-hook-in-desktop',
    message: 'Codex Desktop의 설정 → Hook → Repo Governance에서 훅 신뢰와 활성 상태를 확인하세요.'
  });
}

try {
  if (process.argv.length !== 3) throw new Error('Task commands accept named Taskfile variables.');
  switch (operation) {
    case 'check': await check(); break;
    case 'demo': await demo(); break;
    case 'doctor': await doctor(); break;
    case 'adopt': await adopt(); break;
    case 'bind-product': await bindProduct(); break;
    case 'show-ci': process.stdout.write(await readFile(join(root, 'templates/github-actions.yml'), 'utf8')); break;
    case 'show-product': await showProduct(); break;
    case 'install-codex': await installCodex(); break;
    case 'verify-bundle': emit(await verifyBundle()); break;
    case 'verify-native': verifyNative(); break;
    default: throw new Error('Unsupported task: ' + operation);
  }
} catch (error) {
  emit({ schemaVersion: 3, rulesVersion: 'unavailable', check: 'invalid', scope: 'mechanical', decision: 'error', observed: [], findings: [{ ruleId: 'INPUT', code: 'TASK_ERROR', message: error.message, target: operation ?? '' }], semanticChecks: [] });
  process.exitCode = 1;
}
