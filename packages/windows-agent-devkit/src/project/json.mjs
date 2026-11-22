export function parseJsonObject(text) {
  const value = JSON.parse(text);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new SyntaxError();

  // JSON.parse accepts duplicate keys, including equivalent escaped spellings.
  const stack = [];
  const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}\[\]:,]/g) ?? [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '{') stack.push(new Set());
    else if (token === '[') stack.push(null);
    else if (token === '}' || token === ']') stack.pop();
    else if (token.startsWith('"') && tokens[index + 1] === ':') {
      const key = JSON.parse(token);
      const keys = stack.at(-1);
      if (!keys || keys.has(key)) throw new SyntaxError();
      keys.add(key);
    }
  }
  return value;
}

export function stripJsonComments(text) {
  let clean = '';
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index], pair = text.slice(index, index + 2);
    if (char === '"') {
      clean += char;
      let closed = false;
      for (index += 1; index < text.length; index += 1) {
        clean += text[index];
        if (text[index] === '\\') clean += text[++index] ?? '';
        else if (text[index] === '"') { closed = true; break; }
      }
      if (!closed) throw new SyntaxError();
    } else if (pair === '//') {
      while (index < text.length && text[index] !== '\n') index += 1;
      clean += '\n';
    } else if (pair === '/*') {
      const end = text.indexOf('*/', index + 2);
      if (end < 0) throw new SyntaxError();
      clean += ' ';
      index = end + 1;
    } else clean += char;
  }
  return clean;
}
