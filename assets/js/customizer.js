// Builds a form from a .scad file's Customizer parameters. Changed values
// are kept in the URL hash so a configuration can be shared as a link.
import { esc } from './common.js';
import { parseParams, toScadLiteral } from './scad-params.js';

function label(name) {
  return name.replace(/_/g, ' ');
}

function fromString(param, text) {
  if (param.type === 'number') return Number(text);
  if (param.type === 'boolean') return text === 'true';
  if (param.type === 'vector') return text.split(',').map((s) => Number(s.trim()));
  return text;
}

function isValid(param, value) {
  if (param.type === 'number') return Number.isFinite(value);
  if (param.type === 'vector') return value.length > 0 && value.every(Number.isFinite);
  return true;
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function fieldHtml(p) {
  const id = `param-${p.name}`;
  const attrs = `id="${id}" data-name="${esc(p.name)}"`;
  let input;
  if (p.options) {
    input = `<select ${attrs}>${p.options.map((o) =>
      `<option value="${esc(o.value)}"${same(o.value, p.value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
  } else if (p.type === 'boolean') {
    input = `<input type="checkbox" ${attrs}${p.value ? ' checked' : ''}>`;
  } else if (p.type === 'number') {
    const range = p.min !== undefined ? ` min="${p.min}" max="${p.max}"` : '';
    input = `<input type="number" ${attrs} value="${p.value}" step="${p.step ?? 'any'}"${range}>`;
  } else if (p.type === 'vector') {
    input = `<input type="text" ${attrs} value="${esc(p.value.join(', '))}">`;
  } else {
    input = `<input type="text" ${attrs} value="${esc(p.value)}">`;
  }
  const help = [p.description, p.hint].filter(Boolean).map(esc).join(' · ');
  const cls = p.type === 'boolean' ? 'param param-check' : 'param';
  return `
    <div class="${cls}">
      <label for="${id}">${esc(label(p.name))}</label>
      ${input}
      ${help ? `<small>${help}</small>` : ''}
    </div>`;
}

export class Customizer {
  constructor(container, source, onChange) {
    this.container = container;
    this.onChange = onChange;
    this.params = parseParams(source);
    this.readHash();
    this.render();

    let timer;
    container.addEventListener('input', (e) => {
      const p = this.params.find((x) => x.name === e.target.dataset.name);
      if (!p) return;
      const value = p.type === 'boolean' ? e.target.checked : fromString(p, e.target.value);
      if (!isValid(p, value)) return;
      p.value = value;
      this.writeHash();
      clearTimeout(timer);
      // Drop-downs and checkboxes render at once; typed values wait for a pause.
      timer = setTimeout(() => this.onChange(), e.target.tagName === 'SELECT' || p.type === 'boolean' ? 0 : 600);
    });
  }

  render() {
    const groups = [...new Set(this.params.map((p) => p.group))];
    this.container.innerHTML = groups.map((g, i) => `
      <details class="param-group"${i === 0 ? ' open' : ''}>
        <summary>${esc(g)}</summary>
        ${this.params.filter((p) => p.group === g).map(fieldHtml).join('')}
      </details>`).join('');
  }

  get(name) {
    return this.params.find((p) => p.name === name)?.value;
  }

  // -D overrides for every parameter that differs from the file's default.
  defines() {
    return this.params
      .filter((p) => !same(p.value, p.initial))
      .map((p) => `${p.name}=${toScadLiteral(p, p.value)}`);
  }

  reset() {
    for (const p of this.params) p.value = p.initial;
    this.writeHash();
    this.render();
    this.onChange();
  }

  readHash() {
    const values = new URLSearchParams(location.hash.slice(1));
    for (const p of this.params) {
      if (!values.has(p.name)) continue;
      const value = fromString(p, values.get(p.name));
      if (isValid(p, value)) p.value = value;
    }
  }

  writeHash() {
    const values = new URLSearchParams();
    for (const p of this.params) {
      if (!same(p.value, p.initial)) values.set(p.name, Array.isArray(p.value) ? p.value.join(',') : String(p.value));
    }
    const hash = values.toString();
    history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
  }
}
