import { MAX_ENTRIES, MAX_FILES } from './project/files.mjs';

const setupActions = new Map([['go-task/setup-task', 'task'], ['extractions/setup-just', 'just']]);
const makeProvision = /^(?:choco(?:\.exe)?[ \t]+install[ \t]+make(?:[ \t]+(?:-y|--yes))?|scoop(?:\.cmd)?[ \t]+install[ \t]+make)$/i;
const literalLine = /^(?:[A-Za-z0-9_./:=+,-]+|"[A-Za-z0-9_./:=+, *?-]*"|'[A-Za-z0-9_./:=+, *?-]*')(?:[ \t]+(?:[A-Za-z0-9_./:=+,-]+|"[A-Za-z0-9_./:=+, *?-]*"|'[A-Za-z0-9_./:=+, *?-]*'))*$/;

const directOperations = new Map([
  ['go build', ['go', 'build']], ['go test', ['go', 'test']], ['go vet', ['go', 'check']],
  ['cargo build', ['rust', 'build']], ['cargo test', ['rust', 'test']],
  ['cargo check', ['rust', 'check']], ['cargo clippy', ['rust', 'check']],
  ['zig build-exe', ['zig', 'build']], ['zig build-lib', ['zig', 'build']], ['zig build-obj', ['zig', 'build']],
  ['zig test', ['zig', 'test']], ['zig ast-check', ['zig', 'check']],
  ['dotnet build', ['dotnet', 'build']], ['dotnet test', ['dotnet', 'test']],
]);
const pythonModules = new Map([
  ['unittest', 'test'], ['pytest', 'test'], ['build', 'build'], ['compileall', 'check'], ['ruff', 'check'],
]);
const unquote = (argument) => /^["']/.test(argument) ? argument.slice(1, -1) : argument;

function nativePath(argument) {
  const value = argument.startsWith('"') ? argument.slice(1, -1) : argument;
  const relative = value.replace(/^\.\//, '');
  return relative.split('/').every((part) => /^\.?[A-Za-z0-9_][A-Za-z0-9_. -]*$/.test(part) && !/[. ]$/.test(part))
    ? relative : null;
}

function nativeOperation(args) {
  if (args.length < 3 || args.at(-2) !== '-o') return null;
  const output = nativePath(args.at(-1));
  if (!output) return null;
  if (args[0] === '-c' && args.length === 4 && /\.(?:o|obj)$/.test(output)) {
    const source = nativePath(args[1]);
    if (source && /\.c$/.test(source)) return { language: 'native', operation: 'compile', object: output };
  }
  const inputs = args.slice(0, -2).map(nativePath);
  if (inputs.every((input) => input && /\.(?:o|obj)$/.test(input) && input !== output)) {
    return { language: 'native', operation: 'link', inputs };
  }
  return null;
}

function directOperation(command) {
  // Only recognize shell words with a small literal grammar. Keep their original text for comparison.
  if (command.length > MAX_ENTRIES || !literalLine.test(command)) return null;
  const [executable, subcommand = '', ...args] = command.match(/"[^"]*"|'[^']*'|[^ \t]+/g);
  const tool = executable.replace(/\.(?:exe|cmd)$/, '');
  if ([subcommand, ...args].some((argument) => ['--help', '--version', '-h'].includes(unquote(argument)))) return null;
  if (['cc', 'gcc', 'clang'].includes(tool)) return nativeOperation([subcommand, ...args]);

  let match = directOperations.get(tool + ' ' + subcommand);
  if (tool === 'go' && args.some((argument) => /^-(?:exec|toolexec)(?:=|$)/.test(unquote(argument)))) return null;
  if (tool === 'node') {
    if (args.some((argument) => /^(?:-[epr]|--(?:eval|print|run|require|import|(?:experimental-)?loader)(?:=|$))/.test(unquote(argument)))) return null;
    if (subcommand === '--test') match = ['node', 'test'];
    if (['--check', '-c'].includes(subcommand)) match = ['node', 'check'];
  }
  if (tool === 'tsc') match = ['node', [subcommand, ...args].includes('--noEmit') ? 'check' : 'build'];
  if (tool === 'pytest') match = ['python', 'test'];
  if (['python', 'python3', 'py'].includes(tool) && subcommand === '-m' && pythonModules.has(args[0])) {
    if (args[0] !== 'ruff' || args[1] === 'check') match = ['python', pythonModules.get(args[0])];
  }
  if (tool === 'ruff' && subcommand === 'check') match = ['python', 'check'];
  if (tool === 'cargo' && subcommand === 'fmt' && args.includes('--check')) match = ['rust', 'check'];
  if (tool === 'zig' && subcommand === 'build') {
    const namedStep = ['test', 'check'].includes(args[0]) ? args[0] : null;
    if (args.slice(namedStep ? 1 : 0).every((argument) => argument.startsWith('-'))) match = ['zig', namedStep ?? 'build'];
  }
  if (tool === 'zig' && subcommand === 'fmt' && args.includes('--check')) match = ['zig', 'check'];
  if (tool === 'dotnet' && subcommand === 'format' && args.includes('--verify-no-changes')) match = ['dotnet', 'check'];
  return match ? { language: match[0], operation: match[1] } : null;
}

export function taskRunnerWorkflowStep(step, { atProjectRoot, afterCheckout }) {
  if (Object.hasOwn(step, 'if')) return null;
  if (Object.hasOwn(step, 'uses')) {
    if (Object.hasOwn(step, 'run') || typeof step.uses !== 'string') return null;
    const action = /^([A-Za-z0-9-]+\/[A-Za-z0-9-]+)@[A-Za-z0-9_][A-Za-z0-9_./-]*$/.exec(step.uses)?.[1];
    const tool = setupActions.get(action?.toLowerCase());
    return tool ? { tool } : null;
  }
  if (!atProjectRoot || typeof step.run !== 'string' || /[^\S \t\r\n]/.test(step.run)) return null;
  const command = step.run.trim();
  if (makeProvision.test(command)) return { tool: 'make' };
  if (!afterCheckout) return null;
  const operation = directOperation(command);
  return operation && { ...operation, command };
}

function addMatch(groups, key, occurrence) {
  const matches = groups.get(key);
  if (matches) matches.push(occurrence);
  else groups.set(key, [occurrence]);
}

function adjacentMatches(occurrences, offset) {
  const groups = new Map();
  for (const occurrence of occurrences) {
    const command = occurrence.job.steps[occurrence.start + offset]?.command;
    if (command) addMatch(groups, command, occurrence);
  }
  return groups;
}

function fileDependency(steps) {
  const objects = new Set();
  for (const step of steps) {
    if (step.inputs?.some((input) => objects.has(input))) return true;
    if (step.object) objects.add(step.object);
  }
  return false;
}

/** Compare commands and artifact paths inside the analyzer. Return only operation names and evidence selectors. */
export function taskRunnerWorkflowEvidence(jobs) {
  const starts = new Map(), evidence = [];
  for (const entry of jobs) {
    const job = { ...entry, prepared: [] };
    for (const [start, step] of job.steps.entries()) {
      if (step?.tool) job.prepared.push({ tool: step.tool, step: start });
      const next = job.steps[start + 1];
      if (step?.command && next?.command) addMatch(starts, step.command, { job, start });
    }
  }

  let remainingEntries = MAX_ENTRIES;
  let remainingComparisons = MAX_ENTRIES * MAX_FILES;
  for (const start of starts.values()) {
    if (start[0].job === start.at(-1).job) continue;
    const pending = [...adjacentMatches(start, 1).values()].map((occurrences) => ({ length: 2, occurrences }));
    while (pending.length) {
      if (remainingEntries < 8) return evidence;
      const { length, occurrences } = pending.pop();
      // Occurrences are grouped by job throughout refinement.
      if (occurrences[0].job === occurrences.at(-1).job) continue;
      remainingComparisons -= occurrences.length;
      if (remainingComparisons < 0) return evidence;
      // The last occurrence in each job can include preparation between that job's repeats.
      const latestStart = new Map(occurrences.map(({ job, start }) => [job, start]));
      const next = adjacentMatches(occurrences, length);
      for (const matches of next.values()) pending.push({ length: length + 1, occurrences: matches });
      const extendsAllJobs = (groups) => [...groups.values()].some((matches) =>
        new Set(matches.map(({ job }) => job)).size === latestStart.size);
      if (extendsAllJobs(next) || extendsAllJobs(adjacentMatches(occurrences, -1))) continue;

      const size = length * (latestStart.size + 1) + latestStart.size;
      if (size > remainingEntries) continue;
      const prepared = [];
      for (const [job, start] of latestStart) {
        for (const { tool, step } of job.prepared) {
          if (step >= start || size + prepared.length > remainingEntries) break;
          prepared.push({ tool, source: job.source, job: job.job, step });
        }
        if (size + prepared.length > remainingEntries) break;
      }
      if (size + prepared.length > remainingEntries) continue;
      remainingEntries -= size + prepared.length;
      const first = occurrences[0];
      const steps = first.job.steps.slice(first.start, first.start + length);
      const record = {
        jobs: [...latestStart].map(([{ source, job }, start]) => ({
          source, job, steps: Array.from({ length }, (_, index) => start + index),
        })),
        operations: steps.map(({ language, operation }) => ({ language, operation })),
        prepared,
      };
      if (fileDependency(steps)) record.fileDependency = true;
      evidence.push(record);
    }
  }
  return evidence;
}
