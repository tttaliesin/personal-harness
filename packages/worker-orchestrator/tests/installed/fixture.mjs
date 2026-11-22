import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPackage } from '../../scripts/build-package.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Synthetic local fixture; this never registers a plugin or calls Desktop tools. */
export async function createInstallation(label) {
  const temporaryRoot = path.join(repoRoot, '.local/installed');
  await mkdir(temporaryRoot, { recursive: true });
  const sandbox = await mkdtemp(path.join(temporaryRoot, `${label}-`));
  const catalogRoot = path.join(sandbox, 'catalog');
  const built = await buildPackage({ repoRoot, outputRoot: catalogRoot });
  const root = path.join(sandbox, 'relocated package');
  await cp(built.packageRoot, root, { recursive: true, errorOnExist: true, force: false });
  const stateDir = path.join(sandbox, 'state');
  const workspace = path.join(sandbox, 'workspace');
  await mkdir(workspace);
  let sequence = 0;

  function run(entry, args, input) {
    const result = spawnSync(process.execPath, [path.join(root, entry), ...args], {
      cwd: workspace,
      encoding: 'utf8',
      input: input === undefined ? undefined : JSON.stringify(input),
      env: { ...process.env, NODE_PATH: '' },
      windowsHide: true,
      timeout: 30_000,
    });
    assert.equal(result.error, undefined, result.error?.message);
    return result;
  }

  async function cli(command, input, { failure = false } = {}) {
    const result = run('dist/cli.mjs', [command, '--state-dir', stateDir, ...(input === undefined ? [] : ['--input', '-'])], input);
    await writeFile(path.join(sandbox, `${String(++sequence).padStart(2, '0')}-${command}.json`), result.stdout);
    const response = JSON.parse(result.stdout);
    if (failure) {
      assert.notEqual(result.status, 0, `Expected ${command} to fail.`);
      assert.equal(response.ok, false);
    } else {
      assert.equal(result.status, 0, `${command}: ${result.stderr}\n${result.stdout}`);
      assert.equal(response.ok, true);
    }
    return response;
  }

  async function clone(name) {
    const target = path.join(sandbox, name);
    await cp(root, target, { recursive: true, errorOnExist: true, force: false });
    return target;
  }

  return { sandbox, root, catalogRoot, built, stateDir, workspace, run, cli, clone };
}
