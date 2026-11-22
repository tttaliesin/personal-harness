import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import extension from '../plugin/.pi/extensions/repo-governance.ts';

const bundle = fileURLToPath(new URL('../plugin/skills/repo-governance/assets/bundle.json', import.meta.url));
const goodReadme = '# 제품 안내\n\n제품의 사용 방법을 설명합니다.\n';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'governance-pi-adoption-'));
  t.after(() => {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('governance-pi-adoption-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const repository = join(directory, 'product');
  // An unborn repository is enough for the adapter's read-only Git queries.
  for (const path of ['objects', 'refs']) mkdirSync(join(repository, '.git', path), { recursive: true });
  writeFileSync(join(repository, '.git/HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(join(repository, '.git/config'), '[core]\nrepositoryformatversion = 0\nbare = false\n');
  const metadata = join(repository, '.git/repo-governance');
  const marker = join(metadata, 'adoption.json');
  const product = join(metadata, 'product.json');
  const adopt = () => {
    mkdirSync(metadata, { recursive: true });
    writeFileSync(marker, JSON.stringify({ schemaVersion: 1, mode: 'enforce' }));
    writeFileSync(product, JSON.stringify({
      schemaVersion: 1,
      bundle: { version: '0.2.0', sha256: createHash('sha256').update(readFileSync(bundle)).digest('hex') },
      outputBoundaries: []
    }));
  };
  const unadopt = () => { rmSync(marker, { force: true }); rmSync(product, { force: true }); };
  return { repository, marker, product, adopt, unadopt };
}

function host(deliver) {
  const handlers = new Map();
  const messages = [];
  let currentContext = [];
  extension({
    on(event, handler) {
      assert.ok(['tool_call', 'session_tree', 'session_compact'].includes(event), event);
      assert.equal(handlers.has(event), false, event);
      handlers.set(event, handler);
    },
    sendMessage(message, options) {
      assert.deepEqual(options, { triggerTurn: false });
      deliver?.(message, options);
      messages.push(structuredClone(message));
      currentContext.push(structuredClone(message));
    }
  });
  assert.equal(typeof handlers.get('tool_call'), 'function');
  const call = (repository, toolName, input) => handlers.get('tool_call')({ toolName, input }, { cwd: repository });
  const write = (repository, content = goodReadme) => call(repository, 'write', { path: 'README.md', content });
  const emit = (event, repository) => {
    assert.equal(typeof handlers.get(event.type), 'function', event.type);
    return handlers.get(event.type)(event, { cwd: repository });
  };
  return { messages, call, write, emit, handlers, context: () => currentContext, replaceContext: () => { currentContext = []; } };
}

async function withoutProductEnvironment(action) {
  const before = process.env.REPO_GOVERNANCE_PRODUCT;
  delete process.env.REPO_GOVERNANCE_PRODUCT;
  try { return await action(); }
  finally {
    if (before === undefined) delete process.env.REPO_GOVERNANCE_PRODUCT;
    else process.env.REPO_GOVERNANCE_PRODUCT = before;
  }
}

test('the real pi callback reports not-adopted to host context and preserves the allowed tool', t => withoutProductEnvironment(async () => {
  const f = fixture(t), pi = host();
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(pi.messages.length, 1);
  assert.equal(pi.messages[0].customType, 'repo-governance');
  assert.equal(pi.messages[0].display, true);
  const report = JSON.parse(pi.messages[0].content);
  assert.equal(report.decision, 'allow');
  assert.equal(report.inspection, 'not-adopted');
  assert.equal(report.scope, 'none');
  assert.deepEqual(report.checks, []);
  assert.equal(report.adoption[0].repository, resolve(f.repository));
  assert.equal(report.adoption[0].source, 'none');
  assert.match(report.coverage, /No governance candidate was inspected/);
  assert.equal(existsSync(join(f.repository, 'README.md')), false);
}));

test('pi suppresses repeated unadopted notices in the same cwd without treating queries as adoption changes', t => withoutProductEnvironment(async () => {
  const f = fixture(t), pi = host();
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(await pi.call(f.repository, 'read', { path: 'README.md' }), undefined);
  assert.equal(await pi.call(f.repository, 'bash', { command: 'git status --short' }), undefined);
  assert.equal(await pi.call(f.repository, 'write', { path: 'source.mjs', content: 'export const value = 1;\n' }), undefined);
  assert.equal(pi.messages.length, 1);
}));

test('pi reports each changed cwd and reports an unadopted cwd again after returning to it', t => withoutProductEnvironment(async () => {
  const first = fixture(t), second = fixture(t), pi = host();
  for (const f of [first, second, first, first]) assert.equal(await pi.write(f.repository), undefined);
  assert.deepEqual(pi.messages.map(message => JSON.parse(message.content).adoption[0].repository),
    [first, second, first].map(f => resolve(f.repository)));
}));

test('pi notices observed adoption changes and reports again when that worktree becomes unadopted', t => withoutProductEnvironment(async () => {
  const f = fixture(t), pi = host();
  assert.equal(await pi.write(f.repository), undefined);
  f.adopt();
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(pi.messages.length, 1);
  f.unadopt();
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(pi.messages.length, 2);
  assert.equal(JSON.parse(pi.messages[1].content).inspection, 'not-adopted');
}));

test('pi enforces clone defaults without a product file', t => withoutProductEnvironment(async () => {
  const f = fixture(t), pi = host();
  const marker = join(dirname(f.marker), 'clone-adoption.json');
  mkdirSync(dirname(marker), {recursive: true});
  writeFileSync(marker, JSON.stringify({schemaVersion: 2, mode: 'enforce'}));
  assert.equal(await pi.write(f.repository), undefined);
  assert.deepEqual(pi.messages, []);
  const denied = await pi.call(f.repository, 'bash', {command: 'gh repo create Bad_Name --private'});
  assert.equal(denied.block, true);
  assert.match(denied.reason, /K1/);
  assert.equal(existsSync(f.product), false);
}));

test('pi keeps adopted failures blocked and resets the notice after an observed adoption failure', t => withoutProductEnvironment(async () => {
  const f = fixture(t), pi = host();
  assert.equal(await pi.write(f.repository), undefined);
  f.adopt();
  const denied = await pi.call(f.repository, 'bash', {command: 'gh repo create Bad_Name --private'});
  assert.equal(denied.block, true);
  assert.match(denied.reason, /K1/);
  rmSync(f.product);
  const missing = await pi.write(f.repository);
  assert.equal(missing.block, true);
  assert.match(missing.reason, /required-input/);
  writeFileSync(f.marker, '{');
  const malformed = await pi.write(f.repository);
  assert.equal(malformed.block, true);
  assert.match(malformed.reason, /ADOPTION_INPUT/);
  const invalid = await pi.call(f.repository, 'write', null);
  assert.equal(invalid.block, true);
  assert.match(invalid.reason, /CHECK-ERROR/);
  assert.equal(pi.messages.length, 1);
  f.unadopt();
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(pi.messages.length, 2);
}));

test('pi read and query callbacks stay quiet even when adoption metadata is malformed', t => withoutProductEnvironment(async () => {
  const f = fixture(t), pi = host();
  for (const mutate of [() => {}, () => { f.adopt(); writeFileSync(f.marker, '{'); }]) {
    mutate();
    assert.equal(await pi.call(f.repository, 'read', { path: 'README.md' }), undefined);
    assert.equal(await pi.call(f.repository, 'bash', { command: 'git status --short' }), undefined);
    assert.equal(await pi.call(f.repository, 'bash', { command: 'gh pr merge --help' }), undefined);
    assert.equal(pi.messages.length, 0);
  }
}));

test('a failed pi notice cannot block an unadopted tool and is retried on the next relevant call', t => withoutProductEnvironment(async () => {
  const f = fixture(t);
  let deliveries = 0;
  const pi = host(() => { if (++deliveries === 1) throw Error('Host status delivery failed'); });
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(pi.messages.length, 0);
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(pi.messages.length, 1);
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(deliveries, 2);
}));

for (const event of [
  { type: 'session_tree', newLeafId: 'before-notice', oldLeafId: 'after-notice' },
  {
    type: 'session_compact', fromExtension: false, reason: 'manual', willRetry: false,
    compactionEntry: {
      type: 'compaction', id: 'compact', parentId: 'after-notice', timestamp: '2026-11-17T00:00:00.000Z',
      summary: 'Product work', firstKeptEntryId: 'after-notice', tokensBefore: 1000
    }
  }
]) test('pi reports again when ' + event.type + ' replaces context containing the earlier notice', t => withoutProductEnvironment(async () => {
  const f = fixture(t), pi = host();
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(pi.context().length, 1);
  pi.replaceContext();
  assert.equal(pi.context().length, 0);
  assert.equal(await pi.emit(event, f.repository), undefined);
  assert.deepEqual([...pi.handlers.keys()].sort(), ['session_compact', 'session_tree', 'tool_call']);
  assert.equal(pi.messages.length, 1);
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(pi.messages.length, 2);
  assert.equal(pi.context().length, 1);
  assert.equal(JSON.parse(pi.context()[0].content).inspection, 'not-adopted');
  assert.equal(await pi.write(f.repository), undefined);
  assert.equal(pi.messages.length, 2);
}));

test('pi treats opposite orders of the same worktree scopes as one notice without mutating the report', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { mock } from 'node:test';
    const scopes = [{ repository: '/workspace/first', source: 'none' }, { repository: '/workspace/second', source: 'none' }];
    const reports = [[scopes[1], scopes[0]], [scopes[0], scopes[1]]].map(adoption => ({
      schemaVersion: 3, scope: 'none', checks: [], findings: [], decision: 'allow',
      inspection: 'not-adopted', adoption, coverage: 'No governance candidate was inspected.'
    }));
    const before = structuredClone(reports);
    let next = 0;
    mock.module(${JSON.stringify(new URL('../plugin/skills/repo-governance/scripts/tool-call.mjs', import.meta.url).href)}, {
      namedExports: { evaluateNativeCall: async () => reports[next++], decisionReason: () => 'unexpected denial' }
    });
    const { default: extension } = await import(${JSON.stringify(new URL('../plugin/.pi/extensions/repo-governance.ts', import.meta.url).href)});
    const handlers = new Map(), messages = [];
    extension({
      on(event, handler) { handlers.set(event, handler); },
      sendMessage(message, options) { assert.deepEqual(options, { triggerTurn: false }); messages.push(structuredClone(message)); }
    });
    const callback = handlers.get('tool_call');
    for (let i = 0; i < reports.length; i++) {
      assert.equal(await callback({ toolName: 'write', input: { path: 'source.mjs', content: '' } }, { cwd: '/workspace/first' }), undefined);
    }
    assert.equal(next, 2);
    assert.equal(messages.length, 1, 'reversing scope order must not create a second notice');
    assert.deepEqual(reports, before, 'cache sorting must not mutate the original decisions');
    assert.deepEqual(JSON.parse(messages[0].content), before[0], 'the emitted report must keep its original scope order');
  `;
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--experimental-test-module-mocks', '--input-type=module', '-'], {
    input: script, encoding: 'utf8', windowsHide: true, timeout: 10000
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
