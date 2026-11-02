// Runs OpenSCAD (WebAssembly build) off the main thread.
// Each message is one command-line run on a fresh OpenSCAD instance:
//   { id, files: { path: text }, args: [...], output: '/out.off', fonts: ['LiberationSans-Regular.ttf', ...] }
// and gets back { id, code, result, log }.

const OPENSCAD_URL = 'https://cdn.jsdelivr.net/npm/openscad-wasm@0.0.4/openscad.js';
const FONTS_CONF = '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig></fontconfig>';

let modulePromise = null;
const fontCache = new Map();

function loadFont(name) {
  if (!fontCache.has(name)) {
    fontCache.set(name, fetch(new URL(`../fonts/${name}`, import.meta.url))
      .then((res) => (res.ok ? res.arrayBuffer() : null))
      .then((buf) => (buf ? new Uint8Array(buf) : null)));
  }
  return fontCache.get(name);
}

self.onmessage = async ({ data }) => {
  const { id, files, args, output, fonts = [] } = data;
  const log = [];
  try {
    modulePromise ??= import(OPENSCAD_URL);
    const [{ createOpenSCAD }, fontData] = await Promise.all([
      modulePromise,
      Promise.all(fonts.map(async (name) => [name, await loadFont(name)])),
    ]);
    const instance = (await createOpenSCAD({
      noInitialRun: true,
      print: (t) => log.push(t),
      printErr: (t) => log.push(t),
    })).getInstance();
    const { FS } = instance;

    FS.mkdir('/fonts');
    FS.writeFile('/fonts/fonts.conf', FONTS_CONF);
    for (const [name, bytes] of fontData) if (bytes) FS.writeFile(`/fonts/${name}`, bytes);
    for (const [path, text] of Object.entries(files)) FS.writeFile(path, text);

    let code;
    try {
      code = instance.callMain(args);
    } catch (err) {
      code = -1;
      log.push(`ERROR: ${err.message ?? err}`);
    }
    let result = null;
    try { result = FS.readFile(output, { encoding: 'utf8' }); } catch { /* no output */ }
    self.postMessage({ id, code, result, log });
  } catch (err) {
    log.push(`ERROR: ${err.message ?? err}`);
    self.postMessage({ id, code: -1, result: null, log });
  }
};
