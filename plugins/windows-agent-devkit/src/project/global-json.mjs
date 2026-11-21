import semver from 'semver';
import { parseJsonObject, stripJsonComments } from './json.mjs';

const SDK_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const ROLL_FORWARD = ['patch', 'feature', 'minor', 'major', 'latestPatch', 'latestFeature', 'latestMinor', 'latestMajor', 'disable'];

function sdkPath(value) {
  if (value === '$host$') return true;
  return typeof value === 'string' && value.length > 0 && value.length <= 240 && value.trim() === value &&
    !/[\x00-\x1f\x7f@$%{}?*|<>"]/.test(value) && !value.replace(/^[A-Za-z]:[\\/]/, '').includes(':');
}

export function validateSdkOptions(sdk = {}) {
  if (sdk === null || typeof sdk !== 'object' || Array.isArray(sdk)) throw new TypeError('sdk 필드의 객체 형식을 확인할 수 없습니다.');
  const options = {};
  if (Object.hasOwn(sdk, 'version')) {
    if (typeof sdk.version !== 'string' || sdk.version.length > 160 || sdk.version.trim() !== sdk.version ||
        !SDK_VERSION.test(sdk.version) || !semver.valid(sdk.version)) {
      throw new TypeError('sdk.version 필드의 버전 표현을 정적으로 해석할 수 없습니다.');
    }
    options.version = sdk.version;
  }
  if (Object.hasOwn(sdk, 'rollForward')) {
    if (!ROLL_FORWARD.includes(sdk.rollForward) || (!options.version && sdk.rollForward !== 'latestMajor')) {
      throw new TypeError('sdk.rollForward 필드의 정책 또는 필수 버전을 확인할 수 없습니다.');
    }
    options.rollForward = sdk.rollForward;
  }
  if (Object.hasOwn(sdk, 'allowPrerelease')) {
    if (typeof sdk.allowPrerelease !== 'boolean') throw new TypeError('sdk.allowPrerelease 필드의 불리언 형식을 확인할 수 없습니다.');
    options.allowPrerelease = sdk.allowPrerelease;
  }
  if (Object.hasOwn(sdk, 'paths')) {
    if (!Array.isArray(sdk.paths) || sdk.paths.length > 32 || !sdk.paths.every(sdkPath)) {
      throw new TypeError('sdk.paths 필드에 지원하지 않는 경로 표현이 있습니다.');
    }
    options.paths = sdk.paths;
  }
  if (Object.hasOwn(sdk, 'errorMessage') && sdk.errorMessage != null && typeof sdk.errorMessage !== 'string') {
    throw new TypeError('sdk.errorMessage 필드의 문자열 형식을 확인할 수 없습니다.');
  }
  return options;
}

export function parseGlobalJson(text) {
  let data;
  // The .NET host parser accepts comments. Trailing commas remain invalid.
  try { data = parseJsonObject(stripJsonComments(text)); }
  catch { throw new SyntaxError('global.json의 주석 또는 JSON 객체 형식을 확인할 수 없습니다.'); }
  return Object.hasOwn(data, 'sdk') ? validateSdkOptions(data.sdk) : undefined;
}
