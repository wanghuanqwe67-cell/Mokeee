import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/* ============================================================
   CONFIG
   ============================================================ */
const CONFIG = {
  grid: {
    cols: 4,
    rows: 5,
    tileWidth: 1.5,
    tileHeight: 0.9,
    gapX: 0,
    gapY: 0,
  },
  distortion: {
    flat: 0.0,
    curved: -0.04,
    baseScale: 0.55,
    vignetteOffset: 0.28,
    vignetteDarkness: 0.24,
  },
  camera: {
    fov: 32,
    z: 8.9,
    zoomDelta: 1,
  },
  ambient: {
    strength: 0.12,
  },
  drag: {
    lerpFactor: 0.31,
    friction: 0.855,
  },
};

/* ============================================================
   EXTERNAL CONFIG UPDATE (from config-tuner.html via postMessage)
   ============================================================ */
window.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'CONFIG_UPDATE') {
    const c = e.data.config;
    if (c.grid) Object.assign(CONFIG.grid, c.grid);
    if (c.distortion) Object.assign(CONFIG.distortion, c.distortion);
    if (c.camera) Object.assign(CONFIG.camera, c.camera);
    if (c.ambient) Object.assign(CONFIG.ambient, c.ambient);
    if (c.drag) Object.assign(CONFIG.drag, c.drag);
  }
});

/* ============================================================
   PROJECT DATA
   ============================================================ */
const PROJECTS = [
  { slug: 'xiaohongshu', name: 'Xiaohongshu', category: 'PRODUCT DESIGN',              year: '2025', color: '#2d0a14', cover: 'assets/covers/shop-bag.avif' },
  { slug: 'mokee',       name: 'Mokee',       category: 'BRANDING, WEB',               year: '2025', color: '#1a1a2e', cover: 'assets/covers/voicelive-2.avif' },
  { slug: 'newtap',      name: 'NewTap',      category: 'PRODUCT DESIGN, INTERACTION', year: '2024', color: '#0c0c1d', cover: 'assets/covers/newtap.avif' },
  { slug: 'douyin',      name: 'Douyin',      category: 'PRODUCT DESIGN',              year: '2024', color: '#0d0d2a', cover: 'assets/covers/dou-yin.avif' },
  { slug: 'sia-tv',      name: 'Sia TV',      category: 'PRODUCT DESIGN, INTERACTION', year: '2024', color: '#1b2838', cover: 'assets/covers/sia-tv.avif' },
  { slug: 'oppo',        name: 'OPPO',        category: 'WEB DESIGN & DEVELOPMENT',    year: '2023', color: '#1c0a00', cover: 'assets/covers/oppo-web.webp' },
];

/* ============================================================
   DISTORTION SHADER (from PDF)
   Lens distortion + vignette
   ============================================================ */
const DistortionShaderDef = {
  name: 'DistortionShader',
  uniforms: {
    tDiffuse: { value: null },
    distortion: { value: new THREE.Vector2(0, 0) },
    baseScale: { value: 1.13 },
    vignetteOffset: { value: 0.28 },
    vignetteDarkness: { value: 0.24 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 distortion;
    uniform float baseScale;
    uniform float vignetteOffset;
    uniform float vignetteDarkness;
    varying vec2 vUv;

    vec2 getShiftedUv(vec2 uv) {
      return 2.0 * (uv - 0.5);
    }

    vec2 getUnshiftedUv(vec2 shiftedUv) {
      return shiftedUv * 0.5 + 0.5;
    }

    void main() {
      vec2 shiftedUv = getShiftedUv(vUv);
      float distanceToCenter = length(shiftedUv);

      // Lens distortion effect
      shiftedUv *= (baseScale + distortion * dot(shiftedUv, shiftedUv));
      vec2 transformedUv = getUnshiftedUv(shiftedUv);

      // Vignette effect
      float vignetteIntensity = smoothstep(
        0.8,
        vignetteOffset * 0.799,
        (vignetteDarkness + vignetteOffset) * distanceToCenter
      );

      // Sample and output
      vec3 color = texture2D(tDiffuse, transformedUv).rgb * vignetteIntensity;
      gl_FragColor = vec4(color, 1.0);
    }
  `,
};

/* ============================================================
   CREATE TILE TEXTURE (Canvas 2D -> Texture)
   ============================================================ */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function createTileBgTexture(project, width, height) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  // Pure black tile background
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, width, height);

  // Tile border
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 0.7;
  ctx.strokeRect(0.35, 0.35, width - 0.7, height - 0.7);

  // Info text positions (matching image placement)
  const imgH = height * 0.60;
  const imgY = (height - imgH) / 2;
  const pad = width * 0.05;

  // Top info row
  const topY = 24;
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `300 12px "Inter", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText('++', pad, topY);
  ctx.fillText(project.year.slice(-2), pad + 30, topY);
  ctx.textAlign = 'right';
  ctx.fillText('++', width - pad, topY);

  // Bottom info row
  const bottomY = height - 24;
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = `300 12px "Inter", sans-serif`;
  ctx.textAlign = 'left';
  ctx.fillText(project.name, pad, bottomY);
  ctx.textAlign = 'right';
  ctx.fillText(project.category.split(',')[0], width - pad, bottomY);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if ('SRGBColorSpace' in THREE) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Shared cache so multiple tiles of the same project reuse one <img>.
const COVER_IMG_CACHE = new Map();
function loadCover(src) {
  if (!src) return null;
  if (COVER_IMG_CACHE.has(src)) return COVER_IMG_CACHE.get(src);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  COVER_IMG_CACHE.set(src, img);
  return img;
}

function createTileImgTexture(project, width, height) {
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const radius = 2;

  function drawFallback() {
    roundRect(ctx, 0, 0, width, height, radius);
    ctx.fillStyle = project.color;
    ctx.fill();
    ctx.fillStyle = 'rgba(240, 240, 240, 0.08)';
    ctx.font = `bold ${Math.floor(width * 0.15)}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(project.name.toUpperCase(), width / 2, height / 2);
  }

  function drawCover(img) {
    ctx.save();
    roundRect(ctx, 0, 0, width, height, radius);
    ctx.clip();
    // cover-fit
    const ir = img.width / img.height;
    const tr = width / height;
    let dw, dh, dx, dy;
    if (ir > tr) { dh = height; dw = dh * ir; dx = (width - dw) / 2; dy = 0; }
    else         { dw = width;  dh = dw / ir; dx = 0; dy = (height - dh) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  if ('SRGBColorSpace' in THREE) texture.colorSpace = THREE.SRGBColorSpace;

  const img = loadCover(project.cover);
  if (img && img.complete && img.naturalWidth > 0) {
    drawCover(img);
  } else {
    drawFallback();
    if (img) {
      const onLoad = () => { drawCover(img); texture.needsUpdate = true; };
      if (img.complete && img.naturalWidth > 0) onLoad();
      else img.addEventListener('load', onLoad, { once: true });
    }
  }
  return texture;
}

/* ============================================================
   GRID CLASS — Infinite scrolling tile grid
   ============================================================ */
class InfiniteGrid {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.scene.add(this.group);

    const { cols, rows, tileWidth, tileHeight, gapX, gapY } = CONFIG.grid;
    this.baseCols = cols;
    this.baseRows = rows;
    this.cellW = tileWidth + gapX;
    this.cellH = tileHeight + gapY;

    // Render enough tiles to always cover the viewport with buffer.
    // Use large enough grid so the wrap boundary is never visible.
    this.renderCols = cols + 6;
    this.renderRows = rows + 6;

    // The wrapping period = render grid size (NOT logical grid).
    // This ensures the wrap always happens far outside the viewport.
    this.wrapW = this.renderCols * this.cellW;
    this.wrapH = this.renderRows * this.cellH;

    this.offset = new THREE.Vector2(0, 0);
    this.tiles = [];
    const bgGeometry = new THREE.PlaneGeometry(tileWidth, tileHeight);
    const imgRatioW = 0.50;
    const imgRatioH = 0.60;
    const imgGeometry = new THREE.PlaneGeometry(tileWidth * imgRatioW, tileHeight * imgRatioH);
    const hitGeometry = new THREE.PlaneGeometry(tileWidth * imgRatioW * 1.1, tileHeight * imgRatioH * 1.1);

    for (let r = 0; r < this.renderRows; r++) {
      for (let c = 0; c < this.renderCols; c++) {
        const logicalC = ((c % cols) + cols) % cols;
        const logicalR = ((r % rows) + rows) % rows;
        const projIdx = (logicalR * cols + logicalC) % PROJECTS.length;
        const proj = PROJECTS[projIdx];

        // Background mesh (border + labels)
        const bgTex = createTileBgTexture(proj, 480, 300);
        const bgMat = new THREE.MeshBasicMaterial({ map: bgTex });
        const bgMesh = new THREE.Mesh(bgGeometry, bgMat);
        const slug = (proj.slug || proj.name || '').toString().toLowerCase().replace(/\s+/g, '-');
        bgMesh.userData = { col: c, row: r, project: proj, slug };

        // Image child mesh
        const imgTex = createTileImgTexture(proj, 240, 180);
        const imgMat = new THREE.MeshBasicMaterial({ map: imgTex });
        const imgMesh = new THREE.Mesh(imgGeometry, imgMat);
        imgMesh.position.z = 0.01;
        bgMesh.userData.imageMesh = imgMesh;
        bgMesh.add(imgMesh);

        // Invisible hover hitbox (1.1x image size)
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hitMesh = new THREE.Mesh(hitGeometry, hitMat);
        hitMesh.position.z = 0.005;
        hitMesh.userData.parentTile = bgMesh;
        bgMesh.userData.hitMesh = hitMesh;
        bgMesh.add(hitMesh);

        this.group.add(bgMesh);
        this.tiles.push(bgMesh);
      }
    }

    this.updatePositions();
  }

  updatePositions() {
    const halfWrapW = this.wrapW / 2;
    const halfWrapH = this.wrapH / 2;

    for (const tile of this.tiles) {
      const { col, row } = tile.userData;

      let x = (col - this.renderCols / 2 + 0.5) * this.cellW + this.offset.x;
      let y = -(row - this.renderRows / 2 + 0.5) * this.cellH + this.offset.y;

      // Wrap using render grid period — wrap boundary is always off-screen
      x = ((x % this.wrapW) + this.wrapW) % this.wrapW;
      y = ((y % this.wrapH) + this.wrapH) % this.wrapH;
      if (x > halfWrapW) x -= this.wrapW;
      if (y > halfWrapH) y -= this.wrapH;

      tile.position.set(x, y, 0);
    }
  }

  setOffset(x, y) {
    this.offset.set(x, y);
    this.updatePositions();
  }
}

/* ============================================================
   NAVIGATION — Drag + inertia + ambient cursor
   ============================================================ */
class Navigation {
  constructor(canvas) {
    this.canvas = canvas;
    this.isDragging = false;
    this.pointerUv = new THREE.Vector2(0.5, 0.5);
    this.dragStart = new THREE.Vector2();
    this.positionOffset = new THREE.Vector2();
    this.velocity = new THREE.Vector2();
    this.dragAction = new THREE.Vector2();

    // Mouse / Touch events
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerUp);
  }

  onPointerDown = (e) => {
    this.isDragging = true;
    this.dragStart.set(e.clientX, e.clientY);
    this.canvas.setPointerCapture(e.pointerId);
  };

  onPointerMove = (e) => {
    // Update pointer UV (0-1 range)
    this.pointerUv.set(
      e.clientX / window.innerWidth,
      e.clientY / window.innerHeight
    );

    if (this.isDragging) {
      const dx = (e.clientX - this.dragStart.x) * 0.005;
      const dy = -(e.clientY - this.dragStart.y) * 0.005;
      this.dragAction.set(dx, dy);
      this.dragStart.set(e.clientX, e.clientY);
    }
  };

  onPointerUp = () => {
    this.isDragging = false;
  };

  getAmbientCursorOffset() {
    const offset = this.pointerUv.clone().subScalar(0.5).multiplyScalar(CONFIG.ambient.strength);
    return offset;
  }

  update() {
    if (this.isDragging && (this.dragAction.x !== 0 || this.dragAction.y !== 0)) {
      // Gradually increase velocity
      this.velocity.lerp(this.dragAction, CONFIG.drag.lerpFactor);
      this.positionOffset.add(this.dragAction.clone());
      this.dragAction.set(0, 0);
    } else {
      // Apply inertia
      this.positionOffset.add(this.velocity);
      // Friction
      this.velocity.multiplyScalar(CONFIG.drag.friction);
      // Stop when very slow
      if (this.velocity.length() < 0.0001) {
        this.velocity.set(0, 0);
      }
    }

    return this.positionOffset;
  }
}

/* ============================================================
   DISTORTION MANAGER
   ============================================================ */
class DistortionManager {
  constructor() {
    this.intensity = CONFIG.distortion.curved;
    this.targetIntensity = CONFIG.distortion.curved;
    this.baseScale = CONFIG.distortion.baseScale;
    this.targetBaseScale = CONFIG.distortion.baseScale;
    this.introActive = false;
  }

  setDistortion(value) {
    this.targetIntensity = value;
  }

  setBaseScale(value) {
    this.targetBaseScale = value;
  }

  startIntro(startCurved, startBaseScale) {
    this.intensity = startCurved;
    this.targetIntensity = startCurved;
    this.baseScale = startBaseScale;
    this.targetBaseScale = startBaseScale;
    this.introActive = true;
  }

  endIntro() {
    this.targetIntensity = CONFIG.distortion.curved;
    this.targetBaseScale = CONFIG.distortion.baseScale;
    this.introActive = false;
  }

  update(uniforms) {
    // When not in intro, sync from CONFIG for external tuner
    if (!this.introActive) {
      this.targetIntensity = CONFIG.distortion.curved;
      this.targetBaseScale = CONFIG.distortion.baseScale;
    }
    // Smooth lerp
    this.intensity += (this.targetIntensity - this.intensity) * 0.035;
    this.baseScale += (this.targetBaseScale - this.baseScale) * 0.035;
    const ratio = window.innerWidth / window.innerHeight;
    uniforms.distortion.value.set(
      this.intensity * ratio,
      this.intensity
    );
    uniforms.baseScale.value = this.baseScale;
    uniforms.vignetteOffset.value = CONFIG.distortion.vignetteOffset;
    uniforms.vignetteDarkness.value = CONFIG.distortion.vignetteDarkness;
  }
}

/* ============================================================
   MAIN APP
   ============================================================ */
class App {
  constructor() {
    this.canvas = document.getElementById('canvas');
    this.clock = new THREE.Clock();

    this.initRenderer();
    this.initScene();
    this.initPostProcessing();
    this.initGrid();
    this.initNavigation();
    this.initClock();
    this.bindEvents();

    // Sphere-to-grid intro: start small + strong fisheye, expand to normal
    this.distortionManager.startIntro(-0.7, 0.15);
    // Camera starts far away (small view), zooms in
    this.camera.position.z = CONFIG.camera.z + 12;
    this.targetCameraZ = CONFIG.camera.z + 12;
    // Grid starts scaled down
    this.grid.group.scale.set(0.3, 0.3, 1);
    this.introScaleActive = true;

    // Hide loader
    requestAnimationFrame(() => {
      document.getElementById('loader').classList.add('hidden');
      // Trigger entrance animation
      requestAnimationFrame(() => {
        document.body.classList.remove('intro');
        setTimeout(() => {
          this.distortionManager.endIntro();
          this.targetCameraZ = CONFIG.camera.z;
        }, 200);
      });
    });

    this.animate();
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000);
  }

  initScene() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.camera.fov,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.z = CONFIG.camera.z;
  }

  initPostProcessing() {
    this.distortionManager = new DistortionManager();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.distortionPass = new ShaderPass(DistortionShaderDef);
    this.composer.addPass(this.distortionPass);
  }

  initGrid() {
    this.grid = new InfiniteGrid(this.scene);
    this.raycaster = new THREE.Raycaster();
    this.pointerNdc = new THREE.Vector2(9999, 9999);
    this.hoveredTile = null;

    this.canvas.addEventListener('mousemove', (e) => {
      // Check if pointer is over the bottom nav area — if so, disable hover
      const bottomNav = document.querySelector('.bottom-nav');
      if (bottomNav) {
        const rect = bottomNav.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          this.pointerNdc.set(9999, 9999);
          return;
        }
      }
      // Check if pointer is over the top bar area — if so, disable hover
      const topBar = document.querySelector('.top-bar');
      if (topBar) {
        const rect = topBar.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
          this.pointerNdc.set(9999, 9999);
          return;
        }
      }
      this.pointerNdc.x = (e.clientX / window.innerWidth) * 2 - 1;
      this.pointerNdc.y = -(e.clientY / window.innerHeight) * 2 + 1;
    });

    // When mouse enters bottom nav, immediately cancel any hover
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
      bottomNav.addEventListener('mouseenter', () => {
        this.pointerNdc.set(9999, 9999);
      });
    }
    const topBar = document.querySelector('.top-bar');
    if (topBar) {
      topBar.addEventListener('mouseenter', () => {
        this.pointerNdc.set(9999, 9999);
      });
    }
  }

  initNavigation() {
    this.navigation = new Navigation(this.canvas);

    // Camera zoom on drag
    this.targetCameraZ = CONFIG.camera.z;

    this.canvas.addEventListener('pointerdown', (e) => {
      this._pressStart = { x: e.clientX, y: e.clientY };
      this._pressMoved = false;
    });
    this.canvas.addEventListener('pointermove', (e) => {
      // Only trigger zoom when actually dragging (movement detected)
      if (this._pressStart) {
        const dx = e.clientX - this._pressStart.x;
        const dy = e.clientY - this._pressStart.y;
        if (dx * dx + dy * dy > 16) {
          this._pressMoved = true;
          this.targetCameraZ = CONFIG.camera.z + CONFIG.camera.zoomDelta;
        }
      }
    });
    this.canvas.addEventListener('pointerup', (e) => {
      // Tap (no drag) on a hovered tile => open detail page
      if (this._pressStart && !this._pressMoved && this.hoveredTile) {
        const slug = this.hoveredTile.userData.slug;
        if (slug) {
          document.body.classList.add('outro');
          setTimeout(() => {
            window.location.href = `project.html?id=${encodeURIComponent(slug)}`;
          }, 1000);
        }
      }
      this._pressStart = null;
      this._pressMoved = false;
      this.targetCameraZ = CONFIG.camera.z;
    });
    this.canvas.addEventListener('pointerleave', () => {
      this._pressStart = null;
      this._pressMoved = false;
      this.targetCameraZ = CONFIG.camera.z;
    });
  }

  initClock() {
    const update = () => {
      const now = new Date();
      const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
      const dateEl = document.getElementById('dateDisplay');
      const timeEl = document.getElementById('timeDisplay');
      if (dateEl) {
        dateEl.textContent = now.getUTCDate() + ' ' + months[now.getUTCMonth()] + ' ' + String(now.getUTCFullYear()).slice(-2);
      }
      if (timeEl) {
        timeEl.textContent =
          String(now.getUTCHours()).padStart(2, '0') + ':' +
          String(now.getUTCMinutes()).padStart(2, '0') + ':' +
          String(now.getUTCSeconds()).padStart(2, '0');
      }
    };
    update();
    setInterval(update, 1000);
  }

  /**
   * Correct mouse NDC to account for lens distortion post-processing.
   * The shader maps output pixel to source sample position;
   * we apply the same forward transform so raycaster matches the visual.
   */
  undistortPointer(ndc) {
    const intensity = this.distortionManager.intensity;
    const baseScale = CONFIG.distortion.baseScale;
    const ratio = window.innerWidth / window.innerHeight;
    const dx = intensity * ratio;
    const dy = intensity;
    // Mouse NDC -> UV centered = ndc/2, r² in UV space
    const r2 = (ndc.x * ndc.x + ndc.y * ndc.y) / 4;
    // Apply same distortion as shader (forward mapping)
    const cx = ndc.x * (baseScale + dx * r2);
    const cy = ndc.y * (baseScale + dy * r2);
    return new THREE.Vector2(cx, cy);
  }

  bindEvents() {
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    });
  }

  animate = () => {
    requestAnimationFrame(this.animate);

    // Update navigation (drag + inertia)
    const offset = this.navigation.update();

    // Ambient cursor offset
    const ambientOffset = this.navigation.getAmbientCursorOffset();

    // Update grid position
    this.grid.setOffset(
      offset.x + ambientOffset.x,
      offset.y - ambientOffset.y
    );

    // Camera zoom (smooth)
    this.camera.fov = CONFIG.camera.fov;
    this.camera.updateProjectionMatrix();
    this.camera.position.z += (this.targetCameraZ - this.camera.position.z) * 0.04;

    // Intro scale animation (grid scales from small to 1.0)
    if (this.introScaleActive) {
      const s = this.grid.group.scale.x;
      const ns = s + (1 - s) * 0.04;
      this.grid.group.scale.set(ns, ns, 1);
      if (Math.abs(1 - ns) < 0.001) {
        this.grid.group.scale.set(1, 1, 1);
        this.introScaleActive = false;
      }
    }

    // Hover detection via raycaster — detect hit meshes (1.1x image area)
    // Skip hover detection while dragging
    const undistorted = this.undistortPointer(this.pointerNdc);
    this.raycaster.setFromCamera(undistorted, this.camera);
    const hitMeshes = this.grid.tiles.map(t => t.userData.hitMesh).filter(Boolean);
    const isActuallyDragging = this.navigation.isDragging && this.navigation.velocity.lengthSq() > 0.00001;
    const intersects = isActuallyDragging ? [] : this.raycaster.intersectObjects(hitMeshes);
    const hitObj = intersects.length > 0 ? intersects[0].object : null;
    const newHovered = hitObj ? hitObj.userData.parentTile : null;

    if (this.hoveredTile !== newHovered) {
      // Reset previous
      if (this.hoveredTile) {
        this.hoveredTile.userData.hoverTarget = 0;
      }
      this.hoveredTile = newHovered;
      if (this.hoveredTile) {
        this.hoveredTile.userData.hoverTarget = 1;
      }
      this.canvas.style.cursor = newHovered ? 'pointer' : 'grab';
      this.navigation.suppressDrag = !!newHovered;
    }

    // Animate hover state for all tiles
    for (const tile of this.grid.tiles) {
      const target = tile.userData.hoverTarget || 0;
      const current = tile.userData.hoverValue || 0;
      const next = current + (target - current) * 0.12;
      tile.userData.hoverValue = Math.abs(next) < 0.001 ? 0 : next;

      const img = tile.userData.imageMesh;
      if (img) {
        // Scale image: 1.0 -> 1.10
        const s = 1.0 + next * 0.10;
        img.scale.set(s, s, 1);
        // Z lift on image
        img.position.z = 0.01 + next * 0.4;
        // Brightness on image
        const brightness = 1.0 + next * 0.5;
        img.material.color.setRGB(brightness, brightness, brightness);
      }
    }

    // Update distortion
    this.distortionManager.update(this.distortionPass.uniforms);

    // Render with post-processing
    this.composer.render();
  };
}

/* ============================================================
   BOOT — Wait for fonts
   ============================================================ */
document.fonts.ready.then(() => {
  new App();
});
