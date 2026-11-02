// Shared helpers for loading the model catalog (models.json).

export async function loadManifest() {
  if (location.protocol === 'file:') {
    throw new Error('This page needs to be served over HTTP, not opened as a file. See "Previewing locally" in the README.');
  }
  const res = await fetch('models.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load models.json (${res.status})`);
  const data = await res.json();
  data.site ??= {};
  data.models = (data.models ?? []).map(normalizeModel);
  return data;
}

// Fill in defaults so the rest of the code can rely on every field existing.
function normalizeModel(m) {
  return {
    title: m.id,
    description: '',
    tags: [],
    print: {},
    ...m,
    files: (m.files ?? []).map((f) => (typeof f === 'string' ? { file: f } : f)),
  };
}

export function modelUrl(model, file) {
  return `models/${encodeURIComponent(model.id)}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.append(s);
  });
}

export async function loadJSZip() {
  if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  return window.JSZip;
}

export function saveBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

export function applySiteInfo(site) {
  document.querySelectorAll('[data-site-title]').forEach((el) => {
    el.textContent = site.title || '3D Models';
  });
}
