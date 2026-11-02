// Reads OpenSCAD Customizer parameters from a .scad file, following the
// same conventions as OpenSCAD's own Customizer:
//   /* [Group name] */              starts a group ([Hidden] hides what follows)
//   // Description                  comment on the line before a parameter
//   size = 10;      // [5:50]       range (min:max or min:step:max)
//   shape = "a";    // [a, b, c:C]  drop-down (value or value:label)
// Only top-level assignments of plain values before the first module or
// function count as parameters.

// Splits a line into code and trailing // comment, ignoring // inside strings.
function splitComment(line) {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && inString) { i++; continue; }
    if (ch === '"') inString = !inString;
    if (!inString && ch === '/' && line[i + 1] === '/') return [line.slice(0, i), line.slice(i + 2).trim()];
  }
  return [line, ''];
}

function splitStatements(code) {
  const out = [];
  let inString = false;
  let start = 0;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '\\' && inString) { i++; continue; }
    if (ch === '"') inString = !inString;
    if (!inString && ch === ';') { out.push(code.slice(start, i)); start = i + 1; }
  }
  return out;
}

function parseValue(text) {
  const t = text.trim();
  if (t === 'true' || t === 'false') return { type: 'boolean', value: t === 'true' };
  if (/^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) return { type: 'number', value: Number(t) };
  if (/^"(?:[^"\\]|\\.)*"$/.test(t)) {
    try { return { type: 'string', value: JSON.parse(t) }; } catch { return null; }
  }
  if (/^\[[-\d.,\se]*\]$/i.test(t)) {
    try { return { type: 'vector', value: JSON.parse(t) }; } catch { return null; }
  }
  return null;
}

function parseWidget(comment, type) {
  const m = comment.match(/^\[(.*)\]$/);
  if (!m) return { hint: comment };
  const body = m[1].trim();
  const nums = body.split(':').map((s) => s.trim());
  if (type === 'number' && nums.every((s) => s !== '' && !Number.isNaN(Number(s)))) {
    const n = nums.map(Number);
    if (n.length === 1) return { min: 0, max: n[0] };
    if (n.length === 2) return { min: n[0], max: n[1] };
    if (n.length === 3) return { min: n[0], step: n[1], max: n[2] };
  }
  const options = body.split(',').map((s) => s.trim()).filter(Boolean).map((opt) => {
    const idx = opt.indexOf(':');
    const raw = idx === -1 ? opt : opt.slice(0, idx).trim();
    const label = idx === -1 ? opt : opt.slice(idx + 1).trim();
    const value = type === 'number' ? Number(raw) : raw.replace(/^"|"$/g, '');
    return { value, label };
  });
  return options.length ? { options } : {};
}

export function parseParams(source) {
  const params = [];
  let group = 'Parameters';
  let description = '';
  let inBlockComment = false;

  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (inBlockComment) {
      if (line.includes('*/')) inBlockComment = false;
      continue;
    }
    const section = line.match(/^\/\*\s*\[([^\]]*)\]\s*\*\/$/);
    if (section) { group = section[1].trim(); description = ''; continue; }
    if (line.startsWith('/*')) { inBlockComment = !line.includes('*/'); continue; }
    if (line.startsWith('//')) { description = line.replace(/^\/+\s*/, ''); continue; }
    if (!line) { description = ''; continue; }
    if (/^(module|function)\b/.test(line)) break;

    const [code, comment] = splitComment(line);
    const statements = splitStatements(code);
    statements.forEach((stmt, i) => {
      const m = stmt.match(/^\s*([A-Za-z_]\w*)\s*=([\s\S]*)$/);
      if (!m || /^hidden$/i.test(group)) return;
      const parsed = parseValue(m[2]);
      if (!parsed) return;
      const isLast = i === statements.length - 1;
      params.push({
        name: m[1],
        group,
        description: i === 0 ? description : '',
        ...parsed,
        initial: parsed.value,
        ...(isLast && comment ? parseWidget(comment, parsed.type) : {}),
      });
    });
    description = '';
  }
  return params;
}

// Formats a value as an OpenSCAD literal for a -D name=value override.
export function toScadLiteral(param, value) {
  if (param.type === 'string') return JSON.stringify(String(value));
  if (param.type === 'vector') return `[${value.join(', ')}]`;
  return String(value);
}
