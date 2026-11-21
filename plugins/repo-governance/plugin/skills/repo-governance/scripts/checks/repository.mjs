export const knownPlaceholder = s => /\{\{[^{}\n]+\}\}|<(?:업무 대상|핵심 기능이나 결과|저장소 역할|한국어 변경 요약|확인한 [^<>\n]+|실행한 [^<>\n]+)>|\b(?:TODO|TBD)\b(?=\s*(?:[.!]|$))/iu.test(s);

export function name({text},policy,{violation,product}) {
  if (product?.repositoryNameException?.name === text) return;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(text) || /\s/.test(text)) {
    violation('name-format','Use lowercase letters and digits in kebab-case, with a category followed by at least one word.');
    return;
  }
  const category = text.slice(0, text.indexOf('-'));
  if (!policy.nameCategories.includes(category))
    violation('name-category','The first part must be one of: ' + policy.nameCategories.join(', ') + '.');
}
export function description({text},policy,{violation}) {
  if (!text.trim() || /[\r\n\u2028\u2029]/u.test(text))
    violation('description-line','Provide a nonempty single-line description.');
  if (knownPlaceholder(text)) violation('placeholder','Replace the description placeholder with actual information.');
}
