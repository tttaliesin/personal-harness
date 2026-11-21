import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from '../skills/repo-governance/scripts/vendor/markdown-it.mjs';

const defaultRoot = fileURLToPath(new URL('../', import.meta.url));
const caseTable = new MarkdownIt('zero').enable('table');

// Stable IDs and routing define coverage; the Markdown tables own the case text.
export const caseGroups = [
  ['N', 22, 'specs/naming.md', 'K1', 'name'],
  ['DESC', 22, 'specs/description.md', 'K2', 'description'],
  ['RM', 37, 'specs/readme.md', 'K3', 'readme'],
  ['CMT', 28, 'specs/commits.md', 'K4', 'commit-message'],
  ['BR', 17, 'specs/branches.md', 'K5', 'branch'],
  ['PR', 17, 'specs/pull-requests.md', 'K6', 'pull-request'],
  ['FILE', 20, 'specs/file-inclusion.md', 'K7', 'file-scope'],
  ['T', 7, 'SPEC.md'], ['A', 19, 'SPEC.md'], ['FI', 19, 'SPEC.md'], ['E', 12, 'SPEC.md'],
];

export function readCases(root = defaultRoot) {
  const cases = [];
  const errors = [];
  const groups = new Map(caseGroups.map(group => [group[0], group]));
  const expectedIds = new Set(caseGroups.flatMap(([prefix, count]) => Array.from({length: count}, (_, i) => prefix + (i + 1))));
  for (const sourcePath of new Set(caseGroups.map(group => group[2]))) {
    const lines = readFileSync(path.join(root, sourcePath), 'utf8').split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const identity = /^\|\s*([A-Z]+)(\d+)\s*\|/.exec(line);
      if (!identity || !groups.has(identity[1])) continue;
      const id = identity[1] + identity[2];
      const [, , expectedPath, ruleId, check] = groups.get(identity[1]);
      const row = /^\|\s*([A-Z]+\d+)\s*\| (.*?) \| (.*?) \|$/.exec(line.trimEnd());
      // A table header must match its delimiter width; body rows silently discard extra cells.
      const table = caseTable.parse(line.trimEnd() + '\n| --- | --- | --- |\n', {});
      if (!row || table[0]?.type !== 'table_open') {
        errors.push(id + ': source row must contain exactly three columns: case ID, condition, and expected result');
        continue;
      }
      const [, , given, expected] = row;
      if (!given.replace(/<br\s*\/?\s*>/gi, '').trim() || !expected.replace(/<br\s*\/?\s*>/gi, '').trim())
        errors.push(id + ': condition and expected result must be nonempty');
      if (sourcePath !== expectedPath) errors.push(id + ': case appears outside its declared source ' + expectedPath);
      if (!expectedIds.has(id)) errors.push('Unexpected case: ' + id);
      cases.push({
        id, ...(ruleId ? {ruleId, check} : {}), source: {path: sourcePath, line: index + 1}, given, expected,
        verification: {execution: 'not-executed-by-catalogue', requires: [ruleId ? 'working-agent-evidence' : 'native-or-agent-evidence']},
      });
    }
  }
  for (const id of expectedIds) {
    const found = cases.filter(c => c.id === id);
    if (!found.length) errors.push(id + ': missing case');
    if (found.length > 1) errors.push(id + ': duplicate case');
  }
  return {cases, errors};
}
