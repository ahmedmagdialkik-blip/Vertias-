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

export interface GlobeJourneyStop {
  id: string;
  region: string;
  latDeg: number;
  lonDeg: number;
  posXDesktop: number;
  posYDesktop: number;
  scaleDesktop: number;
}

export const GLOBE_JOURNEY_STOPS: readonly GlobeJourneyStop[] = [
  { id: 'top', region: 'New York', latDeg: 38, lonDeg: -74, posXDesktop: 1.38, posYDesktop: -0.02, scaleDesktop: 1.54 },
  { id: 'secretariat', region: 'Geneva', latDeg: 44, lonDeg: 6, posXDesktop: 1.48, posYDesktop: 0.02, scaleDesktop: 1.38 },
  { id: 'about', region: 'Amman', latDeg: 24, lonDeg: 36, posXDesktop: 1.42, posYDesktop: -0.02, scaleDesktop: 1.44 },
  { id: 'committees', region: 'New Delhi', latDeg: 18, lonDeg: 86, posXDesktop: 1.40, posYDesktop: 0.0, scaleDesktop: 1.46 },
  { id: 'schedule', region: 'Tokyo', latDeg: 35, lonDeg: 139, posXDesktop: 1.44, posYDesktop: -0.02, scaleDesktop: 1.44 },
  { id: 'faq', region: 'Sydney', latDeg: -26, lonDeg: 151, posXDesktop: 1.48, posYDesktop: 0.03, scaleDesktop: 1.40 },
  { id: 'apply', region: 'Brasilia', latDeg: -16, lonDeg: 305, posXDesktop: 1.40, posYDesktop: -0.02, scaleDesktop: 1.48 },
];

export interface InterpolatedGlobePose {
  rotY: number;
  tiltX: number;
  posX: number;
  posY: number;
  scale: number;
}

export function interpolateGlobeJourney(
  stops: readonly GlobeJourneyStop[],
  progress: number
): InterpolatedGlobePose {
  if (stops.length === 0) {
    return { rotY: -0.65, tiltX: -0.22, posX: 1.42, posY: 0, scale: 1.44 };
  }
  const clamped = Math.min(1, Math.max(0, progress));
  const scaled = clamped * (stops.length - 1);
  const idx = Math.min(stops.length - 1, Math.floor(scaled));
  const nextIdx = Math.min(stops.length - 1, idx + 1);
  const localT = scaled - idx;
  const smoothT = localT * localT * (3 - 2 * localT);

  const a = stops[idx];
  const b = stops[nextIdx];

  const lon = a.lonDeg + (b.lonDeg - a.lonDeg) * smoothT;
  const lat = a.latDeg + (b.latDeg - a.latDeg) * smoothT;

  return {
    rotY: (-lon * Math.PI) / 180,
    tiltX: (lat * Math.PI) / 180 * 0.58,
    posX: a.posXDesktop + (b.posXDesktop - a.posXDesktop) * smoothT,
    posY: a.posYDesktop + (b.posYDesktop - a.posYDesktop) * smoothT,
    scale: a.scaleDesktop + (b.scaleDesktop - a.scaleDesktop) * smoothT,
  };
}

export function computeHeroLetterLift(
  letterCenterX: number,
  letterCenterY: number,
  cursorX: number,
  cursorY: number,
  radius = 120,
  maxLiftPx = 14,
  reducedMotion = false
): { liftY: number; glow: number } {
  if (reducedMotion || radius <= 0 || maxLiftPx <= 0) {
    return { liftY: 0, glow: 0 };
  }
  const dist = Math.hypot(cursorX - letterCenterX, cursorY - letterCenterY);
  if (dist >= radius) {
    return { liftY: 0, glow: 0 };
  }
  const t = 1 - dist / radius;
  const eased = t * t * (3 - 2 * t);
  return {
    liftY: Number((-eased * maxLiftPx).toFixed(2)),
    glow: Number(eased.toFixed(3)),
  };
}

export const SCROLL_BG_PALETTE = {
  ink: [26, 18, 23] as const,
  cream: [237, 230, 214] as const,
  taupe: [186, 177, 160] as const,
};

export interface ScrollBgAnchor {
  centerY: number;
  rgb: readonly [number, number, number];
}

export interface ScrollBackgroundState {
  rgb: [number, number, number];
  cssColor: string;
  luminance: number;
  isDark: boolean;
  darkness: number;
}

export function computeScrollBackgroundState(
  focalY: number,
  anchors: readonly ScrollBgAnchor[]
): ScrollBackgroundState {
  if (anchors.length === 0) {
    return {
      rgb: [26, 18, 23],
      cssColor: 'rgb(26, 18, 23)',
      luminance: 0.08,
      isDark: true,
      darkness: 1,
    };
  }
  let rgb: [number, number, number];
  if (focalY <= anchors[0].centerY) {
    rgb = [anchors[0].rgb[0], anchors[0].rgb[1], anchors[0].rgb[2]];
  } else if (focalY >= anchors[anchors.length - 1].centerY) {
    const last = anchors[anchors.length - 1].rgb;
    rgb = [last[0], last[1], last[2]];
  } else {
    let idx = 0;
    for (let i = 0; i < anchors.length - 1; i++) {
      if (focalY >= anchors[i].centerY && focalY <= anchors[i + 1].centerY) {
        idx = i;
        break;
      }
    }
    const a = anchors[idx];
    const b = anchors[idx + 1];
    const span = Math.max(1, b.centerY - a.centerY);
    const rawT = clamp01((focalY - a.centerY) / span);
    const edgeT = clamp01((rawT - 0.18) / 0.64);
    const smoothT = edgeT * edgeT * (3 - 2 * edgeT);
    rgb = [
      Math.round(a.rgb[0] + (b.rgb[0] - a.rgb[0]) * smoothT),
      Math.round(a.rgb[1] + (b.rgb[1] - a.rgb[1]) * smoothT),
      Math.round(a.rgb[2] + (b.rgb[2] - a.rgb[2]) * smoothT),
    ];
  }
  const luminance = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  const isDark = luminance < 0.34;
  const darkness = clamp01(1 - (luminance - 0.14) / 0.34);
  return {
    rgb,
    cssColor: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`,
    luminance: Number(luminance.toFixed(4)),
    isDark,
    darkness: Number(darkness.toFixed(4)),
  };
}

export function computeStatueTilt(
  pointerX: number,
  pointerY: number,
  centerX: number,
  centerY: number,
  spanX: number,
  spanY: number,
  maxDeg = 8,
  reducedMotion = false
): { tiltX: number; tiltY: number } {
  if (reducedMotion || maxDeg <= 0 || spanX <= 0 || spanY <= 0) {
    return { tiltX: 0, tiltY: 0 };
  }
  const limit = Math.min(8, maxDeg);
  const nx = Math.max(-1, Math.min(1, (pointerX - centerX) / spanX));
  const ny = Math.max(-1, Math.min(1, (pointerY - centerY) / spanY));
  return {
    tiltX: Number((-ny * limit).toFixed(3)),
    tiltY: Number((nx * limit).toFixed(3)),
  };
}

export interface StatueScrollPose {
  heroTransition: number;
  scale: number;
  rotateZ: number;
  driftY: number;
  isPinned: boolean;
  visible: boolean;
}

export function computeStatueScrollPose(
  scrollY: number,
  viewportHeight: number,
  scrollProgress: number,
  viewportWidth: number
): StatueScrollPose {
  const vh = Math.max(1, viewportHeight);
  const heroSpan = vh * 0.65;
  const rawT = clamp01(scrollY / heroSpan);
  const easeT = rawT < 0.5 ? 4 * rawT * rawT * rawT : 1 - Math.pow(-2 * rawT + 2, 3) / 2;
  const isSmallScreen = viewportWidth < 700;
  const clampedProgress = clamp01(scrollProgress);

  if (isSmallScreen) {
    return {
      heroTransition: easeT,
      scale: 1,
      rotateZ: Number((-clampedProgress * 3).toFixed(3)),
      driftY: Number((-rawT * 36).toFixed(2)),
      isPinned: false,
      visible: rawT < 0.92,
    };
  }

  return {
    heroTransition: easeT,
    scale: Number((1 - easeT * 0.6).toFixed(4)),
    rotateZ: Number((-clampedProgress * 4.5).toFixed(3)),
    driftY: Number((-clampedProgress * 22).toFixed(2)),
    isPinned: rawT > 0.5,
    visible: true,
  };
}

export interface TorchVisualState {
  proximity: number;
  flareStrength: number;
  glowScale: number;
  glowOpacity: number;
  targetEmbers: number;
}

export function computeTorchProximity(
  cursorX: number,
  cursorY: number,
  torchX: number,
  torchY: number,
  radius = 220,
  flareElapsedMs = -1,
  isMobile = false,
  reducedMotion = false
): TorchVisualState {
  const dist = Math.hypot(cursorX - torchX, cursorY - torchY);
  const prox = !reducedMotion && radius > 0 ? clamp01(1 - dist / radius) : 0;
  const flareDuration = 600;
  let flareStrength = 0;
  if (flareElapsedMs >= 0 && flareElapsedMs <= flareDuration) {
    const u = flareElapsedMs / flareDuration;
    flareStrength = u < 0.12 ? u / 0.12 : Math.pow(1 - (u - 0.12) / 0.88, 1.5);
  }
  const glowScale = Number(((1 + prox * 0.45) * (1 + flareStrength)).toFixed(3));
  const glowOpacity = Number(Math.min(1, (0.68 + prox * 0.24) * (1 + flareStrength)).toFixed(3));
  const baseEmbers = Math.round(10 + prox * 22 + flareStrength * 28);
  const targetEmbers = reducedMotion ? 0 : clampEmberCap(baseEmbers, isMobile);

  return {
    proximity: Number(prox.toFixed(3)),
    flareStrength: Number(flareStrength.toFixed(3)),
    glowScale,
    glowOpacity,
    targetEmbers,
  };
}

export function clampEmberCap(desiredCount: number, isMobile: boolean): number {
  const cap = isMobile ? 40 : 65;
  return Math.max(0, Math.min(cap, Math.round(desiredCount)));
}




