import { gsap } from 'gsap';
import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, ExtrudeGeometry, Group, IcosahedronGeometry,
  Line, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Points, PointsMaterial, RingGeometry,
  Scene, Shape, ShapeGeometry, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer,
  type Material, type Object3D,
} from 'three';

export interface IntroElements {
  canvas: HTMLCanvasElement;
  flash: HTMLElement;
  hud: HTMLElement;
  phase: HTMLElement;
  coord: HTMLElement;
  progress: HTMLElement;
  vignette: HTMLElement;
  grid: HTMLElement;
  reticle: HTMLElement;
  tagline: HTMLElement;
}
export interface IntroOptions extends IntroElements {
  /** Final page background, so the last frame matches the page underneath. */
  endColor: string;
  quality: 'high' | 'low';
}
export interface IntroPlayer { done: Promise<void>; pause(): void; resume(): void; dispose(): void }

const ICE = new Color('#95d2e7');
const ICE_DEEP = new Color('#3d8fae');
const WHITE = new Color('#ffffff');
const R = 2.2; // orbit radius = centre line of the brand ring (r = 48 svg units)
const LOGO_SCALE = R / 48;
const LOGO_HALF_HEIGHT = 51 * LOGO_SCALE; // outer ring radius in world units
const RING_GAP = Math.PI / 4; // the brand ring is open from -45° to +45°
/** Electron spin: one continuous speed curve (ramp up → cruise → glide to rest) instead of spliced tweens. */
const SPIN = { start: 0.25, duration: 3.2, total: 11 };
// Orbits are circles of radius R. Tilted out of the screen plane they read as the classic atom; when the
// tilt goes to 0 all three collapse onto the same circle, which is the brand ring.
// `target` = world angle where each electron comes to rest. All three land in the ring's gap at
// 3 o'clock, where the brand mark's vertical bar sits, and fuse into that bar.
const ORBITS = [
  { z: 0, tiltX: 1.22, omega: 1.35, target: 0.25 },
  { z: Math.PI / 3, tiltX: -1.22, omega: 1.15, target: 0 },
  { z: (2 * Math.PI) / 3, tiltX: 1.22, omega: 1, target: -0.25 },
].map((orbit) => ({ ...orbit, start: orbit.target - orbit.z - orbit.omega * SPIN.total }));
const TRAIL_POINTS = 26;
const PHASES: [number, string][] = [[0, '01 / INIT'], [1, '02 / ORBIT'], [3, '03 / ALIGN'], [3.5, '04 / FLIP'], [4.2, '05 / LOCK ON'], [5.6, '06 / ENTER']];

/** Normalised spin progress table: speed = ramp-in × (1 − smoothstep slowdown), integrated. */
const SPIN_TABLE = (() => {
  const n = 256; const table = new Float32Array(n + 1); let sum = 0;
  for (let i = 1; i <= n; i++) {
    const u = (i - 0.5) / n; const d = Math.min(1, Math.max(0, (u - 0.6) / 0.4));
    sum += (1 - Math.exp(-u / 0.07)) * (1 - d * d * (3 - 2 * d)); table[i] = sum;
  }
  return table.map((v) => v / sum);
})();
function spinAt(time: number) {
  const u = Math.min(1, Math.max(0, (time - SPIN.start) / SPIN.duration)) * (SPIN_TABLE.length - 1);
  const i = Math.floor(u); const next = SPIN_TABLE[Math.min(i + 1, SPIN_TABLE.length - 1)];
  return SPIN.total * (SPIN_TABLE[i] + (next - SPIN_TABLE[i]) * (u - i));
}

/** Tube whose path is rewritten every frame, so an orbit can be drawn by its electron and then reshaped. */
function liveTube(segments: number, radial: number) {
  const geometry = new BufferGeometry();
  const positions = new Float32Array((segments + 1) * radial * 3);
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  const index: number[] = [];
  for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j; const b = i * radial + ((j + 1) % radial);
    index.push(a, a + radial, b, b, a + radial, b + radial);
  }
  geometry.setIndex(index);
  const ring = Array.from({ length: radial }, (_, j) => [Math.cos((j / radial) * Math.PI * 2), Math.sin((j / radial) * Math.PI * 2)]);
  /** Circular arc of radius `radius` from angle `from` to `to` (radians), tube thickness `r`. */
  function write(from: number, to: number, radius: number, r: number) {
    for (let i = 0; i <= segments; i++) {
      const a = from + ((to - from) * i) / segments; const c = Math.cos(a); const s = Math.sin(a);
      for (let j = 0; j < radial; j++) {
        const [cn, sn] = ring[j]; const k = (i * radial + j) * 3; const d = radius + r * cn;
        positions[k] = c * d; positions[k + 1] = s * d; positions[k + 2] = r * sn;
      }
    }
    geometry.attributes.position.needsUpdate = true;
  }
  return { geometry, write };
}

function safeColor(value: string, fallback: string) {
  const color = new Color(fallback);
  try { if (value && !/transparent|rgba\([^)]*,\s*0\)/.test(value)) color.setStyle(value); } catch { /* keep fallback */ }
  return color;
}

function glowTexture() {
  const size = 128; const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}

/** Horizontal light band used for the specular sweep across the logo. */
function sweepTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 256, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.58, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 4);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}

function fmt(value: number) {
  return (value < -0.05 ? '-' : '+') + Math.abs(value).toFixed(1).padStart(5, '0');
}

function seeded(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Brand mark (BrandMark.astro, full variant) rebuilt as flat shapes, centred and y-up. */
function brandShapes() {
  const p = (x: number, y: number) => [(x - 60) * LOGO_SCALE, (60 - y) * LOGO_SCALE] as const;
  const poly = (points: number[][]) => {
    const shape = new Shape(); points.forEach(([x, y], i) => { const [px, py] = p(x, y); if (i) shape.lineTo(px, py); else shape.moveTo(px, py); }); shape.closePath(); return shape;
  };
  const ring = new Shape();
  const outer = 51 * LOGO_SCALE; const inner = 45 * LOGO_SCALE; const from = Math.PI / 4; const to = (Math.PI * 7) / 4;
  ring.absarc(0, 0, outer, from, to, false); ring.absarc(0, 0, inner, to, from, true); ring.closePath();
  return [
    ring,
    poly([[103, 47], [109, 47], [109, 73], [103, 73]]),
    poly([[60, 27], [32, 73], [45, 73], [60, 48], [75, 73], [88, 73]]),
    poly([[34, 79], [45, 79], [49, 84], [60, 72], [71, 84], [75, 79], [86, 79], [71, 95], [60, 83], [49, 95]]),
  ];
}

export function createIntro(options: IntroOptions): IntroPlayer {
  const { canvas, flash, hud, phase: phaseLabel, coord, progress, vignette, grid, reticle, tagline, quality } = options;
  const high = quality === 'high';
  const renderer = new WebGLRenderer({ canvas, antialias: high, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, high ? 2 : 1.5));
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, 0.05, 140);
  const glow = glowTexture();
  const sweep = sweepTexture();
  const rand = seeded(20261010);

  const accent = safeColor(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(), '#14617c');
  const bgStops = [new Color('#000000'), new Color('#050b0f'), new Color('#0c151a'), safeColor(options.endColor, '#f4f7f7')];
  scene.background = bgStops[0].clone();
  const additive = (color: Color, opacity = 1) => new MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: AdditiveBlending });
  const spriteMat = (color: Color, map = glow) => new SpriteMaterial({ map, color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });

  // ---- Stars: two layers (fine dust + brighter points). During the dive they stretch into streaks.
  const starCount = high ? 700 : 260;
  const starBase = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const angle = rand() * Math.PI * 2; const radius = 2.6 + Math.pow(rand(), 0.7) * 28;
    starBase.set([Math.cos(angle) * radius, Math.sin(angle) * radius * 0.7, -70 + rand() * 76], i * 3);
  }
  const dustCount = Math.floor(starCount * 0.75);
  const makePoints = (from: number, to: number, size: number, color: string) => {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new BufferAttribute(starBase.slice(from * 3, to * 3), 3));
    const material = new PointsMaterial({ size, map: glow, color, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, sizeAttenuation: true });
    scene.add(new Points(geometry, material)); return material;
  };
  const dustMaterial = makePoints(0, dustCount, high ? 0.07 : 0.1, '#7fb4c6');
  const brightMaterial = makePoints(dustCount, starCount, high ? 0.16 : 0.2, '#e3f5fb');
  // Streak segments: tail stays, head is pushed toward the camera by the warp amount.
  const streakPositions = new Float32Array(starCount * 6);
  const streakGeometry = new BufferGeometry(); streakGeometry.setAttribute('position', new BufferAttribute(streakPositions, 3));
  const streakMaterial = new LineBasicMaterial({ color: '#bfe6f3', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const streaks = new LineSegments(streakGeometry, streakMaterial); streaks.frustumCulled = false; scene.add(streaks);

  // ---- Stage: everything that flips. Atom on the front, brand mark on the back.
  const stage = new Group(); scene.add(stage);
  const atom = new Group(); stage.add(atom);

  // Each orbit = thin bright core + wider soft sheath, so lines read as light rather than wire.
  // The tubes are rewritten every frame: an electron draws its own orbit, and at the end the three
  // orbits flatten into circles of the brand ring's radius and open the ring's gap at 3 o'clock.
  const segments = high ? 160 : 96;
  const orbitMaterial = additive(new Color('#d6f1fa'), 0);
  const sheathMaterial = additive(ICE_DEEP, 0);
  const orbits = ORBITS.map((orbit) => {
    const outer = new Group(); outer.rotation.z = orbit.z; atom.add(outer);
    const tilt = new Group(); outer.add(tilt);
    const core = liveTube(segments, 6); const sheath = liveTube(segments, 6);
    const sheathMesh = new Mesh(sheath.geometry, sheathMaterial); const coreMesh = new Mesh(core.geometry, orbitMaterial);
    sheathMesh.frustumCulled = coreMesh.frustumCulled = false;
    tilt.add(sheathMesh, coreMesh);
    return { tilt, core, sheath, meshes: [sheathMesh, coreMesh] };
  });
  // Each electron leaves the nucleus at its own moment, spirals out and starts drawing its orbit once it arrives.
  const EMERGE = ORBITS.map((orbit, k) => {
    const at = 0.32 + k * 0.14; const arrive = at + 0.5;
    return { at, arrive, spawn: orbit.start + orbit.omega * spinAt(arrive) };
  });
  // The brand mark's vertical bar (svg x 103–109, y 47–73); the three resting electrons fuse into it.
  const barMaterial = additive(new Color('#e4f6fc'), 0);
  const bar = new Mesh(new PlaneGeometry(6 * LOGO_SCALE, 26 * LOGO_SCALE), barMaterial);
  bar.position.x = 46 * LOGO_SCALE; bar.scale.y = 0.001; atom.add(bar);

  // Nucleus: a small cluster of spheres instead of one ball, plus a two-layer glow.
  const nucleus = new Group(); atom.add(nucleus);
  const nucleonGeometry = new IcosahedronGeometry(0.085, 2);
  const protonMaterial = additive(new Color('#eefaff'), 0); const neutronMaterial = additive(new Color('#6fb7d1'), 0);
  for (let i = 0; i < 9; i++) {
    const v = new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(i ? 0.09 + rand() * 0.05 : 0);
    const nucleon = new Mesh(nucleonGeometry, i % 2 ? neutronMaterial : protonMaterial); nucleon.position.copy(v); nucleus.add(nucleon);
  }
  const coreGlowMaterial = spriteMat(WHITE); const coreGlow = new Sprite(coreGlowMaterial); atom.add(coreGlow);
  const auraMaterial = spriteMat(ICE); const aura = new Sprite(auraMaterial); atom.add(aura);

  // Electrons live in world space; their positions are projected from each orbit's transform every frame.
  const electronGeometry = new IcosahedronGeometry(0.06, 1);
  const electronMaterial = additive(WHITE, 0);
  const electronGlowMaterial = spriteMat(ICE);
  const trailMaterial = new LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const electrons = ORBITS.map(() => {
    const body = new Mesh(electronGeometry, electronMaterial);
    const halo = new Sprite(electronGlowMaterial); halo.scale.setScalar(0.7); body.add(halo);
    scene.add(body);
    let trail: { line: Line; positions: Float32Array; colors: Float32Array } | undefined;
    if (high) {
      const geometry = new BufferGeometry();
      const positions = new Float32Array(TRAIL_POINTS * 3); const colors = new Float32Array(TRAIL_POINTS * 3);
      geometry.setAttribute('position', new BufferAttribute(positions, 3)); geometry.setAttribute('color', new BufferAttribute(colors, 3));
      const line = new Line(geometry, trailMaterial); line.frustumCulled = false; scene.add(line);
      trail = { line, positions, colors };
    }
    return { body, trail };
  });

  // ---- Logo (back face). Solid fill + additive edge glow + a moving specular band clipped to the logo shape.
  const logo = new Group(); logo.rotation.y = Math.PI; logo.visible = false; stage.add(logo);
  const shapes = brandShapes();
  const logoMaterial = new MeshBasicMaterial({ color: ICE.clone(), transparent: true });
  logo.add(new Mesh(new ExtrudeGeometry(shapes, { depth: 0.08, bevelEnabled: false, curveSegments: high ? 56 : 28 }), logoMaterial));
  const sweepMaterial = new MeshBasicMaterial({ map: sweep, color: WHITE, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const sweepGeometry = new ShapeGeometry(shapes, high ? 56 : 28);
  // UVs map to the logo's bounding box so the texture offset sweeps across the whole mark.
  { const pos = sweepGeometry.attributes.position; const uv = sweepGeometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + R * 1.1) / (R * 2.2) * 0.8 + (pos.getY(i) + R) / (R * 2) * 0.2, 0.5); uv.needsUpdate = true; }
  // Front face of the extrusion is at z = 0.08; sit just in front of it.
  const sweepMesh = new Mesh(sweepGeometry, sweepMaterial); sweepMesh.position.z = 0.085; logo.add(sweepMesh);
  const haloMaterial = spriteMat(ICE); const halo = new Sprite(haloMaterial); halo.visible = false; stage.add(halo);

  // Shockwave rings and burst live outside the flipping stage so they always face the camera.
  const ringGeometry = new RingGeometry(0.96, 1, high ? 128 : 64);
  const shockMaterials = [additive(new Color('#dff4fb'), 0), additive(ICE, 0)];
  const shocks = shockMaterials.map((material) => { const mesh = new Mesh(ringGeometry, material); mesh.visible = false; scene.add(mesh); return mesh; });
  const burstMaterial = spriteMat(new Color('#e8f8fd')); const burst = new Sprite(burstMaterial); scene.add(burst);

  // ---- Animated state. GSAP only tweens these numbers; render() turns them into the scene.
  const s = {
    alpha: 0, scale: 0.9, camZ: 15, camY: 0.6, fov: 40, yaw: -0.85, pitch: 0.5, roll: 0.22, nucleus: 0, tilt: 1, ring: 0, fuse: 0,
    trails: 1, flip: 0, burst: 0, shock: 0, logoGlow: 1, sweep: -0.25, bg: 0, stars: 0, warp: 0, accent: 0, flash: 0,
    tagline: 0, rise: 0, logoLift: 0, hud: 0, grid: 0, reticle: 0, vignette: 1,
  };
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.out' } });
  tl
    // 0 – 1.0  the nucleus ignites, then the electrons leave it one by one and draw their own orbits
    .to(s, { alpha: 1, duration: 0.45 }, 0)
    .to(s, { nucleus: 1, duration: 0.9, ease: 'power3.out' }, 0.05)
    .to(s, { scale: 1, duration: 1.6, ease: 'power2.out' }, 0)
    .to(s, { camZ: 10, camY: 0, duration: 1.6, ease: 'power3.out' }, 0)
    .to(s, { stars: 1, duration: 1.4, ease: 'none' }, 0)
    .to(s, { hud: 1, duration: 0.8 }, 0.3)
    // 0 – 3.4  one continuous, ever-slowing turn of the whole atom toward the camera (no reversal);
    //          electron spin follows its own continuous curve, see spinAt()
    .to(s, { yaw: 0, duration: 3.4, ease: 'power1.inOut' }, 0)
    .to(s, { pitch: 0, roll: 0, duration: 3.4, ease: 'power2.inOut' }, 0)
    .to(s, { bg: 1, duration: 2, ease: 'sine.inOut' }, 0.9)
    // 2.6 – 3.5  orbits lay down onto one circle, the ring opens its gap and the electrons fuse into the bar
    .to(s, { tilt: 0, duration: 0.85, ease: 'power2.inOut' }, 2.55)
    .to(s, { trails: 0, duration: 0.6 }, 2.7)
    .to(s, { ring: 1, duration: 0.4, ease: 'power2.inOut' }, 3.1)
    .to(s, { fuse: 1, duration: 0.3, ease: 'power2.in' }, 3.22)
    .to(s, { bg: 2, duration: 0.6 }, 2.9)
    .to(s, { grid: 1, duration: 0.6 }, 3.05)
    // 3.5 – 4.2  flip while the camera eases back; the face swaps at 90° with a burst and two shockwaves
    .to(s, { flip: Math.PI, duration: 0.7, ease: 'power2.inOut' }, 3.5)
    .to(s, { camZ: 13.6, duration: 0.95, ease: 'power2.inOut' }, 3.4)
    .to(s, { burst: 1, duration: 0.6 }, 3.8)
    .to(s, { shock: 1, duration: 0.95, ease: 'power2.out' }, 3.8)
    .to(s, { flash: 0.45, duration: 0.07, ease: 'none' }, 3.8)
    .to(s, { flash: 0, duration: 0.45 }, 3.87)
    .to(s, { logoGlow: 0.25, duration: 0.7 }, 3.85)
    .to(s, { sweep: 1.25, duration: 0.95, ease: 'power1.inOut' }, 4.05)
    // 4.2 – 5.6  hold: the mark lifts slightly and the tagline writes in underneath
    .to(s, { logoLift: 1, duration: 0.6, ease: 'power3.out' }, 4.15)
    .to(s, { reticle: 1, duration: 0.5, ease: 'power3.out' }, 4.2)
    .to(s, { tagline: 1, duration: 0.01 }, 4.3)
    .to(s, { camZ: 12.9, duration: 1.3, ease: 'sine.inOut' }, 4.35)
    // 5.6 – 6.4  dive through the gap under the A into the page
    .to(s, { tagline: 2, rise: 1, duration: 0.3, ease: 'power2.in' }, 5.6)
    .to(s, { reticle: 0, hud: 0, grid: 0, duration: 0.3 }, 5.6)
    .to(s, { logoLift: 0, duration: 0.45, ease: 'power2.in' }, 5.6)
    .to(s, { camZ: -3, duration: 0.8, ease: 'power3.in' }, 5.65)
    .to(s, { fov: 82, duration: 0.8, ease: 'power2.in' }, 5.65)
    .to(s, { warp: 1, duration: 0.6, ease: 'power2.in' }, 5.65)
    .to(s, { accent: 1, duration: 0.6 }, 5.65)
    .to(s, { vignette: 0, duration: 0.6 }, 5.7)
    .to(s, { bg: 3, duration: 0.7, ease: 'power2.in' }, 5.75)
    .to(s, { stars: 0, duration: 0.45 }, 6.0);

  const point = new Vector3(); const bgColor = scene.background as Color;
  const projected = new Vector3(); const barWorld = new Vector3();
  let lastLabel = ''; let taglineState = -1;
  let viewWidth = 1; let viewHeight = 1;

  function resize() {
    viewWidth = window.innerWidth; viewHeight = window.innerHeight;
    renderer.setSize(viewWidth, viewHeight, false); camera.aspect = viewWidth / viewHeight;
    // Portrait screens: shrink the stage so the 4.9-unit wide mark always fits with margin.
    stage.scale.setScalar(Math.min(1, camera.aspect / 0.9));
  }

  function setTagline(state: number) {
    if (state === taglineState) return; taglineState = state;
    tagline.classList.toggle('is-in', state >= 1); tagline.classList.toggle('is-out', state >= 2);
  }

  function render() {
    const time = tl.time();
    const flipped = s.flip > Math.PI / 2;

    const i = Math.min(Math.floor(s.bg), 2);
    bgColor.lerpColors(bgStops[i], bgStops[i + 1], s.bg - i);

    // Stars + warp streaks
    dustMaterial.opacity = s.stars * 0.6 * (1 - s.warp * 0.6);
    brightMaterial.opacity = s.stars * 0.95 * (1 - s.warp * 0.5);
    streakMaterial.opacity = s.stars * s.warp * 0.75;
    streaks.visible = s.warp > 0.01;
    if (streaks.visible) {
      const stretch = s.warp * 9;
      for (let k = 0; k < starCount; k++) {
        const x = starBase[k * 3], y = starBase[k * 3 + 1], z = starBase[k * 3 + 2];
        streakPositions.set([x, y, z, x * (1 + s.warp * 0.15), y * (1 + s.warp * 0.15), z + stretch], k * 6);
      }
      streakGeometry.attributes.position.needsUpdate = true;
    }

    const lift = s.logoLift * LOGO_HALF_HEIGHT * 0.42 * stage.scale.x;
    camera.position.set(0, s.camY - lift, s.camZ); camera.fov = s.fov; camera.updateProjectionMatrix();
    camera.lookAt(0, -lift, Math.min(s.camZ - 1, 0));
    stage.rotation.y = s.flip;
    atom.scale.setScalar(s.scale); atom.rotation.set(s.pitch, s.yaw, s.roll); atom.visible = !flipped;
    orbits.forEach(({ tilt }, k) => tilt.rotation.set(ORBITS[k].tiltX * s.tilt, 0, 0));

    // Nucleus ignites first; every electron that leaves it kicks a small pulse.
    let kick = 0;
    EMERGE.forEach((e) => { const d = (time - e.at) / 0.09; kick += Math.exp(-d * d); });
    const pulse = 1 + Math.sin(time * 7) * 0.05 * s.nucleus + kick * 0.25;
    const fade = 1 - s.ring * 0.35;
    protonMaterial.opacity = s.alpha * (0.35 + s.nucleus * 0.65) * fade; neutronMaterial.opacity = s.alpha * (0.25 + s.nucleus * 0.65) * fade;
    nucleus.scale.setScalar(pulse * (0.55 + s.nucleus * 0.5)); nucleus.rotation.set(time * 0.9, time * 1.3, 0);
    coreGlowMaterial.opacity = s.alpha * Math.min(1, s.nucleus * 0.85 + kick * 0.3) * fade; coreGlow.scale.setScalar((0.5 + s.nucleus * 1.0) * pulse);
    auraMaterial.opacity = s.alpha * s.nucleus * 0.32 * fade; aura.scale.setScalar((1.2 + s.nucleus * 3) * (1 + kick * 0.15));

    // Orbits: drawn behind each electron until closed, then thickened into one band with the brand gap.
    const spin = spinAt(time);
    const speed = (spinAt(time + 0.01) - spinAt(time - 0.01)) / 0.02;
    const gap = RING_GAP * s.ring;
    const coreR = (high ? 0.012 : 0.016) + s.ring * 0.03;
    const sheathR = (high ? 0.05 : 0.06) + s.ring * 0.075;
    orbitMaterial.opacity = s.alpha * (0.95 - s.ring * 0.45);
    sheathMaterial.opacity = s.alpha * (0.16 + (1 - s.tilt) * 0.08 + s.ring * 0.14);
    scene.updateMatrixWorld();
    electronMaterial.opacity = s.alpha * (1 - s.fuse); electronGlowMaterial.opacity = s.alpha * (1 - s.fuse);
    orbits.forEach(({ tilt, core, sheath, meshes }, k) => {
      const orbit = ORBITS[k]; const e = EMERGE[k];
      const angle = orbit.start + orbit.omega * spin;
      const drawn = time < e.arrive ? 0 : Math.min(angle - e.spawn, Math.PI * 2);
      const visible = !flipped && drawn > 0.002;
      meshes.forEach((mesh) => { mesh.visible = visible; });
      if (visible) {
        // Gap angles are in world space; the orbit's own z-rotation is undone so all three open at 3 o'clock.
        const [from, to] = gap > 0 ? [gap - orbit.z, Math.PI * 2 - gap - orbit.z] : [angle - drawn, angle];
        core.write(from, to, R, coreR); sheath.write(from, to, R, sheathR);
      }

      // Electron: spirals out of the nucleus, rides its orbit, then slides into the bar and dissolves.
      const { body, trail } = electrons[k];
      const out = Math.min(1, Math.max(0, (time - e.at) / (e.arrive - e.at)));
      const radius = R * (1 - Math.pow(1 - out, 3));
      body.visible = !flipped && time >= e.at && s.fuse < 1;
      body.scale.setScalar(0.4 + out * 0.6);
      tilt.localToWorld(point.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
      if (s.fuse > 0) point.x += (bar.getWorldPosition(barWorld).x - point.x) * s.fuse;
      body.position.copy(point);
      if (!trail) return;
      trail.line.visible = body.visible && s.trails > 0;
      if (!trail.line.visible) return;
      const span = Math.min(speed * 0.14, 1.5) * orbit.omega * out;
      for (let j = 0; j < TRAIL_POINTS; j++) {
        const a = angle - (span * j) / (TRAIL_POINTS - 1);
        tilt.localToWorld(point.set(Math.cos(a) * radius, Math.sin(a) * radius, 0));
        trail.positions.set([point.x, point.y, point.z], j * 3);
        const f = Math.pow(1 - j / TRAIL_POINTS, 2.2) * s.alpha * s.trails;
        trail.colors.set([ICE.r * f, ICE.g * f, ICE.b * f], j * 3);
      }
      trail.line.geometry.attributes.position.needsUpdate = true; trail.line.geometry.attributes.color.needsUpdate = true;
    });
    bar.scale.y = Math.max(0.001, s.fuse); barMaterial.opacity = s.alpha * s.fuse * 0.9;

    logo.visible = flipped; halo.visible = flipped;
    logoMaterial.color.copy(ICE).lerp(WHITE, s.logoGlow * 0.6).lerp(accent, s.accent);
    haloMaterial.opacity = (0.18 + s.logoGlow * 0.45) * (1 - s.accent); halo.scale.setScalar(8 + Math.sin(time * 2.4) * 0.25);
    sweep.offset.x = 0.5 - s.sweep; sweepMaterial.opacity = flipped ? 0.85 * (1 - s.accent) : 0;
    burstMaterial.opacity = s.burst > 0 ? Math.pow(1 - s.burst, 1.4) : 0; burst.scale.setScalar((1 + s.burst * 12) * stage.scale.x);
    shocks.forEach((ring, k) => {
      const t = Math.max(0, s.shock - k * 0.12) / (1 - k * 0.12);
      ring.visible = t > 0 && t < 1; ring.scale.setScalar(LOGO_HALF_HEIGHT * stage.scale.x * (1 + t * (2.4 + k * 1.4)));
      shockMaterials[k].opacity = Math.pow(1 - t, 2) * (k ? 0.5 : 0.8);
    });

    // DOM layers
    flash.style.opacity = String(s.flash);
    progress.style.transform = `scaleX(${tl.progress()})`;
    hud.style.opacity = String(s.hud * 0.9);
    grid.style.opacity = String(s.grid * 0.5);
    vignette.style.opacity = String(s.vignette);
    reticle.style.opacity = String(s.reticle);
    reticle.style.setProperty('--reticle-scale', String(1.35 - s.reticle * 0.35));
    setTagline(s.tagline >= 2 ? 2 : s.tagline >= 1 ? 1 : 0);
    if (s.rise > 0) { tagline.style.opacity = String(1 - s.rise); tagline.style.setProperty('--tagline-rise', `${(-s.rise * 18).toFixed(1)}px`); }

    // Pin the tagline and reticle to the projected logo; keeps the layout correct on any aspect ratio.
    if (flipped || s.reticle > 0) {
      projected.set(0, -LOGO_HALF_HEIGHT * stage.scale.x, 0).project(camera);
      const bottom = (1 - projected.y) * 0.5 * viewHeight;
      projected.set(LOGO_HALF_HEIGHT * stage.scale.x, 0, 0).project(camera);
      const half = Math.abs(projected.x) * 0.5 * viewWidth;
      projected.set(0, 0, 0).project(camera);
      const centreY = (1 - projected.y) * 0.5 * viewHeight;
      tagline.style.setProperty('--tagline-top', `${Math.round(bottom + Math.max(26, half * 0.24))}px`);
      reticle.style.setProperty('--reticle-y', `${Math.round(centreY)}px`);
      reticle.style.setProperty('--reticle-size', `${Math.round(half * 2.36)}px`);
    }

    const label = PHASES.reduce((acc, [at, text]) => (time >= at ? text : acc), PHASES[0][1]);
    if (label !== lastLabel) { phaseLabel.textContent = label; lastLabel = label; }
    // Coordinates wander while the atom spins and lock to 000.0 once the emblem is aligned.
    const wobble = 1 - Math.min(1, Math.max(0, (time - 3) / 0.5));
    coord.textContent = `X ${fmt(Math.sin(time * 1.7) * 52 * wobble)}\u00a0\u00a0Y ${fmt(Math.cos(time * 1.3) * 31 * wobble)}`;

    renderer.render(scene, camera);
  }

  resize(); render();
  window.addEventListener('resize', resize);
  gsap.ticker.add(render);

  let rejectDone: (reason: Error) => void = () => {};
  const done = new Promise<void>((resolve, reject) => { rejectDone = reject; tl.eventCallback('onComplete', () => resolve()); });
  const onLost = (event: Event) => { event.preventDefault(); rejectDone(new Error('WebGL context lost')); };
  canvas.addEventListener('webglcontextlost', onLost);
  tl.play(0);

  return {
    done,
    pause: () => tl.pause(),
    resume: () => { if (tl.progress() < 1) tl.resume(); },
    dispose() {
      tl.kill(); gsap.ticker.remove(render);
      window.removeEventListener('resize', resize); canvas.removeEventListener('webglcontextlost', onLost);
      const materials = new Set<Material>();
      scene.traverse((object: Object3D) => {
        const item = object as Partial<Mesh>;
        item.geometry?.dispose();
        const material = item.material; if (Array.isArray(material)) material.forEach((m) => materials.add(m)); else if (material) materials.add(material);
      });
      materials.forEach((material) => material.dispose());
      glow.dispose(); sweep.dispose(); renderer.dispose(); renderer.forceContextLoss();
    },
  };
}
