// Main-thread side of OpenSCAD: renders models in the worker and turns the
// output into meshes for the viewer and for STL/3MF downloads.
import { parseOff } from './mesh.js';

let worker = null;
let nextId = 0;
const pending = new Map();

function run(files, args, output, fonts) {
  if (!worker) {
    worker = new Worker(new URL('./openscad-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      pending.get(data.id)?.(data);
      pending.delete(data.id);
    };
  }
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    worker.postMessage({ id, files, args, output, fonts });
  });
}

const FAMILIES = { 'Liberation Sans': 'LiberationSans', 'Liberation Serif': 'LiberationSerif', 'Liberation Mono': 'LiberationMono' };
const STYLES = ['Regular', 'Bold', 'Italic', 'BoldItalic'];

// Only send the font families the model mentions (Liberation Sans is OpenSCAD's default).
function fontsFor(source) {
  const families = Object.entries(FAMILIES)
    .filter(([name]) => name === 'Liberation Sans' || source.includes(name))
    .map(([, file]) => file);
  return families.flatMap((f) => STYLES.map((s) => `${f}-${s}.ttf`));
}

function defineArgs(defines) {
  return defines.flatMap((d) => ['-D', d]);
}

export class RenderError extends Error {
  constructor(log) {
    const problems = log.filter((l) => /ERROR|WARNING|empty/i.test(l));
    super(problems.length ? problems.slice(0, 3).join('\n') : 'OpenSCAD could not render this model.');
    this.log = log;
  }
}

// Renders the model and returns a mesh with per-triangle colours.
export async function renderMesh(source, defines) {
  const { code, result, log } = await run(
    { '/model.scad': source },
    ['/model.scad', '--backend=manifold', ...defineArgs(defines), '-o', '/out.off'],
    '/out.off',
    fontsFor(source),
  );
  if (code !== 0 || !result) throw new RenderError(log);
  return parseOff(result);
}

// Splits the model into one solid per color() used, for multi-colour 3MF.
// It replaces OpenSCAD's color() with a module that only lets one colour
// through per render. Returns null if some geometry has no colour at all,
// since that geometry would end up in every part.
export async function renderColorParts(source, defines) {
  const fonts = fontsFor(source);
  const files = { '/model.scad': source };

  files['/colors.scad'] = 'include </model.scad>\nmodule color(c, alpha=1) { echo(__COLOR__=c); children(); }\n';
  const found = await run(files, ['/colors.scad', ...defineArgs(defines), '-o', '/out.echo'], '/out.echo', fonts);
  if (found.code !== 0 || !found.result) throw new RenderError(found.log);
  const colors = [...new Set(found.result.split('\n')
    .filter((l) => l.includes('__COLOR__ = '))
    .map((l) => l.slice(l.indexOf('__COLOR__ = ') + 12).trim()))];
  if (colors.length < 2) return null;

  files['/pass.scad'] = 'include </model.scad>\nmodule color(c, alpha=1) if (c == $__color) children();\n';
  const pass = (color) => run(
    files,
    ['/pass.scad', '--backend=manifold', ...defineArgs(defines), '-D', `$__color=${color}`, '-o', '/out.off'],
    '/out.off',
    fonts,
  );

  const uncolored = await pass('undef');
  if (uncolored.code === 0 && uncolored.result) return null;

  const parts = [];
  for (const color of colors) {
    const { code, result, log } = await pass(color);
    if (code !== 0 && !result) {
      if (log.some((l) => /empty/i.test(l))) continue; // colour used only on removed geometry
      throw new RenderError(log);
    }
    parts.push({ color: colorToHex(color), mesh: parseOff(result) });
  }
  return parts;
}

// Turns an OpenSCAD colour argument ("#FAC775", "red", [1, 0.5, 0]) into #rrggbb.
function colorToHex(literal) {
  if (literal.startsWith('[')) {
    const [r, g, b] = JSON.parse(literal);
    return '#' + [r, g, b].map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
  }
  const value = literal.replace(/^"|"$/g, '');
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillStyle = /^#[0-9a-f]{8}$/i.test(value) ? value.slice(0, 7) : value;
  return ctx.fillStyle.startsWith('#') ? ctx.fillStyle : '#808080';
}
