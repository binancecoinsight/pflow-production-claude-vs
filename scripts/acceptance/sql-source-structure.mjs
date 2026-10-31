import { readFileSync } from 'node:fs';

export function inspectSqlSource(text, label = 'SQL source') {
  const errors = [];
  let i = 0;
  let state = 'normal';
  let dollarTag = '';
  let blockDepth = 0;
  while (i < text.length) {
    const two = text.slice(i, i + 2);
    if (state === 'line-comment') {
      if (text[i] === '\n') state = 'normal';
      i += 1; continue;
    }
    if (state === 'block-comment') {
      if (two === '/*') { blockDepth += 1; i += 2; continue; }
      if (two === '*/') { blockDepth -= 1; i += 2; if (blockDepth === 0) state = 'normal'; continue; }
      i += 1; continue;
    }
    if (state === 'single') {
      if (text[i] === "'" && text[i + 1] === "'") { i += 2; continue; }
      if (text[i] === "'") state = 'normal';
      i += 1; continue;
    }
    if (state === 'double') {
      if (text[i] === '"' && text[i + 1] === '"') { i += 2; continue; }
      if (text[i] === '"') state = 'normal';
      i += 1; continue;
    }
    if (state === 'dollar') {
      if (text.startsWith(dollarTag, i)) { i += dollarTag.length; state = 'normal'; dollarTag = ''; continue; }
      i += 1; continue;
    }
    if (two === '--') { state = 'line-comment'; i += 2; continue; }
    if (two === '/*') { state = 'block-comment'; blockDepth = 1; i += 2; continue; }
    if (text[i] === "'") { state = 'single'; i += 1; continue; }
    if (text[i] === '"') { state = 'double'; i += 1; continue; }
    if (text[i] === '$') {
      const match = /^(\$\$|\$[A-Za-z_][A-Za-z0-9_]*\$)/.exec(text.slice(i));
      if (match) { dollarTag = match[1]; state = 'dollar'; i += dollarTag.length; continue; }
    }
    i += 1;
  }
  if (state === 'single') errors.push(`${label}: unterminated single-quoted string`);
  if (state === 'double') errors.push(`${label}: unterminated quoted identifier`);
  if (state === 'block-comment') errors.push(`${label}: unterminated block comment`);
  if (state === 'dollar') errors.push(`${label}: unterminated dollar body ${dollarTag}`);

  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (/^\s*DO\s*$/.test(line)) errors.push(`${label}:${index + 1}: DO body is not dollar-quoted`);
    if (/\bAS\s+\$(?!\$|[A-Za-z_][A-Za-z0-9_]*\$)/.test(line)) errors.push(`${label}:${index + 1}: malformed dollar delimiter after AS`);
  });
  return errors;
}

export function normalizedSql(text) {
  return text.replace(/--[^\n]*/g, ' ').replace(/\s+/g, ' ').trim();
}

export function requireOrdered(source, fragments, label) {
  let cursor = 0;
  const normalized = normalizedSql(source);
  for (const fragment of fragments) {
    const target = normalizedSql(fragment);
    const found = normalized.indexOf(target, cursor);
    if (found < 0) throw new Error(`${label}: missing or reordered contract fragment: ${target.slice(0, 120)}`);
    cursor = found + target.length;
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname.replace(/^\/(.:)/, '$1').replaceAll('/', '\\') === process.argv[1]) {
  let failures = 0;
  for (const path of process.argv.slice(2)) {
    const errors = inspectSqlSource(readFileSync(path, 'utf8'), path);
    if (errors.length) { failures += 1; for (const error of errors) console.error(error); }
    else console.log(`${path}: structure clean`);
  }
  process.exitCode = failures ? 1 : 0;
}
