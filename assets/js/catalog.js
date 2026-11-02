import { loadManifest, modelUrl, esc, applySiteInfo } from './common.js';

const grid = document.getElementById('grid');
const search = document.getElementById('search');
const tagsEl = document.getElementById('tags');

let models = [];
let activeTag = new URLSearchParams(location.search).get('tag');

function cardHtml(m) {
  const count = m.files.length;
  const kind = m.scad ? 'Customizable' : `${count} STL file${count === 1 ? '' : 's'}`;
  const thumb = m.image
    ? `<img src="${esc(modelUrl(m, m.image))}" alt="" loading="lazy">`
    : `<img data-stl="${esc(m.files[0] ? modelUrl(m, m.files[0].file) : '')}" alt="">`;
  return `
    <a class="card" href="model.html?id=${encodeURIComponent(m.id)}">
      <div class="card-thumb">${thumb}</div>
      <div class="card-body">
        <h2 class="card-title">${esc(m.title)}</h2>
        <p class="card-meta">${kind}${m.tags.length ? ' · ' + m.tags.map(esc).join(', ') : ''}</p>
      </div>
    </a>`;
}

function renderTags() {
  const tags = [...new Set(models.flatMap((m) => m.tags))].sort();
  tagsEl.innerHTML = tags.length
    ? ['All', ...tags].map((t) => {
      const pressed = t === 'All' ? !activeTag : t === activeTag;
      return `<button class="tag" type="button" data-tag="${esc(t)}" aria-pressed="${pressed}">${esc(t)}</button>`;
    }).join('')
    : '';
}

function render() {
  const q = search.value.trim().toLowerCase();
  const shown = models.filter((m) => {
    if (activeTag && !m.tags.includes(activeTag)) return false;
    if (!q) return true;
    return [m.title, m.description, ...m.tags].join(' ').toLowerCase().includes(q);
  });
  grid.innerHTML = shown.length
    ? shown.map(cardHtml).join('')
    : `<p class="empty">${models.length ? 'No models match your search.' : 'No models yet.'}</p>`;
  renderThumbnails();
}

// Models without a preview image get one rendered from their first STL.
async function renderThumbnails() {
  const imgs = grid.querySelectorAll('img[data-stl]');
  if (!imgs.length) return;
  const { renderThumbnail } = await import('./viewer.js');
  for (const img of imgs) {
    if (!img.dataset.stl) continue;
    renderThumbnail(img.dataset.stl)
      .then((src) => { img.src = src; img.classList.add('rendered'); })
      .catch(() => {});
  }
}

tagsEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tag]');
  if (!btn) return;
  activeTag = btn.dataset.tag === 'All' ? null : btn.dataset.tag;
  const url = new URL(location.href);
  if (activeTag) url.searchParams.set('tag', activeTag); else url.searchParams.delete('tag');
  history.replaceState(null, '', url);
  renderTags();
  render();
});
search.addEventListener('input', render);

try {
  const data = await loadManifest();
  applySiteInfo(data.site);
  document.getElementById('site-description').textContent = data.site.description ?? '';
  models = data.models.sort((a, b) => String(b.added ?? '').localeCompare(String(a.added ?? '')));
  renderTags();
  render();
} catch (err) {
  grid.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
}
