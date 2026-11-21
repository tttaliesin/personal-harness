export const rulesVersion = '0.2.0';
export const checks = Object.freeze({
  name: ['text'], description: ['text'], readme: ['text', 'file', 'index'],
  'commit-message': ['text', 'file'], branch: ['text'], 'pull-request': ['pr', 'pr-create'],
  'file-scope': ['file', 'index', 'revision']
});
export const digestPattern = /^[0-9a-f]{64}$/;
export const oidPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export const readmePath = name => /(?:^|[\\/])readme(?:\.(?:md|markdown))?$/i.test(name);
export class Missing extends Error {}

export function fields(object, required, optional = [], label = 'input') {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw Error(label + ' must be an object');
  for (const key of Object.keys(object)) {
    if (![...required, ...optional].includes(key)) throw Error(label + ': unknown field ' + key);
  }
  for (const key of required) if (!Object.hasOwn(object, key)) throw new Missing(label + ': missing ' + key);
}
export function string(value, label, {empty = false} = {}) {
  if (typeof value !== 'string' || (!empty && !value.trim()) || value.includes('\0')) throw Error('Invalid ' + label);
  return value;
}
export function relativeName(value) {
  string(value, 'relative path');
  if (/[\\:\x00-\x1f]/.test(value) || value.split('/').some(part =>
    !part || part === '.' || part === '..' || part.toLowerCase() === '.git' || /[. ]$/.test(part)))
    throw Error('Expected a portable relative path: ' + value);
  return value;
}
const sourceKeys = {text:['text'], file:['path'], index:[], revision:['revision'], pr:['number','headOid','baseOid','title','body'],
  'pr-create':['repository','headRef','baseRef','headOid','baseOid','title','body','draft']};

function creationRef(value) {
  return value.startsWith('refs/heads/') && value.length > 'refs/heads/'.length
    && !/[\x00-\x20\x7f~^:?*\[\\]/.test(value) && !value.includes('..') && !value.includes('@{') && !value.endsWith('.')
    && value.split('/').every(part => part && !part.startsWith('.') && !part.endsWith('.lock'));
}

export function requestFrom(value, argv) {
  fields(value, ['schemaVersion','operation','check','sources','context'], [], 'request');
  if (value.schemaVersion !== 3 || value.operation !== 'check' || typeof value.check !== 'string' || !Object.hasOwn(checks, value.check))
    throw Error('Expected schemaVersion 3, operation check and a supported check');
  fields(value.context, [], ['repository','bundlePath','productPath','baseRef'], 'context');
  const context = {...value.context};
  const flags = new Map([['--bundle','bundlePath'], ['--repository','repository'], ['--product','productPath']]);
  for (let i=0; i<argv.length; i+=2) {
    const key = flags.get(argv[i]);
    if (!key || !argv[i+1] || argv[i+1].startsWith('--') || Object.hasOwn(context,key))
      throw Error('Unknown, duplicate or incomplete option: ' + argv[i]);
    context[key]=argv[i+1];
  }
  for (const [key, val] of Object.entries(context)) string(val, key);
  if (!context.bundlePath) throw new Missing('Missing context.bundlePath or --bundle');
  if (!Array.isArray(value.sources)) throw Error('sources must be an array');
  if (!value.sources.length) throw new Missing('At least one source is required');
  for (const s of value.sources) {
    if (!s || !checks[value.check].includes(s.kind)) throw Error('Unsupported source kind for ' + value.check);
    const optional = value.check === 'readme' && s.kind === 'text' ? ['path'] : [];
    fields(s, ['kind',...sourceKeys[s.kind]], optional, s.kind);
    if (s.kind === 'text' && Object.hasOwn(s, 'path')) {
      relativeName(s.path);
      if (!context.repository) throw new Missing('context.repository is required for a README text path');
    }
    for (const key of sourceKeys[s.kind]) {
      if (key === 'number') {
        if (!Number.isSafeInteger(s.number) || s.number < 1) throw Error('Invalid PR number');
      } else if (key === 'draft') {
        if (typeof s.draft !== 'boolean') throw Error('Invalid PR draft stage');
      } else {
        string(s[key], key, {empty:['text','title','body'].includes(key)});
        if (key.endsWith('Oid') && !oidPattern.test(s[key])) throw Error('Expected full Git OID: ' + key);
        if (s.kind === 'pr-create' && key === 'repository' && (!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(s.repository)
            || ['.', '..'].includes(s.repository.split('/')[1]))) throw Error('Expected a GitHub owner/repo');
        if (s.kind === 'pr-create' && key.endsWith('Ref') && !creationRef(s[key])) throw Error('Expected a full Git branch ref: ' + key);
      }
    }
  }
  if (value.sources.length !== 1 && !(value.check === 'file-scope' && value.sources.every(s=>s.kind==='file')))
    throw Error('Expected one source or a file-scope list of files');
  return {...value,context};
}

export function productFrom(product) {
  fields(product, ['schemaVersion'], ['bundle','sources','baseRef','outputBoundaries','readmeProfile','branchNamespace','repositoryNameException','commitConvention'], 'product');
  if (product.schemaVersion !== 1) throw new Missing('Unsupported product schemaVersion (expected 1)');
  if ('bundle' in product) {
    fields(product.bundle, ['version','sha256'], [], 'product.bundle');
    string(product.bundle.version, 'product.bundle.version');
    if (typeof product.bundle.sha256 !== 'string' || !digestPattern.test(product.bundle.sha256))
      throw Error('Invalid product.bundle.sha256');
  }
  if ('sources' in product) {
    if (!Array.isArray(product.sources)) throw Error('product.sources must be an array');
    for (const s of product.sources) string(s, 'evidence location');
  }
  if ('baseRef' in product) string(product.baseRef,'product.baseRef');
  if ('readmeProfile' in product && !['default','compact'].includes(product.readmeProfile)) throw Error('Unknown README profile');
  const contractEvidence = (value, label) => {
    for (const key of ['source','scope','expires']) {
      string(value[key],label+'.'+key);
      if (/[\x00-\x1f\x7f\u2028\u2029]/u.test(value[key])) throw Error('Invalid '+label+'.'+key);
    }
  };
  if ('repositoryNameException' in product) {
    const exception=product.repositoryNameException;
    fields(exception,['name','source','scope','expires'],[],'repositoryNameException');
    string(exception.name,'repositoryNameException.name');
    if (!/^[A-Za-z0-9_.-]+$/.test(exception.name) || /[\s\x00-\x1f\x7f]/u.test(exception.name) || ['.','..'].includes(exception.name))
      throw Error('Repository name exceptions must identify one literal portable GitHub name.');
    contractEvidence(exception,'repositoryNameException');
  }
  if ('commitConvention' in product) {
    const convention=product.commitConvention;
    fields(convention,['style','areas','source','scope','expires'],[],'commitConvention');
    if (convention.style!=='upstream-area') throw Error('Unknown upstream commit convention');
    if (!Array.isArray(convention.areas) || !convention.areas.length
        || convention.areas.some(area=>typeof area!=='string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(area) || /[\s\x00-\x1f\x7f]/u.test(area))
        || new Set(convention.areas).size!==convention.areas.length)
      throw Error('Upstream commit areas must be unique literal identifiers.');
    contractEvidence(convention,'commitConvention');
  }
  if ('outputBoundaries' in product) {
    if (!Array.isArray(product.outputBoundaries)) throw Error('outputBoundaries must be an array');
    for (const b of product.outputBoundaries) {
      fields(b,['path','purpose','lifetime'],[],'output boundary');
      relativeName(string(b.path,'output boundary path').replace(/\/$/, ''));
      string(b.purpose,'output purpose'); string(b.lifetime,'output lifetime');
    }
  }
  if ('branchNamespace' in product) {
    fields(product.branchNamespace,['prefix','source','scope','expires'],['kind'],'branchNamespace');
    string(product.branchNamespace.prefix,'branchNamespace.prefix');
    contractEvidence(product.branchNamespace,'branchNamespace');
    if ('kind' in product.branchNamespace && !['host','automation'].includes(product.branchNamespace.kind))
      throw Error('Namespace kind must be host or automation.');
    if (!product.branchNamespace.prefix.endsWith('/') || /[\s\x00-\x1f\x7f]/u.test(product.branchNamespace.prefix))
      throw Error('Namespace prefix must identify an exact prefix with its final slash.');
  }
  return product;
}
