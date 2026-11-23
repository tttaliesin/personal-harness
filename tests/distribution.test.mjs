import assert from 'node:assert/strict';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resourcePaths, sha256, verifyBundle } from '../packages/repo-governance/plugin/scripts/bundle.mjs';

const root = await realpath(fileURLToPath(new URL('../', import.meta.url)));
const standalonePlugins = {
  'personal-harness-skills': { path: './skills/custom' },
  'personal-harness-adapters': { path: './skills/adapters' },
};

// Update the pinned versions and hashes when publishing verified release directories.
const plugins = {
  'repo-governance': {
    path: './packages/repo-governance/plugin',
    requiredFiles: [
      'hooks/codex.json',
      'hooks/run.mjs',
      'skills/repo-governance/SKILL.md',
      'skills/repo-governance/scripts/check.mjs',
    ],
  },
  'windows-agent-devkit': {
    path: './packages/windows-agent-devkit/release',
    release: {
      version: '0.3.5',
      inventorySha256: '6211565cdc8eafdec3e69e4c947b09953f4680b875278bc8e8c423d21d489b09',
    },
    requiredFiles: [
      'dist/cli.mjs',
      'scripts/collect-host.ps1',
      'scripts/collect-advanced.ps1',
      'skills/environment-doctor/SKILL.md',
    ],
  },
  'worker-orchestrator': {
    path: './packages/worker-orchestrator/release',
    release: {
      version: '0.1.6',
      inventorySha256: '82b8843c95ac705494684618c7fbc29ecbb2705226c5f976ab5890389ed9435e',
    },
    requiredFiles: [
      'dist/cli.mjs',
      'lib/cli/main.mjs',
      'skills/worker-controller/SKILL.md',
      'skills/worker-executor/SKILL.md',
      'workflows/worker-result.schema.json',
    ],
  },
  ...standalonePlugins,
};

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function standaloneSkillFolders(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== '.codex-plugin')
    .map((entry) => entry.name)
    .sort();
}

test('standalone skill directories contain regular SKILL.md files', async () => {
  for (const { path } of Object.values(standalonePlugins)) {
    const folders = await standaloneSkillFolders(join(root, path));
    assert.ok(folders.length > 0, `Expected standalone skills under ${path}`);
    for (const folder of folders) {
      const manifest = `${path}/${folder}/SKILL.md`;
      assert.ok((await lstat(join(root, manifest))).isFile(), `Expected a regular file at ${manifest}`);
    }
  }
});

test('the public Codex marketplace points to complete plugin distributions', async (t) => {
  const catalog = await readJson(join(root, '.agents/plugins/marketplace.json'));
  assert.equal(catalog.name, 'personal-harness');
  assert.deepEqual(catalog.plugins.map(({ name }) => name).sort(), Object.keys(plugins).sort());

  for (const { name, source } of catalog.plugins) {
    await t.test(name, async () => {
      const { path, requiredFiles = [], release } = plugins[name];
      assert.equal(source.source, 'local');
      assert.equal(source.path, path);
      const directory = join(root, path);
      assert.equal(await realpath(directory), directory, `Redirected plugin directory ${path}`);

      const paths = await resourcePaths(directory);
      const { name: manifestName, version, skills } = await readJson(join(directory, '.codex-plugin/plugin.json'));
      assert.equal(manifestName, name);
      assert.ok(typeof version === 'string' && version.length > 0, 'Expected a plugin version');
      if (paths.includes('plugin.json')) {
        const portable = await readJson(join(directory, 'plugin.json'));
        assert.equal(portable.name, name);
        assert.equal(portable.version, version);
      }
      for (const relativePath of requiredFiles) {
        assert.ok(paths.includes(relativePath), `Missing runtime file ${relativePath}`);
      }

      if (Object.hasOwn(standalonePlugins, name)) {
        const folders = await standaloneSkillFolders(directory);
        const expectedSkills = folders.map((folder) => `./${folder}/`);
        assert.ok(Array.isArray(skills), `Expected ${name} to list its skill directories`);
        assert.deepEqual([...skills].sort(), expectedSkills);
      } else if (release) {
        assert.equal(version, release.version);
        const sortedPaths = [...paths].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
        const properties = await Promise.all(sortedPaths.map(async (relativePath) => {
          const bytes = await readFile(join(directory, relativePath));
          return `${JSON.stringify(relativePath)}:${JSON.stringify(sha256(bytes))}`;
        }));
        // The release digests use compact, ASCII-escaped JSON in sorted path order.
        const inventory = `{${properties.join(',')}}`.replace(/[\u007f-\uffff]/g,
          (unit) => `\\u${unit.charCodeAt(0).toString(16).padStart(4, '0')}`);
        assert.equal(sha256(inventory), release.inventorySha256, `Published files changed for ${name}@${version}`);
      } else {
        await verifyBundle({ pack: false, directory });
      }
    });
  }
});
