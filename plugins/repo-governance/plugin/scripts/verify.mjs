import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCases } from './cases.mjs';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const digestPattern = /^[a-f0-9]{64}$/;
const loadJSON = p => JSON.parse(readFileSync(p, 'utf8'));
const nonempty = s => typeof s === 'string' && s.trim().length > 0;
function keys(object, required, optional = []) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw Error('Expected an object');
  if (required.some(k => !Object.hasOwn(object, k))) throw Error('Missing fields: ' + required.join(', '));
  if (Object.keys(object).some(k => !required.includes(k) && !optional.includes(k))) throw Error('Unknown fields');
}

export function nativeProcedure(harness, root = defaultRoot) {
  if (!['codex', 'claude-code', 'pi'].includes(harness)) throw Error('Use --harness codex, claude-code, or pi');
  return {
    mode: 'native', harness, status: 'unverified', nativeVerified: false,
    procedure: path.join(root, 'skills/repo-governance/references/native-verification.md'),
    instructions: [
      'Use a real ' + (harness === 'codex' ? 'Codex Desktop' : harness) + ' session with the complete installed bundle.',
      'Observe common-skill and related-rule use with real product evidence for all seven rules.',
      'Observe automatic native mechanical rejection and the original supported tool result, not a callback simulation.',
      'Observe an agent semantic hold despite mechanical pass, and record the real host limits.',
      'Keep session, tool-call, checker, target, before/after, version, and failure evidence outside product sources.',
    ],
    requiredObservationKinds: ['skill-use', 'mechanical-rejection', 'semantic-hold', 'host-limit'],
    automation: 'This command does not start a host, model, API, or remote write.',
  };
}

export function inspectNativeEvidence(harness, evidencePath, root = defaultRoot) {
  const report = nativeProcedure(harness, root);
  const evidence = loadJSON(evidencePath);
  keys(evidence, ['schemaVersion', 'harness', 'hostVersion', 'surface', 'sessionId', 'bundleSha256', 'observations']);
  if (evidence.schemaVersion !== 1 || evidence.harness !== harness) throw Error('Evidence belongs to a different schema or harness');
  if (evidence.surface !== (harness === 'codex' ? 'desktop' : 'cli')) throw Error('Wrong native surface. Codex CLI is not Desktop evidence.');
  if (![evidence.hostVersion, evidence.sessionId].every(nonempty) || !digestPattern.test(evidence.bundleSha256)) throw Error('Missing host, session, or bundle identity');
  const manifest = readFileSync(path.join(root, 'skills/repo-governance/assets/bundle.json'));
  if (sha256(manifest) !== evidence.bundleSha256) throw Error('Evidence bundle differs from the current manifest bytes');
  if (!Array.isArray(evidence.observations)) throw Error('Evidence observations must be an array');
  const {cases, errors} = readCases(root);
  if (errors.length) throw Error('Case sources invalid: ' + errors.join('; '));
  const knownIds = new Set(cases.map(c => c.id));
  const kinds = new Set();
  const inspected = [];
  for (const observation of evidence.observations) {
    keys(observation, ['caseIds', 'kind', 'note', 'artifact']);
    if (!report.requiredObservationKinds.includes(observation.kind) || !nonempty(observation.note)) throw Error('Invalid observation kind or note');
    if (!Array.isArray(observation.caseIds) || !observation.caseIds.length || observation.caseIds.some(id => !knownIds.has(id))) throw Error('Observation must reference real current cases');
    keys(observation.artifact, ['path', 'sha256']);
    if (!nonempty(observation.artifact.path) || !digestPattern.test(observation.artifact.sha256)) throw Error('Invalid artifact identity');
    const artifactPath = realpathSync(path.resolve(path.dirname(evidencePath), observation.artifact.path));
    if (!lstatSync(artifactPath).isFile()) throw Error('Artifact is not a regular file');
    const bytes = readFileSync(artifactPath);
    if (!bytes.length || sha256(bytes) !== observation.artifact.sha256) throw Error('Artifact missing contents or hash mismatch: ' + artifactPath);
    kinds.add(observation.kind);
    inspected.push({kind: observation.kind, caseIds: observation.caseIds, artifact: artifactPath, sha256: observation.artifact.sha256});
  }
  const missing = report.requiredObservationKinds.filter(kind => !kinds.has(kind));
  return {
    ...report, status: missing.length ? 'evidence-incomplete' : 'evidence-consistent',
    scope: 'provided-artifact-consistency', evidencePath: realpathSync(evidencePath), hostVersion: evidence.hostVersion,
    sessionId: evidence.sessionId, inspected, missingObservationKinds: missing,
    outstanding: 'Read the actual session artifacts to judge real calls, semantic decisions, original tool rejection, and case acceptance. Hashes and declarations do not certify native execution.',
  };
}

export function main(argv = process.argv.slice(2), root = defaultRoot) {
  const [mode, ...args] = argv;
  try {
    const options = {};
    if (mode !== 'native') throw Error('Use verify.mjs native --harness <codex|claude-code|pi> [--evidence <path>].');
    for (let i = 0; i < args.length; i += 2) {
      if (!['--harness', '--evidence'].includes(args[i]) || !nonempty(args[i + 1]) || options[args[i]]) throw Error('Use native --harness <codex|claude-code|pi> [--evidence <path>] once');
      options[args[i]] = args[i + 1];
    }
    const report = options['--evidence'] ? inspectNativeEvidence(options['--harness'], path.resolve(options['--evidence']), root) : nativeProcedure(options['--harness'], root);
    return {report, exitCode: report.status === 'evidence-consistent' ? 0 : 3};
  } catch (error) {
    return {report: {mode: mode ?? 'unknown', decision: 'error', nativeVerified: false, message: error.message}, exitCode: 1};
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const {report, exitCode} = main();
  process.stdout.write(JSON.stringify(report) + '\n');
  process.exitCode = exitCode;
}
