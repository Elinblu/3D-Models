# 3D Models

A small static website for sharing 3D-printable models. Visitors can browse the catalog, preview each model in 3D, and download it. OpenSCAD models can be customized right on the page and downloaded as STL or 3MF. It runs on GitHub Pages with no build step.

## Adding a customizable OpenSCAD model

1. Create a folder under `models/` with a short, URL-friendly id, for example `models/reading-sign/`, and put the `.scad` file in it.
2. Add a preview image (`preview.png` or a photo). This is what the catalog card shows.
3. Add an entry to the `models` list in [`models.json`](models.json):

```json
{
  "id": "reading-sign",
  "title": "Reading Tracker Sign",
  "description": "What it is and how to use it.\n\nBlank lines start a new paragraph.",
  "tags": ["customizable", "books"],
  "added": "2026-11-02",
  "scad": "reading_sign.scad",
  "image": "preview.png",
  "print": { "Layer height": "0.2 mm" }
}
```

The model page reads the parameters straight from the `.scad` file, using the same comments as OpenSCAD's own Customizer:

```openscad
/* [Group name] */           // starts a group of parameters
// Shown as help text
size  = 20;                  // [5:50]        number with min:max (or min:step:max)
shape = "round";             // [round, square] drop-down
label = "Hi";                // text after // that isn't [...] becomes a hint
/* [Hidden] */               // nothing after this is shown
```

Only plain values (numbers, strings, true/false, number lists) assigned before the first `module` or `function` become parameters.

Visitors change values, and the model re-renders in the browser using [OpenSCAD's WebAssembly build](https://www.npmjs.com/package/openscad-wasm). They can then download:

- **STL**: the rendered model.
- **3MF** (made for Bambu Studio / OrcaSlicer): if the model uses `color()`, each colour becomes a separate part of one object, already assigned to filament 1, 2, 3… in the order the colours appear. Open it with **File → Import → Import 3MF/STL** (Ctrl+I) or drag it in and choose *Import geometry only*; Bambu Studio adds filament slots if needed. It will say the file "has invalid config": that only means it has no printer/print settings, so your own presets are kept. Then pick the right colour for each filament.

- **Bambu X2D project**: a ready-to-print Bambu Studio project for a Bambu Lab X2D (0.4 nozzle, *0.20mm Standard*, *Bambu PLA Basic*), with each colour on its own filament and the filament colours already set. Open it with File → Open Project. Big parts are placed so they don't overlap the prime tower.

Changed parameters are kept in the page address, so a configuration can be shared as a link.

### The printer-specific project download

The X2D button comes from `site.bambu` in `models.json`:

```json
"bambu": { "label": "Bambu X2D", "profile": "assets/bambu/x2d-profile.json" }
```

Remove it to hide the button. The profile file is built from two projects saved in Bambu Studio for the printer you want (one with several filaments, one with a single filament), using the presets you want as the defaults:

```
powershell -ExecutionPolicy Bypass -File tools\make-bambu-profile.ps1 -Multi "path\to\multi-colour.3mf" -Single "path\to\single-colour.3mf" -Out assets\bambu\x2d-profile.json
```

Rebuild it the same way for another printer, nozzle or process, or after a major Bambu Studio update.

Limitations:
- Fonts: the Liberation Sans, Serif and Mono fonts are included (`assets/fonts/`). Other fonts won't be found.
- The `.scad` file is rendered on its own. `import()`/`include`/`use` of other files won't work in the browser.
- The first render downloads OpenSCAD (about 14 MB), so it takes a few seconds. After that the browser caches it.

## Adding a plain STL model

Same as above, but list the STL files instead of `scad`:

```json
{
  "id": "phone-stand",
  "title": "Phone Stand",
  "description": "A simple stand for phones up to 10 mm thick.",
  "tags": ["desk", "phone"],
  "license": "CC BY 4.0",
  "author": "Your name",
  "added": "2026-11-02",
  "files": [
    { "file": "stand.stl", "name": "Stand" },
    "cable-clip.stl"
  ]
}
```

Files can be plain filenames or `{ "file", "name" }` objects. Without an `image`, the catalog draws a thumbnail from the first STL. A model can have both `scad` and `files`.

Only `id` (which must match the folder name) and either `scad` or `files` are required. `print` can hold any label/value pairs. Models are sorted newest first by `added`. The site title and intro text are under `site` in `models.json`.

Commit and push, and the site updates in about a minute.

## Turning on GitHub Pages

In the GitHub repository, go to **Settings → Pages**. Under **Build and deployment**, set **Source** to *Deploy from a branch*, pick `main` and `/ (root)`, and save. The site will be published at `https://<username>.github.io/3D-Models/`.

## Previewing locally

The pages load files with `fetch`, so opening `index.html` straight from disk won't work. Serve the folder over HTTP instead. On Windows, run the included script and open http://localhost:8000/:

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

`python -m http.server` or the VS Code *Live Server* extension work too.

## File size limits

GitHub rejects files over 100 MB and warns about files over 50 MB. For very large STLs, reduce the triangle count before exporting. GitHub Pages does not serve Git LFS files, so those won't download from the site.

## How it works

- `index.html` + `assets/js/catalog.js`: the catalog, with search and tag filters.
- `model.html` + `assets/js/model.js`: the model page with the 3D viewer, customizer, files and print settings.
- `assets/js/viewer.js`: the [three.js](https://threejs.org/) viewer, loaded from a CDN.
- `assets/js/customizer.js`, `scad-params.js`: reads the `.scad` parameters and builds the form.
- `assets/js/scad.js`, `openscad-worker.js`: runs OpenSCAD in a background worker.
- `assets/js/mesh.js`: turns OpenSCAD's output into the viewer mesh, STL and 3MF.
- `assets/js/bambu-profile.js`, `assets/bambu/`: the printer profile for the Bambu project download.
- `tools/make-bambu-profile.ps1`: builds that profile from Bambu Studio projects.
- `assets/fonts/`: Liberation fonts (SIL Open Font License, see `LICENSE-Liberation.txt`).
- `.nojekyll`: tells GitHub Pages to serve the files as-is, without running Jekyll.
