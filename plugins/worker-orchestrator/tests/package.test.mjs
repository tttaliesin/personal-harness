import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { buildPackage } from '../scripts/build-package.mjs';
import { checkPackage } from '../scripts/check-package.mjs';
import { Orchestrator } from '../src/core/orchestrator.mjs';
import { createInstallation } from './installed/fixture.mjs';

// A single build snapshot is copied per adversarial case; default dist/ is untouched.
const installation = createInstallation('package-test');
const execFileAsync = promisify(execFile);

async function replaceResource(root, relative, transform) {
  const filename = path.join(root, relative);
  const data = Buffer.from(transform(await readFile(filename, 'utf8')));
  await writeFile(filename, data);
  const manifestPath = path.join(root, 'package-manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files[relative] = { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') };
  await writeFile(manifestPath, JSON.stringify(manifest));
}

test('relocated package validates itself and opens usable SQLite state with only installed resources', async () => {
  const fixture = await installation;
  await assert.rejects(access(path.join(fixture.root, 'src')));
  const structural = await checkPackage({ root: fixture.root, stateDir: fixture.stateDir, smoke: false });
  assert.equal(structural.capabilities, null);
  await assert.rejects(access(fixture.stateDir), { code: 'ENOENT' });
  const checked = await checkPackage({ root: fixture.root, stateDir: fixture.stateDir });
  assert.equal(checked.version, fixture.built.version);
  assert.deepEqual(checked.skills, ['worker-controller', 'worker-executor']);
  const selfCheck = fixture.run('scripts/check-package.mjs', ['--state-dir', fixture.stateDir]);
  assert.equal(selfCheck.status, 0, selfCheck.stderr);
  assert.equal(JSON.parse(selfCheck.stdout).root, fixture.root);
  assert.equal((await fixture.cli('capabilities')).execution, 'controller-mediated');
  const db = new DatabaseSync(path.join(fixture.stateDir, 'state.sqlite'), { readOnly: true });
  try {
    const versions = db.prepare('SELECT version FROM schema_migrations ORDER BY version').all();
    assert.deepEqual(versions.map(row => row.version), [1, 2, 3]);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM projects').get().count, 0);
  } finally {
    db.close();
  }
  const catalog = await checkPackage({ root: fixture.built.packageRoot, marketplaceRoot: fixture.catalogRoot, smoke: false });
  assert.equal(catalog.marketplaceChecked, true);
});

test('installed package smoke rejects an existing file as the SQLite state directory', async () => {
  const fixture = await installation;
  const stateDir = path.join(fixture.sandbox, 'state-file');
  await writeFile(stateDir, 'keep this file');
  assert.equal((await checkPackage({ root: fixture.root, stateDir, smoke: false })).ok, true);
  const result = fixture.run('scripts/check-package.mjs', ['--state-dir', stateDir]);
  assert.equal(result.status, 1, result.stdout);
  const failure = JSON.parse(result.stderr);
  assert.equal(failure.ok, false);
  assert.match(failure.error, /Installed CLI SQLite status failed:[\s\S]*"code": "STATE_ERROR"/);
  assert.equal(await readFile(stateDir, 'utf8'), 'keep this file');
});

test('installed package reads existing project authorization and worker bindings at the default state path', async () => {
  const fixture = await installation;
  const localAppData = path.join(fixture.sandbox, 'default-local-app-data');
  const controller = { threadId: 'default-state-controller', hostId: 'local' };
  const worker = { threadId: 'default-state-worker', hostId: 'local' };
  const project = {
    projectId: 'default-state-project', projectRoot: fixture.workspace, hostProjectId: 'default-state-host-project',
    controller, authorization: { createWorkers: true, sendFollowups: true, archiveCompleted: true,
      restoreWorkers: true, source: 'Existing test authorization' },
  };
  const scope = { projectId: project.projectId, taskId: 'existing-task' };
  const authorization = { ...project.authorization, scope: 'project' };
  const registry = new Orchestrator(path.join(localAppData, 'WorkerOrchestrator', 'state'));
  let runId;
  try {
    registry.execute('project', project);
    registry.execute('project', { ...project, authorization }, controller);
    const dispatched = registry.execute('dispatch', { ...scope, requestId: 'existing-request',
      prompt: 'Run the existing task.', profile: { model: 'fixture-model', thinking: 'low' } }, controller);
    runId = dispatched.task.runId;
    registry.execute('record', { ...scope, actionId: dispatched.action.id, outcome: 'succeeded',
      receipt: { workerRef: worker }, evidenceRef: 'fixture:created-worker' }, controller);
  } finally {
    registry.close();
  }

  const installed = spawnSync(process.execPath, [path.join(fixture.root, 'dist/cli.mjs'), 'status', '--input', '-'], {
    cwd: fixture.workspace, env: { ...process.env, LOCALAPPDATA: localAppData },
    encoding: 'utf8', input: JSON.stringify(scope), windowsHide: true, timeout: 30_000,
  });
  assert.ifError(installed.error);
  assert.equal(installed.status, 0, installed.stdout);
  const result = JSON.parse(installed.stdout);
  assert.deepEqual(result.project.authorization, authorization);
  assert.deepEqual(result.project.controllerRef, controller);
  assert.deepEqual(result.task.workerRef, worker);
  assert.equal(result.task.runId, runId);
});

test('checker detects changed bytes even when a filename and byte count are unchanged', async () => {
  const root = await (await installation).clone('tampered');
  const filename = path.join(root, 'dist/cli.mjs');
  const source = await readFile(filename, 'utf8');
  const tampered = source.replace('main(', 'maim(');
  assert.notEqual(tampered, source);
  assert.equal(Buffer.byteLength(tampered), Buffer.byteLength(source));
  await writeFile(filename, tampered);
  await assert.rejects(checkPackage({ root, smoke: false }), /Hash mismatch/);
});

test('checker rejects a missing internal Markdown target even with a matching hash', async () => {
  const root = await (await installation).clone('missing-link');
  await replaceResource(root, 'README.md', source => `${source}\n[missing](docs/absent.md)\n`);
  await assert.rejects(checkPackage({ root, smoke: false }), /Missing resource/);
});

test('checker accepts simple quoted YAML discovery values', async () => {
  const root = await (await installation).clone('quoted-discovery');
  await replaceResource(root, 'skills/worker-controller/SKILL.md', source => source
    .replace('name: worker-controller', 'name: "worker-controller"')
    .replace(/^description: .+$/m, "description: 'Manage a controller''s authorized worker chats.'"));
  assert.equal((await checkPackage({ root, smoke: false })).ok, true);
});

test('checker follows Markdown reference destinations', async () => {
  const root = await (await installation).clone('missing-reference');
  await replaceResource(root, 'README.md', source => `${source}\n[Guide][guide]\n\n[guide]: docs/absent.md\n`);
  await assert.rejects(checkPackage({ root, smoke: false }), /Missing resource/);
});

test('manifest entries cannot traverse outside the installed root', async () => {
  const root = await (await installation).clone('path-traversal');
  const filename = path.join(root, 'package-manifest.json');
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  manifest.files['../outside'] = { sha256: '0'.repeat(64), bytes: 0 };
  await writeFile(filename, JSON.stringify(manifest));
  await assert.rejects(checkPackage({ root, smoke: false }), /Non-normalized manifest path/);
});

test('runtime imports cannot depend on an npm module or leave the package', async () => {
  const fixture = await installation;
  for (const [name, specifier] of [['bare-import', 'missing-npm-module'], ['escaped-import', '../../outside.mjs']]) {
    const root = await fixture.clone(name);
    await replaceResource(root, 'dist/cli.mjs', source => `${source}\nimport '${specifier}';\n`);
    await assert.rejects(checkPackage({ root, smoke: false }), /External runtime dependency|Resource escapes package/);
  }
});

test('build preserves foreign output files and checker reports the stale inventory', async () => {
  const fixture = await installation;
  const foreign = path.join(fixture.built.packageRoot, 'foreign.txt');
  await writeFile(foreign, 'preserve this file');
  await buildPackage({ outputRoot: fixture.catalogRoot });
  assert.equal(await readFile(foreign, 'utf8'), 'preserve this file');
  await assert.rejects(checkPackage({ root: fixture.built.packageRoot, smoke: false }), /File inventory differs/);
});

test('two Node processes can publish to the same initially empty output', async () => {
  const fixture = await installation;
  const outputRoot = path.join(fixture.sandbox, 'parallel', 'catalog');
  const builder = new URL('../scripts/build-package.mjs', import.meta.url);
  const script = `
    import { buildPackage } from ${JSON.stringify(builder.href)};
    console.log(JSON.stringify(await buildPackage({ outputRoot: process.argv[1] })));
  `;
  const build = () => execFileAsync(process.execPath, ['--input-type=module', '-e', script, outputRoot], {
    timeout: 40_000,
    windowsHide: true,
  });
  const builds = await Promise.all([build(), build()]);
  const root = path.join(outputRoot, 'worker-orchestrator');
  for (const { stdout } of builds) {
    const built = JSON.parse(stdout);
    assert.equal(built.ok, true);
    assert.equal(built.packageRoot, root);
  }
  const checked = await checkPackage({ root, marketplaceRoot: outputRoot, smoke: false });
  assert.equal(checked.marketplaceChecked, true);
  assert.equal(checked.files, JSON.parse(builds[0].stdout).files);
});

test('checker waits for a catalog publication before reading the package and manifests', async () => {
  const fixture = await installation;
  const outputRoot = path.join(fixture.sandbox, 'checking-during-build');
  const { packageRoot: root } = await buildPackage({ outputRoot });
  const manifest = path.join(root, 'package-manifest.json');
  const saved = path.join(fixture.sandbox, 'publication-manifest.json');
  const lock = new DatabaseSync(path.join(outputRoot, '.worker-orchestrator-build.sqlite'));
  try {
    lock.exec('PRAGMA journal_mode = MEMORY; BEGIN EXCLUSIVE');
    await rename(manifest, saved);
    const checked = checkPackage({ root, marketplaceRoot: outputRoot, smoke: false });
    const finished = checked.then(() => true, () => true);
    try {
      assert.equal(await Promise.race([finished, delay(100, false)]), false);
    } finally {
      await rename(saved, manifest);
    }
    lock.close();
    assert.equal((await checked).marketplaceChecked, true);
  } finally {
    if (lock.isOpen) lock.close();
  }
});

test('a blocked publication preserves foreign output and can be retried', async () => {
  const fixture = await installation;
  const outputRoot = path.join(fixture.sandbox, 'retry-build');
  const obstruction = path.join(outputRoot, '.agents/plugins/marketplace.json');
  await mkdir(obstruction, { recursive: true });
  await writeFile(path.join(obstruction, 'foreign.txt'), 'preserve this file');
  await assert.rejects(buildPackage({ outputRoot }), /Refusing to overwrite non-regular output/);
  await assert.rejects(access(path.join(outputRoot, 'worker-orchestrator/package-manifest.json')), { code: 'ENOENT' });

  const preserved = path.join(outputRoot, 'foreign-content');
  await rename(obstruction, preserved);
  const { packageRoot: root } = await buildPackage({ outputRoot });
  assert.equal(await readFile(path.join(preserved, 'foreign.txt'), 'utf8'), 'preserve this file');
  assert.equal((await checkPackage({ root, marketplaceRoot: outputRoot, smoke: false })).marketplaceChecked, true);
});
