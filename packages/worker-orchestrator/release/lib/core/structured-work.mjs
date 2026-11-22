import { requireCondition as check } from '../contracts/errors.mjs';

// Canonical effort order. Only the candidates supplied for this model may be used.
const EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
const CHECK_STATUSES = ['met', 'unmet', 'uncertain'];
const REPORTED_STATUSES = ['passed', 'failed', 'not_run', 'unknown'];

export function object(value, name) {
  check(value !== null && typeof value === 'object' && !Array.isArray(value),
    'INVALID_INPUT', `${name} must be an object.`);
  return value;
}

export function text(value, name) {
  check(typeof value === 'string' && value.trim().length > 0,
    'INVALID_INPUT', `${name} must be a nonempty string.`);
  return value;
}

function textArray(value, name) {
  check(Array.isArray(value), 'INVALID_INPUT', `${name} must be an array.`);
  return value.map((entry, index) => text(entry, `${name}[${index}]`));
}

export function parseWorkSpec(value, initialThinking) {
  if (value === undefined) return undefined;
  object(value, 'workSpec');
  check(Object.keys(value).every(key =>
    ['goal', 'constraints', 'completionCriteria', 'reasoningEscalations'].includes(key)),
  'INVALID_INPUT', 'workSpec contains an unsupported field.');
  const goal = text(value.goal, 'workSpec.goal');
  const constraints = textArray(value.constraints, 'workSpec.constraints');
  check(Array.isArray(value.completionCriteria) && value.completionCriteria.length > 0,
    'INVALID_INPUT', 'workSpec.completionCriteria must be a nonempty array.');
  const ids = new Set();
  const completionCriteria = value.completionCriteria.map((criterion, index) => {
    const field = `workSpec.completionCriteria[${index}]`;
    object(criterion, field);
    check(Object.keys(criterion).every(key => key === 'id' || key === 'description'),
      'INVALID_INPUT', `${field} supports only id and description.`);
    const id = text(criterion.id, `${field}.id`);
    check(id === id.trim() && !ids.has(id), 'INVALID_INPUT',
      'Completion criterion IDs must be unique and have no surrounding whitespace.');
    ids.add(id);
    return { id, description: text(criterion.description, `${field}.description`) };
  });
  const reasoningEscalations = value.reasoningEscalations === undefined ? []
    : textArray(value.reasoningEscalations, 'workSpec.reasoningEscalations');
  let previous = EFFORTS.indexOf(initialThinking);
  check(!reasoningEscalations.length || previous !== -1, 'INVALID_INPUT',
    'An ordered reasoning escalation requires a recognized initial effort.');
  for (const effort of reasoningEscalations) {
    const next = EFFORTS.indexOf(effort);
    check(next > previous, 'INVALID_INPUT',
      'Reasoning escalations must be recognized efforts strictly above the initial and preceding efforts.');
    previous = next;
  }
  return { goal, constraints, completionCriteria, ...(reasoningEscalations.length ? { reasoningEscalations } : {}) };
}

function parseCheck(value, name) {
  object(value, name);
  check(CHECK_STATUSES.includes(value.status), 'INVALID_INPUT', `${name}.status must be met, unmet, or uncertain.`);
  check(typeof value.note === 'string', 'INVALID_INPUT', `${name}.note must be a string.`);
  return { status: value.status, evidenceRefs: [...new Set(textArray(value.evidenceRefs, `${name}.evidenceRefs`))].sort(),
    note: value.note };
}

export function parseEvaluation(input, spec) {
  const resultEventId = text(input.resultEventId, 'resultEventId');
  check(Array.isArray(input.checks), 'INVALID_INPUT', 'checks must be an array.');
  const byId = new Map();
  for (const entry of input.checks) {
    object(entry, 'check');
    const id = text(entry.id, 'check.id');
    check(!byId.has(id), 'INVALID_INPUT', 'Each completion criterion must be checked exactly once.');
    byId.set(id, parseCheck(entry, 'check'));
  }
  check(byId.size === spec.completionCriteria.length && spec.completionCriteria.every(({ id }) => byId.has(id)),
    'INVALID_INPUT', 'checks must cover exactly the original completion criterion IDs.');
  check(!spec.constraints.length || input.constraintReview !== undefined, 'CONSTRAINT_REVIEW_REQUIRED',
    'The original work constraints require an explicit constraintReview.');
  const constraintReview = input.constraintReview === undefined ? undefined
    : parseCheck(input.constraintReview, 'constraintReview');
  let userDecision;
  if (input.userDecision !== undefined) {
    object(input.userDecision, 'userDecision');
    const { kind, question } = input.userDecision;
    check(['scope', 'authorization', 'user_input'].includes(kind), 'INVALID_INPUT', 'Unknown userDecision kind.');
    userDecision = { kind, question: text(question, 'userDecision.question') };
  }
  check(input.keepWorker === undefined || typeof input.keepWorker === 'boolean',
    'INVALID_INPUT', 'keepWorker must be a boolean when specified.');
  return { resultEventId, checks: spec.completionCriteria.map(({ id }) => ({ id, ...byId.get(id) })),
    ...(constraintReview && { constraintReview }), ...(userDecision && { userDecision }),
    keepWorker: input.keepWorker ?? true };
}

function workerVerification(observation) {
  let report = observation.result?.verification;
  // Older Desktop observations keep the worker's JSON report in the summary.
  if (report === undefined && typeof observation.result?.summary === 'string') {
    try {
      const parsed = JSON.parse(observation.result.summary.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ''));
      if (parsed?.runId === observation.runId) report = parsed.verification;
    } catch { /* A result summary can also be plain text. */ }
  }
  if (!REPORTED_STATUSES.includes(report?.status) || !Array.isArray(report.evidenceRefs)) return null;
  return { status: report.status, evidenceRefs: report.evidenceRefs.filter(ref => typeof ref === 'string' && ref.trim()) };
}

export function decisionEvidence(spec, review, observation) {
  const reported = workerVerification(observation);
  // A controller can independently verify a source also cited by the worker.
  const assess = entry => ({ ...entry, controllerEvidenceRefs: entry.evidenceRefs });
  const checks = review.checks.map((entry, index) => ({
    ...assess(entry), description: spec.completionCriteria[index].description,
  }));
  const constraintReview = review.constraintReview ? assess(review.constraintReview) : null;
  return { resultEvidenceRef: observation.evidenceRef, workerVerification: reported, checks, constraintReview };
}

export function isSupportedCheck(entry) {
  return entry.status === 'met' && entry.controllerEvidenceRefs.length > 0;
}

export function nextRetryProfile(task) {
  const current = EFFORTS.indexOf(task.profile.thinking);
  const next = task.workSpec.reasoningEscalations?.find(effort => EFFORTS.indexOf(effort) > current);
  return next ? { model: task.requestedProfile.model, thinking: next } : null;
}
