import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, lstatSync, mkdtempSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { caseGroups, readCases } from '../plugin/scripts/cases.mjs';
import { inspectNativeEvidence as inspectEvidence, nativeProcedure as procedure, main as nativeMain } from '../plugin/scripts/verify.mjs';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const plugin = root => path.join(root, 'plugin');
export const nativeProcedure = (harness, root = defaultRoot) => procedure(harness, plugin(root));
export const inspectNativeEvidence = (harness, evidence, root = defaultRoot) => inspectEvidence(harness, evidence, plugin(root));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const checks = caseGroups.slice(0, 7).map(g => g[4]);
const loadJSON = p => JSON.parse(readFileSync(p, 'utf8'));
function keys(object, required, optional = []) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw Error('Expected an object');
  if (required.some(k => !Object.hasOwn(object, k))) throw Error('Missing fields: ' + required.join(', '));
  if (Object.keys(object).some(k => !required.includes(k) && !optional.includes(k))) throw Error('Unknown fields');
}

function mechanicalFixtures(root) {
  let catalogue;
  try { catalogue = loadJSON(path.join(root, 'tests/cases/mechanical.json')); }
  catch (error) {
    if (error.code === 'ENOENT') throw Error('Development fixtures are not included in the runtime distribution. Run coverage or mechanical from the repo-governance source checkout.');
    throw error;
  }
  keys(catalogue, ['schemaVersion', 'rulesVersion', 'fixtures']);
  if (catalogue.schemaVersion !== 1 || catalogue.rulesVersion !== '0.2.0') throw Error('Incompatible mechanical fixture version');
  return catalogue.fixtures;
}

export function verifyCoverage(root = defaultRoot) {
  const {cases, errors} = readCases(plugin(root));
  const detailed = cases.filter(c => c.ruleId);
  const fixtures = mechanicalFixtures(root);
  if (!Array.isArray(fixtures)) throw Error('Mechanical fixtures must be an array');
  const fixtureIds = new Set();
  for (const f of fixtures) {
    if (typeof f.id !== 'string' || !/^[a-z][a-z0-9.-]*$/.test(f.id) || fixtureIds.has(f.id)) errors.push('Invalid or duplicate fixture: ' + f.id);
    fixtureIds.add(f.id);
    if (f.scope !== 'mechanical-subset' || !checks.includes(f.check) || f.request?.check !== f.check)
      errors.push(f.id + ': invalid fixture scope or check');
    if (!Array.isArray(f.sourceCaseIds) || !f.sourceCaseIds.length || new Set(f.sourceCaseIds).size !== f.sourceCaseIds.length || f.sourceCaseIds.some(id => !detailed.some(c => c.id === id && c.check === f.check)))
      errors.push(f.id + ': fixture is not linked to a real detailed source case');
    const exitCodes = {pass: 0, violation: 2, 'needs-context': 3, error: 1};
    if (!Object.hasOwn(exitCodes, f.expected?.decision) || exitCodes[f.expected.decision] !== f.expected?.exitCode)
      errors.push(f.id + ': inconsistent expected exit code');
  }
  for (const check of checks) for (const decision of ['pass', 'violation']) {
    if (!fixtures.some(f => f.check === check && f.expected.decision === decision)) errors.push(check + ': no executable ' + decision + ' fixture');
  }
  return {
    mode: 'coverage', scope: 'source-catalogue', decision: errors.length ? 'error' : 'catalogue-consistent',
    catalogued: { detailed: detailed.length, common: cases.length - detailed.length, total: cases.length },
    mechanicalFixturesAvailable: fixtures.length, executedCases: 0, nativeVerified: false,
    outstanding: 'Normative semantic expectations and native behavior require actual agent/session evidence.', errors,
  };
}

function cleanGitEnvironment() {
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
}
function treeSnapshot(root) {
  const rows = [];
  const visit = dir => {
    for (const entry of readdirSync(dir).sort()) {
      const p = path.join(dir, entry), info = lstatSync(p);
      if (info.isDirectory()) visit(p);
      else if (info.isFile()) rows.push([path.relative(root, p), sha256(readFileSync(p))]);
      else throw Error('Unexpected non-file fixture entry: ' + p);
    }
  };
  visit(root);
  return JSON.stringify(rows);
}

export function verifyMechanical(root = defaultRoot) {
  const coverage = verifyCoverage(root);
  if (coverage.errors.length) throw Error('Catalogue invalid: ' + coverage.errors.join('; '));
  const fixtures = mechanicalFixtures(root);
  const manifestPath = path.join(plugin(root), 'skills/repo-governance/assets/bundle.json');
  const manifestBytes = readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  const env = cleanGitEnvironment();
  const temp = mkdtempSync(path.join(tmpdir(), 'repo-governance-mechanical-'));
  const results = [];
  const git = (dir, args) => {
    const p = spawnSync('git', ['-c', 'core.hooksPath=' + path.join(temp, 'empty-hooks'), '-c', 'commit.gpgsign=false', '-C', dir, ...args], {env, encoding: 'utf8', timeout: 10000});
    if (p.error || p.status !== 0) throw Error('Fixture git failed: ' + (p.error?.message ?? p.stderr));
  };
  try {
    mkdirSync(path.join(temp, 'empty-hooks'));
    for (const fixture of fixtures) {
      const repository = path.join(temp, fixture.id);
      mkdirSync(repository);
      const request = structuredClone(fixture.request);
      request.context.bundlePath = manifestPath;
      if (fixture.setup !== 'text') {
        git(repository, ['init', '-q']);
        git(repository, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@invalid', 'commit', '--allow-empty', '-qm', 'test: 격리된 검사 기준을 준비한다']);
        request.context.repository = repository;
      }
      if (fixture.setup.startsWith('index-')) {
        mkdirSync(path.join(repository, 'src'));
        mkdirSync(path.join(repository, '.cache'));
        writeFileSync(path.join(repository, '.gitignore'), '.cache/\n');
        writeFileSync(path.join(repository, 'src/product.mjs'), 'export const price = 1;\n');
        git(repository, ['add', '--', 'src/product.mjs', '.gitignore']);
        if (fixture.setup === 'index-output') {
          writeFileSync(path.join(repository, '.cache/run.log'), 'regenerable run output\n');
          git(repository, ['add', '-f', '--', '.cache/run.log']);
        }
        const productPath = path.join(repository, 'product.json');
        writeFileSync(productPath, JSON.stringify({schemaVersion: 1, bundle: {version: manifest.version, sha256: sha256(manifestBytes)}, outputBoundaries: [{path: '.cache', purpose: 'Regenerable local fixture output', lifetime: 'This fixture run'}]}));
        request.context.productPath = productPath;
      }
      const before = treeSnapshot(repository);
      const p = spawnSync(process.execPath, [path.join(plugin(root), 'skills/repo-governance/scripts/check.mjs')], {
        cwd: root, env, input: JSON.stringify(request), encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024,
      });
      const unchanged = before === treeSnapshot(repository);
      let response, error;
      try {
        if (p.error) throw p.error;
        const lines = p.stdout.trim().split(/\r?\n/);
        if (lines.length !== 1 || !p.stdout.endsWith('\n')) throw Error('Checker did not return one newline-terminated JSON line');
        response = JSON.parse(lines[0]);
        if (response.schemaVersion !== 3 || response.scope !== 'mechanical' || response.check !== fixture.check) throw Error('Wrong response contract or scope');
        if (response.decision !== fixture.expected.decision || p.status !== fixture.expected.exitCode) throw Error('Unexpected decision or exit code');
        if (!Array.isArray(response.semanticChecks) || (response.decision === 'pass' && !response.semanticChecks.length)) throw Error('Mechanical pass must leave semantic questions');
        if (!unchanged) throw Error('Checker changed fixture files or Git state');
      } catch (e) { error = e.message; }
      results.push({id: fixture.id, check: fixture.check, sourceCaseIds: fixture.sourceCaseIds, scope: 'mechanical-subset', passed: !error, decision: response?.decision, exitCode: p.status, unchanged, ...(error ? {error, stderr: p.stderr, response} : {})});
    }
    return {
      mode: 'mechanical', scope: 'mechanical-fixtures', decision: results.every(r => r.passed) ? 'pass' : 'error',
      executedFixtures: results.length, passedFixtures: results.filter(r => r.passed).length,
      cataloguedCasesExecutedInFull: 0, nativeVerified: false, results,
      outstanding: 'Fixtures exercise mechanical subsets only. Semantic expectations and native sessions remain separate.',
    };
  } finally {
    const absoluteTemp = path.resolve(temp), absoluteBase = path.resolve(tmpdir());
    if (path.dirname(absoluteTemp) !== absoluteBase || !path.basename(absoluteTemp).startsWith('repo-governance-mechanical-')) throw Error('Refusing cleanup outside the fixture directory');
    rmSync(absoluteTemp, {recursive: true, force: true});
  }
}

export function main(argv = process.argv.slice(2), root = defaultRoot) {
  const [mode, ...args] = argv;
  try {
    let report, exitCode;
    if (mode === 'coverage' && !args.length) {
      report = verifyCoverage(root); exitCode = report.errors.length ? 1 : 0;
    } else if (mode === 'mechanical' && !args.length) {
      report = verifyMechanical(root); exitCode = report.decision === 'pass' ? 0 : 1;
    } else if (mode === 'native') {
      return nativeMain(argv, plugin(root));
    } else throw Error('Use verify.mjs coverage | mechanical | native --harness <codex|claude-code|pi> [--evidence <path>]');
    return {report, exitCode};
  } catch (e) {
    return {report: {mode: mode ?? 'unknown', decision: 'error', nativeVerified: false, message: e.message}, exitCode: 1};
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const {report, exitCode} = main();
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exitCode = exitCode;
}
