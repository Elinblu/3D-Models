import { loadManifest, modelUrl, esc, formatBytes, applySiteInfo, loadJSZip, saveBlob } from './common.js';
import { Viewer } from './viewer.js';

const info = document.getElementById('info');
const status = document.getElementById('viewer-status');
const dims = document.getElementById('viewer-info');

function showSize(size) {
  dims.textContent = `${size.x.toFixed(1)} × ${size.y.toFixed(1)} × ${size.z.toFixed(1)} mm`;
}

function infoHtml(m, site) {
  const paragraphs = m.description.split(/\n\s*\n/).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  const tags = m.tags.map((t) => `<a class="tag" href="index.html?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('');
  const files = m.files.map((f, i) => `
    <li data-index="${i}">
      <span class="file-name">${esc(f.name || f.file)}<small data-size>${esc(f.file)}</small></span>
      ${/\.stl$/i.test(f.file) ? `<button class="icon-btn" type="button" data-view="${i}">View</button>` : ''}
      <a class="btn${m.scad ? ' secondary' : ''}" href="${esc(modelUrl(m, f.file))}" download>Download</a>
    </li>`).join('');
  const specs = Object.entries(m.print)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join('');
  const details = [
    m.license && ['License', m.license],
    m.author && ['Author', m.author],
    m.added && ['Added', m.added],
  ].filter(Boolean).map(([k, v]) => `<tr><th>${k}</th><td>${esc(v)}</td></tr>`).join('');

  const customize = m.scad ? `
    <div class="panel">
      <div class="panel-head">
        <h2>Customize</h2>
        <button id="reset-params" class="link-btn" type="button">Reset to defaults</button>
      </div>
      <div class="render-bar">
        <span id="render-status" class="render-status">Loading OpenSCAD…</span>
        <button id="get-stl" class="btn" type="button" disabled>Download STL</button>
        <button id="get-3mf" class="btn" type="button" disabled>Download 3MF</button>
        ${site.bambu ? `<button id="get-bambu" class="btn" type="button" disabled title="3MF project with the ${esc(site.bambu.label)} printer, print and filament profile">${esc(site.bambu.label)} project</button>` : ''}
      </div>
      <div id="params"></div>
    </div>` : '';

  return `
    <h1>${esc(m.title)}</h1>
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    <div class="description">${paragraphs}</div>
    ${customize}

    ${files ? `
    <div class="panel">
      <h2>${m.scad ? 'Source files' : 'Files'}</h2>
      <ul class="files">${files}</ul>
      ${m.files.length > 1 ? '<button id="zip" class="btn secondary block" type="button">Download all (.zip)</button>' : ''}
    </div>` : ''}

    ${specs ? `<div class="panel"><h2>Print settings</h2><table class="specs">${specs}</table></div>` : ''}
    ${details ? `<div class="panel"><h2>Details</h2><table class="specs">${details}</table></div>` : ''}`;
}

// Fill in each file's size from a HEAD request (not critical if it fails).
function showFileSizes(m) {
  info.querySelectorAll('.files li').forEach(async (li) => {
    const f = m.files[li.dataset.index];
    try {
      const res = await fetch(modelUrl(m, f.file), { method: 'HEAD' });
      const size = formatBytes(Number(res.headers.get('content-length')));
      if (size) li.querySelector('[data-size]').textContent = `${f.file} · ${size}`;
    } catch { /* leave as is */ }
  });
}

async function downloadZip(m, button) {
  button.disabled = true;
  button.textContent = 'Preparing zip…';
  try {
    const JSZip = await loadJSZip();
    const zip = new JSZip();
    await Promise.all(m.files.map(async (f) => {
      const res = await fetch(modelUrl(m, f.file));
      if (!res.ok) throw new Error(`Could not fetch ${f.file}`);
      zip.file(f.file, await res.blob());
    }));
    saveBlob(await zip.generateAsync({ type: 'blob' }), `${m.id}.zip`);
    button.textContent = 'Download all (.zip)';
  } catch (err) {
    button.textContent = 'Zip failed, try again';
    console.error(err);
  } finally {
    button.disabled = false;
  }
}

// Plain STL models: the viewer shows one listed file at a time.
function setUpStlViewer(m, viewer) {
  async function view(index) {
    const f = m.files[index];
    if (!f) { status.textContent = 'No STL files'; return; }
    info.querySelectorAll('.files li').forEach((li) => li.classList.toggle('active', Number(li.dataset.index) === index));
    status.textContent = 'Loading…';
    status.hidden = false;
    try {
      showSize(await viewer.show(modelUrl(m, f.file)));
      status.hidden = true;
    } catch (err) {
      status.textContent = `Could not load ${f.file}`;
      dims.textContent = '';
      console.error(err);
    }
  }
  info.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-view]');
    if (btn) view(Number(btn.dataset.view));
  });
  view(Math.max(0, m.files.findIndex((f) => /\.stl$/i.test(f.file))));
}

// OpenSCAD models: render in the browser from the customizer's parameters.
async function setUpCustomizer(m, viewer, site) {
  const [{ Customizer }, scad, { toStl, to3mf, footprint }, source] = await Promise.all([
    import('./customizer.js'),
    import('./scad.js'),
    import('./mesh.js'),
    fetch(modelUrl(m, m.scad)).then((res) => {
      if (!res.ok) throw new Error(`Could not load ${m.scad}`);
      return res.text();
    }),
  ]);

  const renderStatus = document.getElementById('render-status');
  const stlBtn = document.getElementById('get-stl');
  const mfBtn = document.getElementById('get-3mf');
  const bambuBtn = document.getElementById('get-bambu');
  let current = null; // { mesh, defines } of the last successful render
  let rendering = false;
  let dirty = false;

  const setStatus = (text, isError = false) => {
    renderStatus.textContent = text;
    renderStatus.classList.toggle('error', isError);
  };
  const busy = (on) => {
    for (const btn of [stlBtn, mfBtn, bambuBtn]) if (btn) btn.disabled = on || !current;
  };

  async function render() {
    if (rendering) { dirty = true; return; }
    rendering = true;
    dirty = false;
    current = null;
    busy(true);
    setStatus(viewer.mesh ? 'Rendering…' : 'Loading OpenSCAD and rendering…');
    const defines = customizer.defines();
    try {
      const mesh = await scad.renderMesh(source, defines);
      current = { mesh, defines };
      showSize(viewer.showMesh(mesh, { keepView: true }));
      status.hidden = true;
      setStatus('Ready');
    } catch (err) {
      setStatus(err.message, true);
      if (!viewer.mesh) status.textContent = 'Could not render the model';
      console.error(err.log ?? err);
    }
    rendering = false;
    busy(false);
    if (dirty) render();
  }

  const fileBase = () => [m.id, customizer.get('part')].filter((s) => s && s !== 'preview').join('-');

  // Plain 3MF, or with `bambu` a Bambu Studio project with the site's printer profile.
  async function download3mf(bambu) {
    const { mesh, defines } = current;
    busy(true);
    setStatus('Preparing 3MF…');
    try {
      const colorParts = await scad.renderColorParts(source, defines);
      const parts = colorParts
        ? colorParts.map((p, i) => ({ name: `Colour ${i + 1} (${p.color})`, color: p.color, mesh: p.mesh }))
        : [{ name: m.title, color: null, mesh }];
      let project = null;
      if (bambu) {
        const profileLib = await import('./bambu-profile.js');
        const profile = await profileLib.loadProfile(bambu.profile);
        const colors = parts.map((p) => p.color ?? profile.config.filament_colour[0]);
        const { center, tower } = profileLib.layout(profile, footprint(parts));
        project = {
          application: profileLib.application(profile),
          settings: profileLib.projectSettings(profile, colors, tower),
          bedCenter: center,
          thumbnail: await (await fetch(viewer.snapshot({ grid: false }))).blob(),
        };
      }
      const suffix = bambu ? `-${bambu.label.toLowerCase().replace(/\W+/g, '-')}` : '';
      saveBlob(await to3mf(parts, await loadJSZip(), m.title, project), `${fileBase()}${suffix}.3mf`);
      setStatus(colorParts ? `Ready · 3MF has ${parts.length} colour parts` : 'Ready');
    } catch (err) {
      setStatus(`3MF failed: ${err.message}`, true);
      console.error(err.log ?? err);
    }
    busy(false);
  }

  stlBtn.addEventListener('click', () => saveBlob(toStl(current.mesh), `${fileBase()}.stl`));
  mfBtn.addEventListener('click', () => download3mf(null));
  bambuBtn?.addEventListener('click', () => download3mf(site.bambu));

  const customizer = new Customizer(document.getElementById('params'), source, render);
  document.getElementById('reset-params').addEventListener('click', () => customizer.reset());
  status.textContent = 'Loading OpenSCAD…';
  render();
}

async function main() {
  const data = await loadManifest();
  applySiteInfo(data.site);
  const id = new URLSearchParams(location.search).get('id');
  const m = data.models.find((x) => x.id === id);
  if (!m) {
    document.getElementById('model').innerHTML = '<p class="empty">Model not found. <a href="index.html">Back to all models</a></p>';
    return;
  }
  if (m.scad && !m.files.some((f) => f.file === m.scad)) {
    m.files.unshift({ file: m.scad, name: 'OpenSCAD source' });
  }

  document.title = `${m.title} · ${data.site.title || '3D Models'}`;
  info.innerHTML = infoHtml(m, data.site);
  showFileSizes(m);
  info.addEventListener('click', (e) => {
    if (e.target.id === 'zip') downloadZip(m, e.target);
  });

  const viewer = new Viewer(document.getElementById('viewer'));
  const rotate = document.getElementById('rotate');
  rotate.addEventListener('click', () => {
    const on = rotate.getAttribute('aria-pressed') !== 'true';
    rotate.setAttribute('aria-pressed', on);
    viewer.setAutoRotate(on);
  });
  document.getElementById('reset').addEventListener('click', () => viewer.resetView());

  if (m.scad) await setUpCustomizer(m, viewer, data.site);
  else setUpStlViewer(m, viewer);
}

main().catch((err) => {
  status.textContent = err.message;
  console.error(err);
});
