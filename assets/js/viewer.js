// three.js STL viewer, plus a shared offscreen renderer for card thumbnails.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const loader = new STLLoader();
const geometryCache = new Map();

function cssColor(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Returns { geometry, size } with the model standing on y = 0.
// STL/OpenSCAD models are Z-up; three.js is Y-up, so rotate before placing.
function prepare(geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3()); // mm, in model axes
  geometry.rotateX(-Math.PI / 2);
  geometry.center();
  geometry.computeBoundingBox();
  geometry.translate(0, -geometry.boundingBox.min.y, 0);
  geometry.computeBoundingSphere();
  return { geometry, size };
}

function loadModel(url) {
  if (!geometryCache.has(url)) geometryCache.set(url, loader.loadAsync(url).then(prepare));
  return geometryCache.get(url);
}

// Flat-shaded geometry from a mesh (see mesh.js), with its colours if it has any.
function meshToGeometry({ positions: P, triangles: T, colors: C }) {
  const pos = new Float32Array(T.length * 3);
  const col = C ? new Float32Array(T.length * 3) : null;
  const c = new THREE.Color();
  for (let i = 0; i < T.length; i++) {
    pos.set(P.subarray(T[i] * 3, T[i] * 3 + 3), i * 3);
    if (col) {
      const t = Math.floor(i / 3) * 3;
      c.setRGB(C[t] / 255, C[t + 1] / 255, C[t + 2] / 255, THREE.SRGBColorSpace);
      col.set([c.r, c.g, c.b], i * 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  if (col) geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function makeMaterial() {
  return new THREE.MeshStandardMaterial({
    color: cssColor('--model-color') || '#e0582b',
    roughness: 0.55,
    metalness: 0.05,
  });
}

const colorMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });

function addLights(scene, camera) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(1, 2, 1.5);
  camera.add(key); // light follows the camera so the visible side is always lit
  scene.add(camera);
}

function frame(camera, geometry, controls) {
  const sphere = geometry.boundingSphere;
  const dist = (sphere.radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.15;
  const dir = new THREE.Vector3(1, 0.75, 1.2).normalize();
  camera.position.copy(sphere.center).addScaledVector(dir, dist);
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  if (controls) {
    controls.target.copy(sphere.center);
    controls.update();
  } else {
    camera.lookAt(sphere.center);
  }
}

export class Viewer {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.prepend(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 1000);
    addLights(this.scene, this.camera);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotateSpeed = 1.5;

    this.material = makeMaterial();
    this.mesh = null;
    this.grid = null;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.updateTheme());

    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  resize() {
    const { clientWidth: w, clientHeight: h } = this.container;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  updateTheme() {
    this.material.color.set(cssColor('--model-color'));
    if (this.grid) this.addGrid(this.mesh.geometry);
  }

  addGrid(geometry) {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    const box = geometry.boundingBox;
    const extent = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
    const cell = extent > 300 ? 50 : 10; // 10 mm squares, or 50 mm for big prints
    const size = Math.max(cell * 4, Math.ceil((extent * 1.6) / cell) * cell);
    const color = cssColor('--grid-color') || '#cccccc';
    this.grid = new THREE.GridHelper(size, size / cell, color, color);
    this.scene.add(this.grid);
  }

  // Shows an STL file and returns its dimensions in mm ({ x, y, z }).
  async show(url) {
    const { geometry, size } = await loadModel(url);
    this.setGeometry(geometry, false);
    return size;
  }

  // Shows a mesh rendered by OpenSCAD (see mesh.js); same return value as show().
  showMesh(mesh, { keepView = false } = {}) {
    const { geometry, size } = prepare(meshToGeometry(mesh));
    this.setGeometry(geometry, true, keepView);
    return size;
  }

  setGeometry(geometry, owned, keepView = false) {
    // Only keep the camera if the new model is roughly the same size.
    const ratio = this.mesh ? geometry.boundingSphere.radius / this.mesh.geometry.boundingSphere.radius : 0;
    keepView &&= ratio > 0.75 && ratio < 1.33;
    if (this.mesh) {
      this.scene.remove(this.mesh);
      if (this.ownsGeometry) this.mesh.geometry.dispose();
    }
    this.ownsGeometry = owned;
    this.mesh = new THREE.Mesh(geometry, geometry.attributes.color ? colorMaterial : this.material);
    this.scene.add(this.mesh);
    this.addGrid(geometry);
    if (!keepView) this.resetView();
  }

  snapshot({ grid = true } = {}) {
    if (this.grid) this.grid.visible = grid;
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    if (this.grid) this.grid.visible = true;
    return url;
  }

  resetView() {
    if (this.mesh) frame(this.camera, this.mesh.geometry, this.controls);
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
  }
}

// One offscreen renderer shared by all thumbnails; jobs run one at a time.
let thumbRenderer = null;
let thumbQueue = Promise.resolve();

export function renderThumbnail(url, width = 480, height = 360) {
  const job = thumbQueue.then(async () => {
    const { geometry } = await loadModel(url);
    if (!thumbRenderer) {
      thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    }
    thumbRenderer.setSize(width, height, false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
    addLights(scene, camera);
    const material = makeMaterial();
    scene.add(new THREE.Mesh(geometry, material));
    frame(camera, geometry);
    thumbRenderer.render(scene, camera);
    material.dispose();
    return thumbRenderer.domElement.toDataURL('image/png');
  });
  thumbQueue = job.catch(() => {});
  return job;
}
