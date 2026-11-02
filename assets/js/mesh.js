// Plain triangle meshes: reading OpenSCAD's OFF output, writing STL and 3MF.
// A mesh is { positions: Float32Array (xyz per vertex), triangles: Uint32Array
// (3 vertex indices each), colors: Uint8Array (rgb per triangle) or null }.

export function parseOff(text) {
  const lines = text.split('\n').map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
  let i = 0;
  let header = lines[i++].split(/\s+/);
  if (header[0].endsWith('OFF')) header = header.slice(1);
  if (!header.length) header = lines[i++].split(/\s+/);
  const nv = Number(header[0]);
  const nf = Number(header[1]);

  const positions = new Float32Array(nv * 3);
  for (let v = 0; v < nv; v++) {
    const p = lines[i++].split(/\s+/);
    positions[v * 3] = +p[0];
    positions[v * 3 + 1] = +p[1];
    positions[v * 3 + 2] = +p[2];
  }

  const tris = [];
  const cols = [];
  let hasColor = false;
  for (let f = 0; f < nf; f++) {
    const p = lines[i++].split(/\s+/).map(Number);
    const n = p[0];
    let rgb = [255, 255, 255];
    if (p.length >= n + 4) {
      hasColor = true;
      rgb = p.slice(n + 1, n + 4);
      if (rgb.every((c) => c <= 1) && lines[i - 1].includes('.')) rgb = rgb.map((c) => c * 255);
    }
    for (let k = 2; k < n; k++) { // fan-triangulate polygons
      tris.push(p[1], p[k], p[k + 1]);
      cols.push(...rgb);
    }
  }
  return {
    positions,
    triangles: Uint32Array.from(tris),
    colors: hasColor ? Uint8Array.from(cols, Math.round) : null,
  };
}

export function toStl(mesh) {
  const { positions: P, triangles: T } = mesh;
  const count = T.length / 3;
  const buf = new ArrayBuffer(84 + count * 50);
  const view = new DataView(buf);
  view.setUint32(80, count, true);
  let o = 84;
  for (let t = 0; t < count; t++) {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const value of [nx, ny, nz, P[a], P[a + 1], P[a + 2], P[b], P[b + 1], P[b + 2], P[c], P[c + 1], P[c + 2]]) {
      view.setFloat32(o, value, true);
      o += 4;
    }
    o += 2; // attribute byte count
  }
  return new Blob([buf], { type: 'model/stl' });
}

// --- 3MF in Bambu Studio's project layout ---------------------------------
// Bambu Studio (and OrcaSlicer) read per-part filament assignments from
// Metadata/model_settings.config ("extruder" per part), with the parts in
// 3D/Objects/object_1.model and one object made of components in the main
// model. No print/printer settings are included, so the slicer keeps the
// user's own presets. Such a file must not claim to be made by Bambu Studio
// ("Application" metadata): Bambu Studio 2.8 then expects full project
// settings and crashes without them.
//
// With `project` ({ application, settings }) the file becomes a full Bambu
// project instead: it claims the given Bambu Studio version and carries the
// printer/print/filament profile in Metadata/project_settings.config (see
// bambu-profile.js).

const CORE_NS = 'http://schemas.microsoft.com/3dmanufacturing/core/2015/02';
const PROD_NS = 'http://schemas.microsoft.com/3dmanufacturing/production/2015/06';
const BAMBU_NS = 'http://schemas.bambulab.com/package/2021';
const MODEL_REL = 'http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel';
const BED_CENTER = [128, 128]; // centre of a 256 mm Bambu bed; the slicer can re-arrange

const hex8 = (n) => n.toString(16).padStart(8, '0');
const round = (v) => Math.round(v * 1e5) / 1e5;
const xmlEscape = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
})[c]);

function meshXml(mesh, [dx, dy, dz]) {
  const { positions: P, triangles: T } = mesh;
  const out = ['<mesh><vertices>'];
  for (let v = 0; v < P.length; v += 3) {
    out.push(`<vertex x="${round(P[v] + dx)}" y="${round(P[v + 1] + dy)}" z="${round(P[v + 2] + dz)}"/>`);
  }
  out.push('</vertices><triangles>');
  for (let t = 0; t < T.length; t += 3) out.push(`<triangle v1="${T[t]}" v2="${T[t + 1]}" v3="${T[t + 2]}"/>`);
  out.push('</triangles></mesh>');
  return out.join('');
}

// Offset that centres the parts' combined footprint on x/y = 0 and puts it on
// z = 0, and the footprint's size.
function centering(parts) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const { mesh: { positions: P } } of parts) {
    for (let i = 0; i < P.length; i++) {
      const a = i % 3;
      if (P[i] < min[a]) min[a] = P[i];
      if (P[i] > max[a]) max[a] = P[i];
    }
  }
  return {
    offset: [-(min[0] + max[0]) / 2, -(min[1] + max[1]) / 2, -min[2]],
    size: [max[0] - min[0], max[1] - min[1]],
  };
}

// Width and depth (mm) of the parts together.
export function footprint(parts) {
  return centering(parts).size;
}

// parts: [{ name, color: '#rrggbb' | null, mesh }], one per filament, in
// filament order. Returns a Blob.
export async function to3mf(parts, JSZip, objectName = 'Model', project = null) {
  const { offset } = centering(parts);
  const objectId = parts.length + 1; // parts are objects 1..n in object_1.model
  const center = project?.bedCenter ?? BED_CENTER;
  const placement = `1 0 0 0 1 0 0 0 1 ${center[0]} ${center[1]} 0`;
  const header = (extra) => '<?xml version="1.0" encoding="UTF-8"?>\n'
    + `<model unit="millimeter" xml:lang="en-US" xmlns="${CORE_NS}" xmlns:BambuStudio="${BAMBU_NS}" xmlns:p="${PROD_NS}" requiredextensions="p">\n${extra}`;

  // Display colours for other software; Bambu Studio uses model_settings.config instead.
  const colored = parts.filter((p) => p.color);
  const materialsId = objectId + 1;
  const materials = colored.length
    ? `  <basematerials id="${materialsId}">${colored.map((p) => `<base name="${xmlEscape(p.name)}" displaycolor="${p.color.toUpperCase()}"/>`).join('')}</basematerials>\n`
    : '';
  const partsModel = header(' <metadata name="BambuStudio:3mfVersion">1</metadata>\n')
    + ` <resources>\n${materials}`
    + parts.map((p, i) => {
      const material = p.color ? ` pid="${materialsId}" pindex="${colored.indexOf(p)}"` : '';
      return `  <object id="${i + 1}" p:UUID="${hex8(0x10000 + i)}-81cb-4c03-9d28-80fed5dfa1dc" type="model"${material}>${meshXml(p.mesh, offset)}</object>\n`;
    }).join('')
    + ' </resources>\n <build/>\n</model>\n';

  const mainModel = header([
    ...(project ? [` <metadata name="Application">${xmlEscape(project.application)}</metadata>`] : []),
    ' <metadata name="BambuStudio:3mfVersion">1</metadata>',
    ` <metadata name="Title">${xmlEscape(objectName)}</metadata>`,
    '',
  ].join('\n'))
    + ` <resources>\n  <object id="${objectId}" p:UUID="${hex8(1)}-61cb-4c03-9d28-80fed5dfa1dc" type="model">\n   <components>\n`
    + parts.map((_, i) => `    <component p:path="/3D/Objects/object_1.model" objectid="${i + 1}" p:UUID="${hex8(0x10000 + i)}-b206-40ff-9872-83e8017abed1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n`).join('')
    + '   </components>\n  </object>\n </resources>\n'
    + ` <build p:UUID="2c7c17d8-22b5-4d84-8835-1976022ea369">\n  <item objectid="${objectId}" p:UUID="${hex8(2)}-b1ec-4553-aec9-835e5b724bb4" transform="${placement}" printable="1"/>\n </build>\n</model>\n`;

  const identity = '1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1';
  const partXml = (p, i) => [
    `    <part id="${i + 1}" subtype="normal_part">`,
    `      <metadata key="name" value="${xmlEscape(p.name)}"/>`,
    `      <metadata key="matrix" value="${identity}"/>`,
    `      <metadata key="extruder" value="${i + 1}"/>`,
    `      <mesh_stat face_count="${p.mesh.triangles.length / 3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>`,
    '    </part>',
  ].join('\n');
  const settings = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<config>',
    `  <object id="${objectId}">`,
    `    <metadata key="name" value="${xmlEscape(objectName)}"/>`,
    '    <metadata key="extruder" value="1"/>',
    ...parts.map(partXml),
    '  </object>',
    '  <plate>',
    '    <metadata key="plater_id" value="1"/>',
    '    <metadata key="plater_name" value=""/>',
    '    <metadata key="locked" value="false"/>',
    ...(project?.thumbnail ? ['    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>'] : []),
    '    <model_instance>',
    `      <metadata key="object_id" value="${objectId}"/>`,
    '      <metadata key="instance_id" value="0"/>',
    '      <metadata key="identify_id" value="1"/>',
    '    </model_instance>',
    '  </plate>',
    '  <assemble>',
    `   <assemble_item object_id="${objectId}" instance_id="0" transform="${placement}" offset="0 0 0"/>`,
    '  </assemble>',
    '</config>',
    '',
  ].join('\n');

  const rels = (target) => '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n'
    + ` <Relationship Target="${target}" Id="rel-1" Type="${MODEL_REL}"/>\n</Relationships>\n`;

  const zip = new JSZip();
  const opts = { createFolders: false };
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
    + ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
    + ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n'
    + ' <Default Extension="config" ContentType="application/xml"/>\n'
    + ' <Default Extension="png" ContentType="image/png"/>\n</Types>\n', opts);
  zip.file('_rels/.rels', rels('/3D/3dmodel.model'), opts);
  zip.file('3D/3dmodel.model', mainModel, opts);
  zip.file('3D/_rels/3dmodel.model.rels', rels('/3D/Objects/object_1.model'), opts);
  zip.file('3D/Objects/object_1.model', partsModel, opts);
  zip.file('Metadata/model_settings.config', settings, opts);
  if (project) {
    zip.file('Metadata/project_settings.config', project.settings, opts);
    if (project.thumbnail) zip.file('Metadata/plate_1.png', project.thumbnail, opts);
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'model/3mf' });
}
