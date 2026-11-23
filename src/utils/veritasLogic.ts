export interface ConferenceFormInput {
  mode: 'register' | 'contact';
  fullName: string;
  email: string;
  institution: string;
  committee: string;
  experience: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ConferenceFormInput, string>>;
}

export interface SpherePoint {
  x: number;
  y: number;
  z: number;
}

export function validateConferenceForm(input: ConferenceFormInput): ValidationResult {
  const errors: Partial<Record<keyof ConferenceFormInput, string>> = {};
  const name = input.fullName.trim();
  const email = input.email.trim();
  const institution = input.institution.trim();
  const message = input.message.trim();

  if (name.length < 2) {
    errors.fullName = 'Please enter your full name (at least 2 characters).';
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailPattern.test(email)) {
    errors.email = 'Please provide a valid email address.';
  }

  if (input.mode === 'register') {
    if (institution.length < 2) {
      errors.institution = 'Please enter your school, university, or delegation.';
    }
    if (!input.committee.trim()) {
      errors.committee = 'Please select a preferred committee.';
    }
  } else {
    if (message.length < 10) {
      errors.message = 'Please enter an inquiry message of at least 10 characters.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function projectSpherePoint(
  latDeg: number,
  lonDeg: number,
  rotationY: number,
  tiltX: number,
  radius: number
): SpherePoint {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180 + rotationY;

  const cosLat = Math.cos(lat);
  const x0 = radius * cosLat * Math.sin(lon);
  const y0 = radius * Math.sin(lat);
  const z0 = radius * cosLat * Math.cos(lon);

  const cosTilt = Math.cos(tiltX);
  const sinTilt = Math.sin(tiltX);
  const y = y0 * cosTilt - z0 * sinTilt;
  const z = y0 * sinTilt + z0 * cosTilt;

  return { x: x0, y, z };
}

export function stepGlobeVelocity(
  currentBoost: number,
  scrollDelta: number,
  dtSeconds: number
): { nextBoost: number; angularSpeed: number } {
  const baseSpeed = 0.14;
  const clampedDelta = Math.min(Math.abs(scrollDelta), 260);
  const injectedBoost = Math.min(0.65, currentBoost + clampedDelta * 0.0022);
  const decay = Math.exp(-3.2 * Math.max(0, dtSeconds));
  const nextBoost = injectedBoost * decay;
  return {
    nextBoost: nextBoost < 0.001 ? 0 : nextBoost,
    angularSpeed: baseSpeed + nextBoost,
  };
}

export function resolveInitialMode(
  search: string,
  prefersReducedMotion: boolean
): 'intro' | 'ready' {
  if (prefersReducedMotion) {
    return 'ready';
  }
  const params = new URLSearchParams(search);
  if (params.get('autostart') === '1') {
    return 'ready';
  }
  return 'intro';
}

export function computeScrollProgress(
  scrollY: number,
  scrollHeight: number,
  viewportHeight: number
): number {
  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  if (maxScroll === 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, scrollY / maxScroll));
}

export function computeCardTilt(
  normX: number,
  normY: number,
  maxDeg = 6,
  reducedMotion = false
): { rotateX: number; rotateY: number } {
  if (reducedMotion) {
    return { rotateX: 0, rotateY: 0 };
  }
  const cx = Math.min(1, Math.max(-1, normX));
  const cy = Math.min(1, Math.max(-1, normY));
  const limit = Math.min(6, Math.max(0, maxDeg));
  return {
    rotateX: Number((-cy * limit).toFixed(3)),
    rotateY: Number((cx * limit).toFixed(3)),
  };
}

export function resolveNavbarVisibility(
  scrollY: number,
  deltaY: number,
  hasFocusWithin: boolean
): 'visible' | 'hidden' {
  if (hasFocusWithin || scrollY < 80) {
    return 'visible';
  }
  if (deltaY > 4) {
    return 'hidden';
  }
  if (deltaY < -4) {
    return 'visible';
  }
  return 'visible';
}

export function computeGlobeMagnetOffset(
  px: number,
  py: number,
  cursorX: number,
  cursorY: number,
  radius: number,
  strength: number,
  maxPull = 22
): { x: number; y: number; glow: number } {
  if (strength <= 0 || radius <= 0 || maxPull <= 0) {
    return { x: px, y: py, glow: 0 };
  }
  const dx = cursorX - px;
  const dy = cursorY - py;
  const dist = Math.hypot(dx, dy);
  if (dist >= radius || dist < 1e-4) {
    return { x: px, y: py, glow: dist < 1e-4 ? Math.min(1, strength) : 0 };
  }
  const falloff = 1 - dist / radius;
  const eased = falloff * falloff * Math.min(1, strength);
  const pull = eased * maxPull;
  return {
    x: px + (dx / dist) * pull,
    y: py + (dy / dist) * pull,
    glow: Number(eased.toFixed(4)),
  };
}

export function computeMagneticButtonOffset(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  cursorX: number,
  cursorY: number,
  maxShift = 9,
  buffer = 24,
  reducedMotion = false
): { x: number; y: number } {
  if (reducedMotion || width <= 0 || height <= 0) {
    return { x: 0, y: 0 };
  }
  const dx = cursorX - centerX;
  const dy = cursorY - centerY;
  const rx = width / 2 + buffer;
  const ry = height / 2 + buffer;
  if (Math.abs(dx) > rx || Math.abs(dy) > ry) {
    return { x: 0, y: 0 };
  }
  const nx = dx / rx;
  const ny = dy / ry;
  return {
    x: Number(Math.max(-maxShift, Math.min(maxShift, nx * maxShift)).toFixed(2)),
    y: Number(Math.max(-maxShift, Math.min(maxShift, ny * maxShift)).toFixed(2)),
  };
}

export interface PhotoSpringState {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export function stepSpringPhoto(
  state: PhotoSpringState,
  dtSeconds: number,
  stiffness = 175,
  damping = 14
): PhotoSpringState {
  const dt = Math.min(0.05, Math.max(0, dtSeconds));
  if (dt === 0) return state;
  const ax = -stiffness * state.x - damping * state.vx;
  const ay = -stiffness * state.y - damping * state.vy;
  const vx = state.vx + ax * dt;
  const vy = state.vy + ay * dt;
  const x = state.x + vx * dt;
  const y = state.y + vy * dt;
  if (Math.hypot(x, y) < 0.08 && Math.hypot(vx, vy) < 0.5) {
    return { x: 0, y: 0, vx: 0, vy: 0 };
  }
  return { x, y, vx, vy };
}

export function shouldRevealOnScroll(
  top: number,
  bottom: number,
  height: number,
  viewportHeight: number,
  thresholdRatio = 0.88,
  reducedMotion = false
): boolean {
  if (reducedMotion) return true;
  if (height <= 0 || viewportHeight <= 0) return false;
  return top < viewportHeight * thresholdRatio && bottom > 0;
}

export function latLonToCartesian(
  latDeg: number,
  lonDeg: number,
  radius = 1
): SpherePoint {
  const lat = (latDeg * Math.PI) / 180;
  const lon = (lonDeg * Math.PI) / 180;
  const cosLat = Math.cos(lat);
  return {
    x: radius * cosLat * Math.sin(lon),
    y: radius * Math.sin(lat),
    z: radius * cosLat * Math.cos(lon),
  };
}

export function generateFibonacciSphereLatLon(
  samples: number
): Array<{ lat: number; lon: number; x: number; y: number; z: number }> {
  const count = Math.max(0, Math.floor(samples));
  const out: Array<{ lat: number; lon: number; x: number; y: number; z: number }> = [];
  if (count === 0) return out;
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * r;
    const z = Math.sin(theta) * r;
    const lat = (Math.asin(Math.max(-1, Math.min(1, y))) * 180) / Math.PI;
    const lon = (Math.atan2(x, z) * 180) / Math.PI;
    out.push({ lat, lon, x, y, z });
  }
  return out;
}

export interface TopoJsonTopology {
  type: 'Topology';
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: Record<string, TopoGeometry>;
}

export interface TopoGeometry {
  type: string;
  geometries?: TopoGeometry[];
  arcs?: unknown;
}

export function decodeTopoJsonLandRings(topology: TopoJsonTopology): number[][][][] {
  const scale = topology.transform?.scale ?? [1, 1];
  const translate = topology.transform?.translate ?? [0, 0];
  const decodedArcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map((pt) => {
      x += pt[0];
      y += pt[1];
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });

  const buildRing = (indices: number[]): number[][] => {
    const pts: number[][] = [];
    for (const idx of indices) {
      const rev = idx < 0;
      const raw = decodedArcs[rev ? ~idx : idx];
      if (!raw || raw.length === 0) continue;
      const start = rev ? raw.length - 1 : 0;
      const step = rev ? -1 : 1;
      for (let i = 0; i < raw.length; i++) {
        if (pts.length > 0 && i === 0) continue;
        pts.push(raw[start + i * step]);
      }
    }
    return pts;
  };

  const polygons: number[][][][] = [];
  const walk = (geom: TopoGeometry | undefined) => {
    if (!geom) return;
    if (geom.type === 'GeometryCollection' && Array.isArray(geom.geometries)) {
      geom.geometries.forEach(walk);
    } else if (geom.type === 'Polygon' && Array.isArray(geom.arcs)) {
      polygons.push((geom.arcs as number[][]).map(buildRing));
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.arcs)) {
      (geom.arcs as number[][][]).forEach((poly) => polygons.push(poly.map(buildRing)));
    }
  };
  walk(topology.objects.land ?? Object.values(topology.objects)[0]);
  return polygons;
}

export interface CinematicBeatState {
  phase: 'point' | 'expand' | 'arcs' | 'impact' | 'title' | 'handoff' | 'done';
  pointAlpha: number;
  globeExpand: number;
  wavePos: number;
  arcsVisible: number;
  arcsConverge: number;
  impactShock: number;
  shakeIntensity: number;
  flashAlpha: number;
  logoScale: number;
  logoAlpha: number;
  laurelPercent: number;
  lettersCount: number;
  handoffProgress: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);

export function computeCinematicBeatState(elapsedSec: number): CinematicBeatState {
  const t = Math.max(0, elapsedSec);
  const phase: CinematicBeatState['phase'] =
    t < 1.5
      ? 'point'
      : t < 3.5
        ? 'expand'
        : t < 5.5
          ? 'arcs'
          : t < 6.5
            ? 'impact'
            : t < 8.0
              ? 'title'
              : t < 9.35
                ? 'handoff'
                : 'done';

  const pointAlpha =
    t < 1.5
      ? easeOutCubic(t / 0.65)
      : t < 2.15
        ? 1 - clamp01((t - 1.5) / 0.65)
        : 0;

  const globeExpand = t < 1.5 ? 0 : easeOutCubic((t - 1.5) / 0.9);
  const wavePos = t < 1.6 ? -1.4 : -1.4 + clamp01((t - 1.6) / 1.85) * 2.8;
  const arcsVisible = t < 3.5 ? 0 : t < 5.5 ? clamp01((t - 3.5) / 1.8) : 1;
  const arcsConverge = t < 5.15 ? 0 : clamp01((t - 5.15) / 0.35);
  const impactShock = t < 5.5 ? 0 : t < 6.35 ? clamp01((t - 5.5) / 0.85) : 0;
  const shakeIntensity = t >= 5.5 && t < 5.65 ? 1 - (t - 5.5) / 0.15 : 0;
  const flashAlpha = t >= 5.5 && t < 5.82 ? (1 - (t - 5.5) / 0.32) * 0.52 : 0;

  const logoReveal = t < 5.5 ? 0 : easeOutCubic((t - 5.5) / 0.55);
  const logoAlpha = t < 5.5 ? 0 : clamp01((t - 5.5) / 0.35);
  const logoScale = 0.64 + logoReveal * 0.36;
  const laurelPercent = t < 5.55 ? 0 : easeOutCubic((t - 5.55) / 0.9) * 118;

  const lettersCount = t < 6.5 ? 0 : Math.min(10, Math.floor((t - 6.5) / 0.095) + 1);
  const handoffProgress = t < 8.0 ? 0 : clamp01((t - 8.0) / 1.35);

  return {
    phase,
    pointAlpha,
    globeExpand,
    wavePos,
    arcsVisible,
    arcsConverge,
    impactShock,
    shakeIntensity,
    flashAlpha,
    logoScale,
    logoAlpha,
    laurelPercent,
    lettersCount,
    handoffProgress,
  };
}


