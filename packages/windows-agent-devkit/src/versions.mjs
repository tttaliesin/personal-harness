import semver from 'semver';
import * as pep440 from '@renovatebot/pep440';

// The language-specific libraries define range grammar and prerelease semantics.
function tuple(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(?:v|go)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match || match.slice(1).some((part) => part !== undefined && (!Number.isSafeInteger(Number(part)) || /^0\d/.test(part)))) return null;
  return { values: match.slice(1).map((part) => Number(part ?? 0)), parts: match.slice(1).filter((part) => part !== undefined).length };
}

function compare(left, right) {
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

function rangeMatches(actual, expression, language, request) {
  if (typeof expression !== 'string' || expression.length > 512 || !expression.trim()) return null;
  try {
    if (language === 'python') {
      let specifier = expression.trim();
      if (request.kind === 'exact' && /^\d+(?:\.\d+){0,2}$/.test(specifier)) {
        specifier = `==${specifier}${specifier.split('.').length < 3 ? '.*' : ''}`;
      }
      if (/poetry/i.test(request.field ?? '') && /^[~^]\d/.test(specifier)) {
        const target = tuple(specifier.slice(1));
        if (!target) return null;
        const upper = [...target.values];
        const position = specifier[0] === '~' ? (target.parts > 1 ? 1 : 0) : upper[0] > 0 ? 0 : upper[1] > 0 ? 1 : 2;
        upper[position]++;
        for (let i = position + 1; i < 3; i++) upper[i] = 0;
        specifier = `>=${target.values.join('.')},<${upper.join('.')}`;
      }
      return pep440.valid(actual) && pep440.validRange(specifier) ? pep440.satisfies(actual, specifier) : null;
    }
    const range = semver.validRange(expression);
    return semver.valid(actual) && range !== null ? semver.satisfies(actual, range) : null;
  } catch { return null; }
}

function sdkMatches(actual, requested, metadata) {
  const target = tuple(requested);
  if (!target || target.parts !== 3) return null;
  const options = metadata.sdk ?? metadata.globalJson?.sdk ?? metadata;
  if (options.paths?.length || metadata.paths?.length) return null;
  const policy = options.rollForward ?? 'patch';
  const sameMajor = actual[0] === target.values[0];
  const sameMinor = sameMajor && actual[1] === target.values[1];
  const sameBand = sameMinor && Math.floor(actual[2] / 100) === Math.floor(target.values[2] / 100);
  const atLeast = compare(actual, target.values) >= 0;
  switch (policy) {
    case 'disable': return compare(actual, target.values) === 0;
    case 'patch': case 'latestPatch': return sameBand && atLeast;
    case 'feature': case 'latestFeature': return sameMinor && atLeast;
    case 'minor': case 'latestMinor': return sameMajor && atLeast;
    case 'major': case 'latestMajor': return atLeast;
    default: return null;
  }
}

export function evaluateVersion(observed, requests, metadata = {}) {
  const language = metadata.language ?? 'node';
  const actualText = typeof observed === 'string' ? observed.trim().replace(/^(?:go|v)(?=\d)/, '') : '';
  const actual = tuple(actualText);
  const valid = language === 'python' ? pep440.valid(actualText) : semver.valid(actualText);
  if (!valid && !actual) return { compatibility: 'unknown', reason: 'unsupported_observed_version' };
  if (!requests?.length) return { compatibility: 'unknown', reason: 'no_version_requirement' };
  const groups = new Map();
  const keyOf = (request) => typeof request.source === 'string' && typeof request.field === 'string' ? `${request.source}\0${request.field}` : null;
  for (const request of requests) if (['exact', 'channel'].includes(request.kind) && keyOf(request)) {
    const key = keyOf(request);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(request.value);
  }
  const multiple = new Set([...groups].filter(([, values]) => values.size > 1).map(([key]) => key));
  const outcomes = requests.filter((request) => request.kind !== 'preferred').map((request) => {
    // Multi-version manager declarations are not simultaneous exact pins.
    // A selected/default command needs separate evidence before comparison.
    if (multiple.has(keyOf(request))) return null;
    if (request.kind === 'channel') return metadata.selectedChannel === request.value && metadata.channelVerified === true ? true : null;
    if (request.kind === 'minimum') {
      const target = tuple(request.value);
      return target && semver.valid(actualText) ? semver.gte(actualText, target.values.join('.')) : null;
    }
    if (request.kind === 'sdk') return actual ? sdkMatches(actual.values, request.value, metadata) : null;
    return rangeMatches(actualText, request.value, language, request);
  });
  if (outcomes.includes(false)) return { compatibility: 'violated', reason: 'version_mismatch' };
  if (!outcomes.length || outcomes.includes(null)) return { compatibility: 'unknown', reason: multiple.size ? 'multiple_version_selection_unverified' : 'unsupported_requirement' };
  return { compatibility: 'satisfied', reason: 'version_satisfied' };
}
