// Builds Bambu Studio project settings (Metadata/project_settings.config)
// from a one-filament printer profile, for any number of filaments.
//
// The profile file (e.g. assets/bambu/x2d-profile.json) holds:
//   config:       a Bambu Studio project config for one filament
//   per_filament: { key: block size } for every setting that repeats per
//                 filament (block > 1 when a filament has one value per
//                 nozzle variant)

const cache = new Map();
const round1 = (v) => Math.round(v * 10) / 10;

export function loadProfile(url) {
  if (!cache.has(url)) {
    cache.set(url, fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Could not load printer profile (${res.status})`);
      return res.json();
    }));
  }
  return cache.get(url);
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Rough purge volume (mm³) for a filament change, larger when going from a
// dark to a light colour. Bambu Studio can recalculate these exactly.
function flushVolume(from, to) {
  if (from === to) return 0;
  return Math.round(150 + 750 * Math.max(0, luminance(to) - luminance(from)));
}

// colors: one '#rrggbb' per filament, in filament order; tower: the prime
// tower's front-left corner on plate 1 (from layout()).
export function projectSettings(profile, colors, tower) {
  const n = colors.length;
  const config = structuredClone(profile.config);

  for (const [key, block] of Object.entries(profile.per_filament)) {
    const first = config[key].slice(0, block);
    config[key] = Array.from({ length: n }, () => first).flat();
  }
  config.filament_self_index = Array.from({ length: n }, (_, i) =>
    Array(profile.per_filament.filament_self_index).fill(String(i + 1))).flat();

  const upper = colors.map((c) => c.toUpperCase());
  config.filament_colour = upper;
  if ('filament_multi_colour' in config) config.filament_multi_colour = upper;

  // One flush matrix per nozzle, row = from filament, column = to filament.
  // With the profile's single filament each matrix is 1×1.
  const nozzles = profile.config.flush_volumes_matrix.length;
  const matrix = upper.flatMap((from) => upper.map((to) => String(flushVolume(from, to))));
  config.flush_volumes_matrix = Array.from({ length: nozzles }, () => matrix).flat();

  if (tower) {
    config.wipe_tower_x = [String(round1(tower[0])), ...config.wipe_tower_x.slice(1)];
    config.wipe_tower_y = [String(round1(tower[1])), ...config.wipe_tower_y.slice(1)];
  }

  // Process, one entry per filament, printer: nothing changed from the system presets.
  config.different_settings_to_system = Array(n + 2).fill('');

  return JSON.stringify(config, null, 4) + '\n';
}

// Bambu Studio version the profile was saved with, as 3MF "Application" metadata.
export function application(profile) {
  return `BambuStudio-${profile.config.version}`;
}

function bounds(area) {
  const points = area.split(',').map((p) => p.split('x').map(Number));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

const TOWER_DEPTH = 45; // room kept for the prime tower, which grows with the purge volume
const MARGIN = 3;

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

// Where to put a model with footprint [width, depth] on the plate, and the
// prime tower's front-left corner. The model goes in the area every nozzle
// can reach if it fits there (the X2D has a nozzle that can't reach the
// whole bed), otherwise in the middle of the bed. If it would cover the
// profile's prime tower, the model moves to the back and the tower goes in
// front of it.
export function layout(profile, [width, depth]) {
  const { config } = profile;
  const bed = bounds(config.printable_area.join(','));
  let area = bed;
  for (const nozzle of config.extruder_printable_area ?? []) {
    const b = bounds(nozzle);
    area = [Math.max(area[0], b[0]), Math.max(area[1], b[1]), Math.min(area[2], b[2]), Math.min(area[3], b[3])];
  }
  if (width > area[2] - area[0] || depth > area[3] - area[1]) area = bed;

  let center = [(area[0] + area[2]) / 2, (area[1] + area[3]) / 2];
  let tower = [Number(config.wipe_tower_x[0]), Number(config.wipe_tower_y[0])];
  const towerSize = Number(config.prime_tower_width) + 2 * MARGIN;
  const rect = (c) => [c[0] - width / 2 - MARGIN, c[1] - depth / 2 - MARGIN, c[0] + width / 2 + MARGIN, c[1] + depth / 2 + MARGIN];
  const towerRect = (t) => [t[0], t[1], t[0] + towerSize, t[1] + TOWER_DEPTH];

  if (overlaps(rect(center), towerRect(tower))) {
    center = [center[0], area[3] - depth / 2 - MARGIN];
    tower = [area[0] + MARGIN, bed[1] + MARGIN];
  }
  return { center, tower };
}
