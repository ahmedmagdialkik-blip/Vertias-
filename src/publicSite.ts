import type {
  AboutContent,
  CommitteeItem,
  FaqItem,
  FullSiteContent,
  HeroContent,
  RegisterItem,
  ScheduleItem,
  SiteSettings,
  TbaSectionContent,
  TeamCardRow
} from './types/database';
import {
  DEFAULT_APPLICATION_SETTINGS,
  formatTrackStatusLabel,
  normalizeApplicationSettings,
  type ApplicationSettings,
  type CommitteeRecord
} from './utils/committeesAndSettingsLogic';
import {
  DEFAULT_EB_DEPARTMENTS,
  DEFAULT_EB_MEMBERS,
  groupEbByDepartment,
  type EbDepartmentRecord,
  type EbMemberRecord
} from './utils/executiveBoardLogic';
import {
  computeHeroLetterLift,
  computeScrollProgress,
  computeStatueTilt,
  decodeTopoJsonLandRings,
  generateFibonacciSphereLatLon,
  projectSpherePoint,
  type TopoJsonTopology
} from './utils/veritasLogic';

export interface PublicScheduleDayRow {
  id: string;
  day_number?: number;
  title?: string;
  date_label?: string;
  sort_order?: number;
}

export interface PublicScheduleSessionRow {
  id: string;
  day_id?: string | null;
  start_time?: string;
  end_time?: string;
  title?: string;
  location?: string;
  description?: string;
  sort_order?: number;
}

export interface PublicFaqRow {
  id: string;
  question?: string;
  answer?: string;
  category?: string;
  sort_order?: number;
}

export interface PublicSitePayload {
  content?: FullSiteContent;
  teamCards?: TeamCardRow[];
  committees?: CommitteeRecord[];
  ebDepartments?: EbDepartmentRecord[];
  ebMembers?: EbMemberRecord[];
  scheduleDays?: PublicScheduleDayRow[];
  scheduleSessions?: PublicScheduleSessionRow[];
  faqs?: PublicFaqRow[];
}

function safeHref(url: unknown): string {
  if (typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }
  return '';
}

function createTbaStage(subtitle: string, note: string): HTMLElement {
  const stage = document.createElement('div');
  stage.className = 'tba-stage';

  const left = document.createElement('div');
  left.className = 'tba-left';

  const word = document.createElement('p');
  word.className = 'tba-word';
  word.textContent = 'TBA';

  const rule = document.createElement('div');
  rule.className = 'tba-rule';
  rule.setAttribute('aria-hidden', 'true');

  left.appendChild(word);
  left.appendChild(rule);

  const right = document.createElement('div');
  right.className = 'tba-right';

  const sub = document.createElement('p');
  sub.className = 'tba-sub';
  sub.textContent = subtitle || 'To be announced.';

  const p = document.createElement('p');
  p.className = 'tba-note';
  p.textContent = note;

  right.appendChild(sub);
  right.appendChild(p);

  stage.appendChild(left);
  stage.appendChild(right);
  return stage;
}

function initHeroGlobe(): { setPaused: (paused: boolean) => void } {
  const maybeCanvas = document.getElementById('globe') as HTMLCanvasElement | null;
  if (!maybeCanvas) {
    return { setPaused: () => {} };
  }
  const maybeCtx = maybeCanvas.getContext('2d');
  if (!maybeCtx) {
    return { setPaused: () => {} };
  }
  const canvas: HTMLCanvasElement = maybeCanvas;
  const ctx: CanvasRenderingContext2D = maybeCtx;

  const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = document.documentElement.classList.contains('is-portal-route');
  let rafId = 0;

  interface LandPoint {
    lat: number;
    lon: number;
    seed: number;
  }

  const DIPLOMATIC_NODES: ReadonlyArray<{ lat: number; lon: number }> = [
    { lat: 31.95, lon: 35.93 }, // Amman
    { lat: 46.2, lon: 6.14 },   // Geneva
    { lat: 40.71, lon: -74.0 }, // New York
    { lat: 35.68, lon: 139.69 },// Tokyo
    { lat: -1.29, lon: 36.82 }, // Nairobi
    { lat: 48.86, lon: 2.35 },  // Paris
    { lat: 28.61, lon: 77.21 }, // New Delhi
    { lat: -15.79, lon: -47.88 }// Brasilia
  ];

  const ARC_PAIRS: ReadonlyArray<[number, number]> = [
    [0, 1],
    [0, 2],
    [0, 4],
    [1, 5],
    [1, 6],
    [2, 7],
    [3, 6],
    [4, 7]
  ];

  function buildFallbackLand(): LandPoint[] {
    const samples = generateFibonacciSphereLatLon(4200);
    const out: LandPoint[] = [];
    for (let i = 0; i < samples.length; i++) {
      const { lat, lon } = samples[i];
      const inLand =
        (lon > -130 && lon < -55 && lat > 14 && lat < 68) ||
        (lon > -80 && lon < -35 && lat > -50 && lat < 12) ||
        (lon > -12 && lon < 52 && lat > -34 && lat < 64) ||
        (lon > 52 && lon < 144 && lat > 6 && lat < 68) ||
        (lon > 113 && lon < 153 && lat > -39 && lat < -12);
      if (inLand) {
        out.push({ lat, lon, seed: (i * 0.6180339) % 1 });
      }
    }
    return out;
  }

  function rasterizeTopo(topology: TopoJsonTopology): LandPoint[] {
    const polygons = decodeTopoJsonLandRings(topology);
    const W = 540;
    const H = 270;
    const mc = document.createElement('canvas');
    mc.width = W;
    mc.height = H;
    const mctx = mc.getContext('2d');
    if (!mctx) return buildFallbackLand();

    mctx.fillStyle = '#000';
    mctx.fillRect(0, 0, W, H);
    mctx.fillStyle = '#fff';

    const lonToX = (lon: number) => ((lon + 180) / 360) * W;
    const latToY = (lat: number) => ((90 - lat) / 180) * H;

    for (const poly of polygons) {
      mctx.beginPath();
      for (const ring of poly) {
        if (ring.length < 3) continue;
        const unwrapped: Array<[number, number]> = [[ring[0][0], ring[0][1]]];
        for (let i = 1; i < ring.length; i++) {
          let lon = ring[i][0];
          const prev = unwrapped[i - 1][0];
          while (lon - prev > 180) lon -= 360;
          while (lon - prev < -180) lon += 360;
          unwrapped.push([lon, ring[i][1]]);
        }
        const span = Math.abs(unwrapped[unwrapped.length - 1][0] - unwrapped[0][0]);
        if (span > 200) {
          mctx.moveTo(lonToX(unwrapped[0][0]), latToY(unwrapped[0][1]));
          for (let i = 1; i < unwrapped.length; i++) {
            mctx.lineTo(lonToX(unwrapped[i][0]), latToY(unwrapped[i][1]));
          }
          mctx.lineTo(lonToX(unwrapped[unwrapped.length - 1][0]), H);
          mctx.lineTo(lonToX(unwrapped[0][0]), H);
          mctx.closePath();
        } else {
          for (const shift of [-W, 0, W]) {
            mctx.moveTo(lonToX(unwrapped[0][0]) + shift, latToY(unwrapped[0][1]));
            for (let i = 1; i < unwrapped.length; i++) {
              mctx.lineTo(lonToX(unwrapped[i][0]) + shift, latToY(unwrapped[i][1]));
            }
            mctx.closePath();
          }
        }
      }
      mctx.fill('evenodd');
    }

    const imgData = mctx.getImageData(0, 0, W, H).data;
    const samples = generateFibonacciSphereLatLon(5200);
    const out: LandPoint[] = [];
    for (let i = 0; i < samples.length; i++) {
      const { lat, lon } = samples[i];
      const px = Math.min(W - 1, Math.max(0, Math.floor(((lon + 180) / 360) * W)));
      const py = Math.min(H - 1, Math.max(0, Math.floor(((90 - lat) / 180) * H)));
      if (imgData[(py * W + px) * 4] > 127) {
        out.push({ lat, lon, seed: (i * 0.6180339) % 1 });
      }
    }
    return out.length > 0 ? out : buildFallbackLand();
  }

  let landPoints: LandPoint[] = buildFallbackLand();

  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json')
    .then(res => (res.ok ? res.json() : Promise.reject(new Error('atlas load failed'))))
    .then((topo: TopoJsonTopology) => {
      landPoints = rasterizeTopo(topo);
      drawFrame(performance.now());
    })
    .catch(() => {
      // Fallback already populated
    });

  let rotY = -0.55;
  let tiltX = 0.24;
  let dragging = false;
  let dragPointerId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  let velY = 0;

  let width = 360;
  let height = 360;

  function resizeCanvas() {
    const parent = canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    width = Math.max(220, Math.floor(rect.width));
    height = Math.max(220, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });
  if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(canvas.parentElement);
  }

  canvas.addEventListener('pointerdown', e => {
    dragging = true;
    dragPointerId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    velY = 0;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore capture failure
    }
  });

  canvas.addEventListener('pointermove', e => {
    if (!dragging || e.pointerId !== dragPointerId) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    rotY += dx * 0.0065;
    tiltX = Math.max(-0.55, Math.min(0.65, tiltX + dy * 0.0045));
    velY = dx * 0.0065;
  });

  const endDrag = () => {
    dragging = false;
    dragPointerId = null;
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  function drawFrame(now: number) {
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.37;

    // Subtle atmospheric outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.07, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(186, 177, 160, 0.16)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(79, 154, 87, 0.32)';
    ctx.lineWidth = 1.25;
    ctx.stroke();

    // Longitude meridians
    for (let lon = -180; lon < 180; lon += 30) {
      ctx.beginPath();
      let penDown = false;
      for (let lat = -84; lat <= 84; lat += 6) {
        const pt = projectSpherePoint(lat, lon, rotY, tiltX, radius);
        if (pt.z >= -radius * 0.05) {
          const sx = cx + pt.x;
          const sy = cy - pt.y;
          if (!penDown) {
            ctx.moveTo(sx, sy);
            penDown = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        } else {
          penDown = false;
        }
      }
      ctx.strokeStyle = 'rgba(186, 177, 160, 0.12)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }

    // Latitude parallels (equator accented)
    for (let lat = -60; lat <= 60; lat += 30) {
      ctx.beginPath();
      let penDown = false;
      for (let lon = -180; lon <= 180; lon += 6) {
        const pt = projectSpherePoint(lat, lon, rotY, tiltX, radius);
        if (pt.z >= -radius * 0.05) {
          const sx = cx + pt.x;
          const sy = cy - pt.y;
          if (!penDown) {
            ctx.moveTo(sx, sy);
            penDown = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        } else {
          penDown = false;
        }
      }
      ctx.strokeStyle = lat === 0 ? 'rgba(79, 154, 87, 0.34)' : 'rgba(186, 177, 160, 0.12)';
      ctx.lineWidth = lat === 0 ? 1.15 : 0.8;
      ctx.stroke();
    }

    // Landmass dot matrix (subtle balance behind Statue of Liberty centerpiece)
    for (let i = 0; i < landPoints.length; i++) {
      const lp = landPoints[i];
      const pt = projectSpherePoint(lp.lat, lp.lon, rotY, tiltX, radius);
      const depth = pt.z / radius;
      if (depth < -0.15) continue;
      const sx = cx + pt.x;
      const sy = cy - pt.y;
      const frontFactor = Math.max(0, Math.min(1, (depth + 0.15) / 1.15));
      const isGreen = lp.seed > 0.62;
      const alpha = isGreen ? 0.2 + frontFactor * 0.56 : 0.12 + frontFactor * 0.4;
      ctx.fillStyle = isGreen
        ? `rgba(79, 154, 87, ${alpha.toFixed(3)})`
        : `rgba(237, 230, 214, ${alpha.toFixed(3)})`;
      const dotSize = frontFactor > 0.6 ? 1.85 : 1.3;
      ctx.fillRect(sx - dotSize * 0.5, sy - dotSize * 0.5, dotSize, dotSize);
    }

    // Great-circle diplomatic arcs
    const pulsePhase = (now * 0.00055) % 1;
    for (let aIdx = 0; aIdx < ARC_PAIRS.length; aIdx++) {
      const [ia, ib] = ARC_PAIRS[aIdx];
      const a = DIPLOMATIC_NODES[ia];
      const b = DIPLOMATIC_NODES[ib];
      const pa = projectSpherePoint(a.lat, a.lon, rotY, tiltX, 1);
      const pb = projectSpherePoint(b.lat, b.lon, rotY, tiltX, 1);
      if (pa.z < -0.25 && pb.z < -0.25) continue;

      ctx.beginPath();
      const steps = 22;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const vx = pa.x + (pb.x - pa.x) * u;
        const vy = pa.y + (pb.y - pa.y) * u;
        const vz = pa.z + (pb.z - pa.z) * u;
        const len = Math.hypot(vx, vy, vz) || 1;
        const lift = 1 + Math.sin(u * Math.PI) * 0.16;
        const sx = cx + (vx / len) * radius * lift;
        const sy = cy - (vy / len) * radius * lift;
        if (s === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.strokeStyle = 'rgba(79, 154, 87, 0.48)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      // Highlight moving diplomatic courier pulse along active arcs
      const u = (pulsePhase + aIdx * 0.17) % 1;
      const vx = pa.x + (pb.x - pa.x) * u;
      const vy = pa.y + (pb.y - pa.y) * u;
      const vz = pa.z + (pb.z - pa.z) * u;
      const len = Math.hypot(vx, vy, vz) || 1;
      const lift = 1 + Math.sin(u * Math.PI) * 0.16;
      if (vz / len > -0.1) {
        const sx = cx + (vx / len) * radius * lift;
        const sy = cy - (vy / len) * radius * lift;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.3, 0, Math.PI * 2);
        ctx.fillStyle = '#EDE6D6';
        ctx.fill();
      }
    }

    // Diplomatic city beacons on visible hemisphere
    for (const node of DIPLOMATIC_NODES) {
      const pt = projectSpherePoint(node.lat, node.lon, rotY, tiltX, radius);
      if (pt.z < 0.12 * radius) continue;
      const sx = cx + pt.x;
      const sy = cy - pt.y;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(79, 154, 87, 0.35)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
      ctx.fillStyle = '#EDE6D6';
      ctx.fill();
    }
  }

  let lastFrame = performance.now();
  function tick(now: number) {
    const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
    lastFrame = now;

    if (!paused && !reduceMotionQuery.matches && !dragging) {
      rotY += (0.13 + velY) * dt;
      velY *= Math.exp(-4 * dt);
    }

    drawFrame(now);
    if (!paused && !reduceMotionQuery.matches) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = 0;
    }
  }

  drawFrame(performance.now());
  if (!paused && !reduceMotionQuery.matches) {
    rafId = requestAnimationFrame(tick);
  }

  return {
    setPaused: (nextPaused: boolean) => {
      paused = nextPaused;
      if (!paused && !reduceMotionQuery.matches && !rafId) {
        lastFrame = performance.now();
        rafId = requestAnimationFrame(tick);
      } else if (paused && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
  };
}

function initHeroLetterLift() {
  const heroTitle = document.querySelector('.hero-title') as HTMLElement | null;
  const finePointer = window.matchMedia('(pointer: fine) and (hover: hover)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!heroTitle || !finePointer.matches || reduceMotion.matches) return;

  const clearLift = () => {
    heroTitle.querySelectorAll<HTMLElement>('.hero-char').forEach(ch => {
      ch.style.setProperty('--liftY', '0px');
      ch.classList.remove('is-lifted');
    });
  };

  heroTitle.addEventListener(
    'pointermove',
    e => {
      if (e.pointerType === 'touch' || reduceMotion.matches) return;
      heroTitle.querySelectorAll<HTMLElement>('.hero-char').forEach(ch => {
        const rect = ch.getBoundingClientRect();
        const res = computeHeroLetterLift(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
          e.clientX,
          e.clientY,
          120,
          10,
          false
        );
        ch.style.setProperty('--liftY', `${res.liftY}px`);
        ch.classList.toggle('is-lifted', res.glow > 0.25);
      });
    },
    { passive: true }
  );

  heroTitle.addEventListener('pointerleave', clearLift);
}

function initHeroStatueTilt() {
  const stage = document.getElementById('heroVisual');
  const statue = document.getElementById('heroStatue') as HTMLElement | null;
  const finePointer = window.matchMedia('(pointer: fine) and (hover: hover)');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!stage || !statue) return;

  const resetTilt = () => {
    statue.style.setProperty('--statueTiltX', '0deg');
    statue.style.setProperty('--statueTiltY', '0deg');
  };

  stage.addEventListener(
    'pointermove',
    e => {
      if (!finePointer.matches || reduceMotion.matches || e.pointerType === 'touch') return;
      const rect = stage.getBoundingClientRect();
      const { tiltX, tiltY } = computeStatueTilt(
        e.clientX,
        e.clientY,
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        rect.width / 2,
        rect.height / 2,
        6,
        reduceMotion.matches
      );
      statue.style.setProperty('--statueTiltX', `${tiltX}deg`);
      statue.style.setProperty('--statueTiltY', `${tiltY}deg`);
    },
    { passive: true }
  );

  stage.addEventListener('pointerleave', resetTilt);
}

function initMarquee() {
  const tracks = Array.from(document.querySelectorAll<HTMLElement>('.marquee-track'));
  if (tracks.length === 0) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let offset = 0;
  let last = performance.now();

  function step(now: number) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (reduceMotion.matches || document.documentElement.classList.contains('is-portal-route')) {
      tracks.forEach(tr => {
        tr.style.transform = 'translate3d(0,0,0)';
      });
    } else {
      offset += 14 * dt;
      tracks.forEach(tr => {
        const group = tr.firstElementChild as HTMLElement | null;
        const loopWidth = group ? group.getBoundingClientRect().width : 0;
        if (loopWidth > 0) {
          tr.style.transform = `translate3d(-${(offset % loopWidth).toFixed(2)}px,0,0)`;
        }
      });
    }
    requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function initNavigationAndProgress() {
  const menuBtn = document.getElementById('navMenuBtn') as HTMLButtonElement | null;
  const drawer = document.getElementById('mobileNavDrawer');
  const backdrop = document.getElementById('mobileNavBackdrop');
  const progressBar = document.getElementById('scrollProgress');
  const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.vm-nav-links a[href^="#"]'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const menuLabel = menuBtn?.querySelector<HTMLElement>('.vm-menu-label') ?? null;

  const setDrawerOpen = (open: boolean, options?: { restoreFocus?: boolean }) => {
    if (!menuBtn || !drawer || !backdrop) return;
    const wasOpen = menuBtn.getAttribute('aria-expanded') === 'true';
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
    if (menuLabel) {
      menuLabel.textContent = open ? 'Close' : 'Menu';
    }
    drawer.classList.toggle('is-open', open);
    backdrop.classList.toggle('is-open', open);
    drawer.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('vm-drawer-open', open);
    if (!open && wasOpen && options?.restoreFocus) {
      menuBtn.focus();
    }
  };

  menuBtn?.addEventListener('click', () => {
    const isOpen = menuBtn.getAttribute('aria-expanded') === 'true';
    setDrawerOpen(!isOpen);
  });

  backdrop?.addEventListener('click', () => setDrawerOpen(false, { restoreFocus: true }));
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') setDrawerOpen(false, { restoreFocus: true });
  });
  window.addEventListener(
    'resize',
    () => {
      if (window.innerWidth >= 1024) setDrawerOpen(false);
    },
    { passive: true }
  );

  // Close drawer when navigating via drawer actions (e.g. /login) as well as section anchors
  drawer?.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {
    link.addEventListener('click', () => {
      if (!link.getAttribute('href')?.startsWith('#')) {
        setDrawerOpen(false);
      }
    });
  });

  // Smooth anchor scroll + drawer dismissal
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector<HTMLElement>(href);
      if (!target) return;
      e.preventDefault();
      setDrawerOpen(false);
      target.classList.add('is-visible');
      target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    });
  });

  const sections = navLinks
    .map(link => {
      const href = link.getAttribute('href');
      const sec = href ? document.querySelector<HTMLElement>(href) : null;
      return sec ? { link, sec } : null;
    })
    .filter((entry): entry is { link: HTMLAnchorElement; sec: HTMLElement } => Boolean(entry));

  const syncScroll = () => {
    if (document.documentElement.classList.contains('is-portal-route')) return;
    const progress = computeScrollProgress(
      window.scrollY,
      document.documentElement.scrollHeight,
      window.innerHeight
    );
    if (progressBar) {
      progressBar.style.transform = `scaleX(${progress.toFixed(4)})`;
    }

    const probeY = window.innerHeight * 0.34;
    let active: { link: HTMLAnchorElement; sec: HTMLElement } | null = null;
    if (window.scrollY > 90) {
      for (const entry of sections) {
        if (entry.sec.hidden) continue;
        const rect = entry.sec.getBoundingClientRect();
        if (rect.top <= probeY && rect.bottom > 80) {
          active = entry;
        }
      }
    }
    sections.forEach(entry => {
      const isActive = entry === active;
      entry.link.classList.toggle('is-active', isActive);
      if (isActive) entry.link.setAttribute('aria-current', 'location');
      else entry.link.removeAttribute('aria-current');
    });
  };

  window.addEventListener('scroll', syncScroll, { passive: true });
  window.addEventListener('resize', syncScroll, { passive: true });
  syncScroll();
}

function renderHero(hero?: HeroContent) {
  if (!hero) return;
  const titleEl = document.querySelector('.hero-title');
  if (titleEl && hero.title) {
    titleEl.setAttribute('aria-label', hero.title);
    titleEl.textContent = '';
    const words = String(hero.title).trim().split(/\s+/);
    words.forEach((word, wi) => {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'hero-word';
      wordSpan.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < word.length; i++) {
        const chSpan = document.createElement('span');
        chSpan.className = 'hero-char';
        chSpan.textContent = word[i];
        wordSpan.appendChild(chSpan);
      }
      titleEl.appendChild(wordSpan);
      if (wi < words.length - 1) titleEl.appendChild(document.createTextNode(' '));
    });
  }
  const tagEl = document.querySelector('.hero-tag');
  if (tagEl && hero.tagline) {
    tagEl.textContent = hero.tagline;
  }
}

function renderAbout(about?: AboutContent) {
  const host = document.getElementById('aboutProse');
  if (!host || !about || !Array.isArray(about.paragraphs) || about.paragraphs.length === 0) return;
  host.textContent = '';
  about.paragraphs.forEach((text, idx) => {
    const p = document.createElement('p');
    if (idx === 0) p.className = 'dropcap';
    p.textContent = text;
    host.appendChild(p);
  });
}

function renderSecretariat(cards?: TeamCardRow[]) {
  const grid = document.getElementById('secretariatGrid');
  if (!grid || !Array.isArray(cards) || cards.length === 0) return;
  grid.textContent = '';

  cards.forEach((card, idx) => {
    const article = document.createElement('article');
    article.className = 'secretariat-card';

    const fig = document.createElement('figure');
    fig.className = 'secretariat-photo-frame';

    const img = document.createElement('img');
    const cleanUrl = safeHref(card.photo_url);
    if (cleanUrl) {
      img.src = cleanUrl;
    } else {
      fig.classList.add('is-missing');
    }
    img.alt = card.full_name || 'Secretariat member';
    img.loading = 'lazy';
    img.addEventListener('error', () => fig.classList.add('is-missing'));

    const fallback = document.createElement('span');
    fallback.className = 'secretariat-photo-fallback';
    fallback.textContent = card.full_name || 'Secretariat Portrait';

    fig.appendChild(img);
    fig.appendChild(fallback);

    const meta = document.createElement('div');
    meta.className = 'secretariat-meta';

    const ordinal = document.createElement('span');
    ordinal.className = 'secretariat-ordinal';
    ordinal.textContent = String(idx + 1).padStart(2, '0');

    const name = document.createElement('h3');
    name.className = 'secretariat-name';
    name.textContent = card.full_name || '';

    const role = document.createElement('p');
    role.className = 'secretariat-role';
    role.textContent = card.title || '';

    meta.appendChild(ordinal);
    meta.appendChild(name);
    meta.appendChild(role);

    article.appendChild(fig);
    article.appendChild(meta);
    grid.appendChild(article);
  });
}

function renderConferenceInfo(
  registerSec?: TbaSectionContent<RegisterItem>,
  settings?: SiteSettings
) {
  const grid = document.getElementById('conferenceInfoGrid');
  if (!grid) return;

  const hasPublishedInfo =
    registerSec &&
    registerSec.showTba === false &&
    Array.isArray(registerSec.items) &&
    registerSec.items.length > 0;

  grid.textContent = '';

  const appendCard = (label: string, title: string, body: string, metaText: string, linkUrl?: string, linkLabel?: string) => {
    const card = document.createElement('article');
    card.className = 'vm-info-card';

    const top = document.createElement('div');
    const lbl = document.createElement('p');
    lbl.className = 'vm-info-label';
    lbl.textContent = label;

    const h3 = document.createElement('h3');
    h3.className = 'vm-info-title';
    h3.textContent = title;

    const p = document.createElement('p');
    p.className = 'vm-info-body';
    p.textContent = body;

    top.appendChild(lbl);
    top.appendChild(h3);
    top.appendChild(p);

    const bottom = document.createElement('div');
    bottom.className = 'vm-info-meta';
    const cleanLink = safeHref(linkUrl);
    if (cleanLink) {
      const a = document.createElement('a');
      a.className = 'vm-info-link';
      a.href = cleanLink;
      if (cleanLink.startsWith('http')) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      }
      a.textContent = (linkLabel || 'Open link').trim();
      bottom.appendChild(a);
    } else {
      bottom.textContent = metaText;
    }

    card.appendChild(top);
    card.appendChild(bottom);
    grid.appendChild(card);
  };

  // Card 1: Format & Procedure
  appendCard(
    'Protocol 01',
    'Parliamentary Format & Debate',
    'Delegates convene across structured General Assemblies, specialized bodies, and fast-moving crisis councils guided by Veritas Rules of Procedure, formal position papers, and collaborative resolution drafting.',
    'In-Person Diplomatic Sessions'
  );

  // Card 2: Published registration / venue dispatch or official TBA bulletin
  if (hasPublishedInfo && registerSec) {
    registerSec.items.forEach((item, idx) => {
      appendCard(
        `Dispatch ${String(idx + 2).padStart(2, '0')}`,
        item.title || 'Conference Bulletin',
        item.details || '',
        'Official Conference Notice',
        item.linkUrl,
        item.linkLabel
      );
    });
  } else {
    const subtitle =
      registerSec && registerSec.tbaSubtitle && registerSec.tbaSubtitle !== 'To be announced.'
        ? registerSec.tbaSubtitle
        : 'Official conference dates, host venue rooms, and delegate handbook materials will be published prior to opening ceremonies.';
    appendCard(
      'Logistics 02',
      'Dates, Venue & Delegate Registration',
      subtitle,
      'Venue & Dates: To Be Announced'
    );
  }

  // Card 3: Secretariat correspondence & portal
  const email = settings?.contact_email?.trim() || '';
  const emailCard = document.createElement('article');
  emailCard.className = 'vm-info-card';
  const cTop = document.createElement('div');
  const cLbl = document.createElement('p');
  cLbl.className = 'vm-info-label';
  cLbl.textContent = 'Correspondence';
  const cTitle = document.createElement('h3');
  cTitle.className = 'vm-info-title';
  cTitle.textContent = 'Secretariat Inquiries & Team Portal';
  const cBody = document.createElement('p');
  cBody.className = 'vm-info-body';
  cBody.textContent = email
    ? `For delegation inquiries, institutional partnerships, or advisor coordination, reach the Secretariat directly at ${email}.`
    : 'Department leads and Executive Board members may sign in to manage conference operations, schedules, and applications.';
  cTop.appendChild(cLbl);
  cTop.appendChild(cTitle);
  cTop.appendChild(cBody);

  const cBottom = document.createElement('div');
  cBottom.className = 'vm-info-meta';
  if (email) {
    const mailLink = document.createElement('a');
    mailLink.className = 'vm-info-link';
    mailLink.href = `mailto:${email}`;
    mailLink.textContent = email;
    cBottom.appendChild(mailLink);
  } else {
    const portalLink = document.createElement('a');
    portalLink.className = 'vm-info-link';
    portalLink.href = '/login';
    portalLink.textContent = 'Access Team Portal';
    cBottom.appendChild(portalLink);
  }
  emailCard.appendChild(cTop);
  emailCard.appendChild(cBottom);
  grid.appendChild(emailCard);
}

function renderCommittees(
  committees?: CommitteeRecord[],
  fallbackSec?: TbaSectionContent<CommitteeItem>
) {
  const body = document.getElementById('committeesBody');
  if (!body) return;
  body.textContent = '';

  const enabled = Array.isArray(committees)
    ? committees
        .filter(item => item && item.enabled !== false && String(item.name || '').trim().length > 0)
        .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0))
    : null;

  if (enabled !== null) {
    if (enabled.length === 0) {
      body.appendChild(
        createTbaStage(
          fallbackSec?.tbaSubtitle || 'Committees & agendas to be announced.',
          'Councils, specialized agencies, and study guides are finalized by the Executive Board and published here once confirmed.'
        )
      );
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'vm-committees-grid';

    enabled.forEach((item, idx) => {
      const card = document.createElement('article');
      card.className = 'vm-committee-card';

      const top = document.createElement('div');
      top.className = 'vm-committee-top';

      const num = document.createElement('span');
      num.className = 'vm-committee-index';
      num.textContent = `Council ${String(idx + 1).padStart(2, '0')}`;
      top.appendChild(num);

      const safeLogo = safeHref(item.image_url);
      if (safeLogo) {
        const img = document.createElement('img');
        img.className = 'committee-logo';
        img.src = safeLogo;
        img.alt = `${item.name || 'Committee'} emblem`;
        img.loading = 'lazy';
        top.appendChild(img);
      }

      const h3 = document.createElement('h3');
      h3.className = 'vm-committee-title';
      h3.textContent = item.name || '';

      card.appendChild(top);
      card.appendChild(h3);

      const metaParts = [item.abbreviation, item.chamber, item.difficulty]
        .map(v => (typeof v === 'string' ? v.trim() : ''))
        .filter(Boolean);
      if (metaParts.length > 0) {
        const meta = document.createElement('p');
        meta.className = 'vm-committee-meta';
        meta.textContent = metaParts.join(' · ');
        card.appendChild(meta);
      }

      const desc = String(item.description || '').trim();
      if (desc) {
        const p = document.createElement('p');
        p.className = 'vm-committee-body';
        p.textContent = desc;
        card.appendChild(p);
      }

      if (Array.isArray(item.topics) && item.topics.length > 0) {
        const topicsLine = document.createElement('p');
        topicsLine.className = 'vm-committee-topics';
        topicsLine.textContent = `Agenda: ${item.topics.join(' · ')}`;
        card.appendChild(topicsLine);
      }

      grid.appendChild(card);
    });

    body.appendChild(grid);
    return;
  }

  // Fallback to legacy site_content.committees if committees table hasn't responded
  if (
    fallbackSec &&
    fallbackSec.showTba === false &&
    Array.isArray(fallbackSec.items) &&
    fallbackSec.items.length > 0
  ) {
    const grid = document.createElement('div');
    grid.className = 'vm-committees-grid';

    fallbackSec.items.forEach((item, idx) => {
      const card = document.createElement('article');
      card.className = 'vm-committee-card';

      const top = document.createElement('div');
      top.className = 'vm-committee-top';
      const num = document.createElement('span');
      num.className = 'vm-committee-index';
      num.textContent = `Council ${String(idx + 1).padStart(2, '0')}`;
      top.appendChild(num);

      const h3 = document.createElement('h3');
      h3.className = 'vm-committee-title';
      h3.textContent = item.name || '';

      card.appendChild(top);
      card.appendChild(h3);

      if (item.details) {
        const p = document.createElement('p');
        p.className = 'vm-committee-body';
        p.textContent = item.details;
        card.appendChild(p);
      }
      grid.appendChild(card);
    });

    body.appendChild(grid);
    return;
  }

  body.appendChild(
    createTbaStage(
      fallbackSec?.tbaSubtitle || 'To be announced.',
      'Councils, specialized agencies, and study guides are curated by the Secretariat and will appear here upon release.'
    )
  );
}

function renderSchedule(
  secData?: TbaSectionContent<ScheduleItem>,
  scheduleDays?: PublicScheduleDayRow[],
  scheduleSessions?: PublicScheduleSessionRow[]
) {
  const body = document.getElementById('scheduleBody');
  if (!body) return;

  const hasTableRows =
    Array.isArray(scheduleSessions) && scheduleSessions.some(s => String(s.title || '').trim().length > 0);

  if (hasTableRows && scheduleSessions) {
    body.textContent = '';
    const dayMap = new Map<string, PublicScheduleDayRow>();
    if (Array.isArray(scheduleDays)) {
      scheduleDays.forEach(d => {
        if (d && d.id) dayMap.set(d.id, d);
      });
    }

    const activeDayIds = Array.from(
      new Set(
        scheduleSessions
          .filter(s => String(s.title || '').trim().length > 0 && s.day_id && dayMap.has(s.day_id))
          .map(s => s.day_id as string)
      )
    );

    let selectedDayId = 'all';
    const list = document.createElement('div');
    list.className = 'vm-schedule-list';

    const renderRows = () => {
      list.textContent = '';
      scheduleSessions.forEach(item => {
        if (!String(item.title || '').trim()) return;
        if (selectedDayId !== 'all' && item.day_id !== selectedDayId) return;

        const row = document.createElement('article');
        row.className = 'vm-schedule-row';

        const day = item.day_id ? dayMap.get(item.day_id) : undefined;
        const dayLabel = day ? [day.title, day.date_label].filter(Boolean).join(' · ') : '';
        const timeRange = [item.start_time, item.end_time].filter(Boolean).join(' – ');
        const timeLabel = [dayLabel, timeRange].filter(Boolean).join(' · ') || 'Session';

        const time = document.createElement('p');
        time.className = 'vm-schedule-time';
        time.textContent = timeLabel;

        const copy = document.createElement('div');
        const title = document.createElement('h3');
        title.className = 'vm-schedule-title';
        title.textContent = item.title || '';
        copy.appendChild(title);

        const detailParts = [item.location, item.description]
          .map(v => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean);
        if (detailParts.length > 0) {
          const details = document.createElement('p');
          details.className = 'vm-schedule-details';
          details.textContent = detailParts.join(' — ');
          copy.appendChild(details);
        }

        row.appendChild(time);
        row.appendChild(copy);
        list.appendChild(row);
      });
    };

    if (activeDayIds.length > 1) {
      const tabBar = document.createElement('div');
      tabBar.className = 'vm-schedule-tabs';
      tabBar.setAttribute('role', 'tablist');
      tabBar.setAttribute('aria-label', 'Filter schedule by conference day');

      const tabOptions: Array<{ id: string; label: string }> = [
        { id: 'all', label: 'All Days' },
        ...activeDayIds.map(id => {
          const d = dayMap.get(id)!;
          return {
            id,
            label: [d.title || `Day ${d.day_number ?? ''}`.trim(), d.date_label].filter(Boolean).join(' · ')
          };
        })
      ];

      const buttons: HTMLButtonElement[] = [];
      tabOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'vm-schedule-tab' + (opt.id === selectedDayId ? ' is-active' : '');
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', String(opt.id === selectedDayId));
        btn.textContent = opt.label;
        btn.addEventListener('click', () => {
          selectedDayId = opt.id;
          buttons.forEach(b => {
            const active = b === btn;
            b.classList.toggle('is-active', active);
            b.setAttribute('aria-selected', String(active));
          });
          renderRows();
        });
        buttons.push(btn);
        tabBar.appendChild(btn);
      });

      body.appendChild(tabBar);
    }

    renderRows();
    body.appendChild(list);
    return;
  }

  if (!secData) return;
  body.textContent = '';

  const showTba = secData.showTba !== false || !Array.isArray(secData.items) || secData.items.length === 0;
  if (showTba) {
    body.appendChild(
      createTbaStage(
        secData.tbaSubtitle || 'To be announced.',
        'The conference timetable—covering delegate check-in, Opening Ceremony, committee blocks, and Closing Plenary—will be released ahead of the session.'
      )
    );
    return;
  }

  const list = document.createElement('div');
  list.className = 'vm-schedule-list';

  secData.items.forEach(item => {
    const row = document.createElement('article');
    row.className = 'vm-schedule-row';

    const time = document.createElement('p');
    time.className = 'vm-schedule-time';
    time.textContent = item.dateTime || 'Session';

    const copy = document.createElement('div');
    const title = document.createElement('h3');
    title.className = 'vm-schedule-title';
    title.textContent = item.title || '';
    copy.appendChild(title);

    if (item.details) {
      const details = document.createElement('p');
      details.className = 'vm-schedule-details';
      details.textContent = item.details;
      copy.appendChild(details);
    }

    row.appendChild(time);
    row.appendChild(copy);
    list.appendChild(row);
  });

  body.appendChild(list);
}

function renderFaq(secData?: TbaSectionContent<FaqItem>, faqRows?: PublicFaqRow[]) {
  const body = document.getElementById('faqBody');
  if (!body) return;

  const normalizedRows: FaqItem[] = Array.isArray(faqRows)
    ? faqRows
        .map(row => ({
          question: String(row.question || '').trim(),
          answer: String(row.answer || '').trim()
        }))
        .filter(item => item.question.length > 0 && item.answer.length > 0)
    : [];

  const items: FaqItem[] =
    normalizedRows.length > 0
      ? normalizedRows
      : secData && secData.showTba === false && Array.isArray(secData.items)
        ? secData.items.filter(it => (it.question || '').trim().length > 0)
        : [];

  body.textContent = '';

  if (items.length === 0) {
    body.appendChild(
      createTbaStage(
        secData?.tbaSubtitle || 'To be announced.',
        'Frequently asked questions covering delegate dress code, position paper deadlines, and conference procedures will be published shortly.'
      )
    );
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'vm-faq-grid';

  items.forEach((item, idx) => {
    const card = document.createElement('article');
    card.className = 'vm-faq-item' + (idx === 0 ? ' is-open' : '');

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'vm-faq-trigger';
    trigger.setAttribute('aria-expanded', idx === 0 ? 'true' : 'false');

    const q = document.createElement('span');
    q.className = 'vm-faq-q';
    q.textContent = item.question || '';

    const icon = document.createElement('span');
    icon.className = 'vm-faq-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = idx === 0 ? '−' : '+';

    trigger.appendChild(q);
    trigger.appendChild(icon);

    const panel = document.createElement('div');
    panel.className = 'vm-faq-panel';
    const inner = document.createElement('div');
    inner.className = 'vm-faq-panel-inner';
    const a = document.createElement('p');
    a.className = 'vm-faq-a';
    a.textContent = item.answer || '';
    inner.appendChild(a);
    panel.appendChild(inner);

    trigger.addEventListener('click', () => {
      const nextOpen = !card.classList.contains('is-open');
      card.classList.toggle('is-open', nextOpen);
      trigger.setAttribute('aria-expanded', String(nextOpen));
      icon.textContent = nextOpen ? '−' : '+';
    });

    card.appendChild(trigger);
    card.appendChild(panel);
    grid.appendChild(card);
  });

  body.appendChild(grid);
}

let closeEbDropdownFn: ((restoreFocus?: boolean) => void) | null = null;

function initEbDropdown() {
  const container = document.getElementById('ebDeptDropdown');
  const btn = document.getElementById('ebDropdownBtn') as HTMLButtonElement | null;
  const menu = document.getElementById('ebDropdownMenu');
  if (!container || !btn || !menu) return;

  const setOpen = (open: boolean, restoreFocus = false) => {
    btn.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    container.classList.toggle('is-open', open);
    if (!open && restoreFocus) {
      btn.focus();
    }
  };
  closeEbDropdownFn = (restoreFocus = false) => setOpen(false, restoreFocus);

  btn.addEventListener('click', () => {
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    setOpen(!isOpen);
    if (!isOpen) {
      const firstItem = menu.querySelector<HTMLButtonElement>('button[role="menuitem"]');
      firstItem?.focus();
    }
  });

  btn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      if (btn.getAttribute('aria-expanded') !== 'true') {
        e.preventDefault();
        setOpen(true);
        menu.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus();
      }
    }
  });

  menu.addEventListener('keydown', e => {
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'));
    if (items.length === 0) return;
    const currentIdx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false, true);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(currentIdx + 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(currentIdx - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    }
  });

  document.addEventListener('click', e => {
    if (!container.contains(e.target as Node)) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      setOpen(false, true);
    }
  });
}

function renderExecutiveBoard(departments?: EbDepartmentRecord[], members?: EbMemberRecord[]) {
  const host = document.getElementById('ebDirectory');
  const dropdownMenu = document.getElementById('ebDropdownMenu');
  if (!host) return;
  const deptList = Array.isArray(departments) && departments.length > 0 ? departments : DEFAULT_EB_DEPARTMENTS;
  const memberList = Array.isArray(members) && members.length > 0 ? members : DEFAULT_EB_MEMBERS;
  const groups = groupEbByDepartment(deptList, memberList, { includeEmpty: false });
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  host.textContent = '';
  if (dropdownMenu) {
    dropdownMenu.textContent = '';
  }

  groups.forEach((group, idx) => {
    const deptId = `eb-dept-${idx}`;
    const deptEl = document.createElement('section');
    deptEl.id = deptId;
    deptEl.className = 'eb-dept' + (idx === 0 ? ' eb-dept--lead' : '');
    deptEl.setAttribute('aria-label', group.department.name);

    const headEl = document.createElement('div');
    headEl.className = 'eb-dept-head';

    const titleEl = document.createElement('h3');
    titleEl.className = 'eb-dept-title';
    titleEl.textContent = group.department.name;

    headEl.appendChild(titleEl);
    deptEl.appendChild(headEl);

    const listEl = document.createElement('ul');
    listEl.className = 'eb-member-list';

    group.members.forEach(member => {
      const li = document.createElement('li');
      li.className = 'eb-member-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'eb-member-name';
      nameSpan.textContent = member.full_name;

      const roleSpan = document.createElement('span');
      roleSpan.className = 'eb-member-role';
      roleSpan.textContent = member.role;

      li.appendChild(nameSpan);
      li.appendChild(roleSpan);
      listEl.appendChild(li);
    });

    deptEl.appendChild(listEl);
    host.appendChild(deptEl);

    if (dropdownMenu) {
      const menuItemLi = document.createElement('li');
      menuItemLi.setAttribute('role', 'none');

      const menuBtn = document.createElement('button');
      menuBtn.type = 'button';
      menuBtn.setAttribute('role', 'menuitem');
      menuBtn.className = 'vm-dept-dropdown-item';

      const itemName = document.createElement('span');
      itemName.textContent = group.department.name;

      const itemCount = document.createElement('span');
      itemCount.className = 'vm-dept-dropdown-count';
      itemCount.textContent = String(group.members.length);

      menuBtn.appendChild(itemName);
      menuBtn.appendChild(itemCount);

      menuBtn.addEventListener('click', () => {
        closeEbDropdownFn?.(false);
        const ebSection = document.getElementById('executive-board');
        ebSection?.classList.add('is-visible');
        deptEl.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
      });

      menuItemLi.appendChild(menuBtn);
      dropdownMenu.appendChild(menuItemLi);
    }
  });
}

function renderApplications(rawSettings?: ApplicationSettings) {
  const applySection = document.getElementById('apply');
  const tracksHost = document.getElementById('applyTracks');
  const descEl = document.getElementById('applyDescription');
  const navApplyLinks = Array.from(document.querySelectorAll<HTMLElement>('a[href="#apply"]'));

  if (!applySection || !tracksHost) return;
  const settings = normalizeApplicationSettings(rawSettings ?? DEFAULT_APPLICATION_SETTINGS);

  const tracks: Array<{
    key: 'volunteer' | 'security';
    title: string;
    note: string;
    href: string;
    open: boolean;
    buttonText: string;
  }> = [];

  if (settings.volunteer.visible) {
    tracks.push({
      key: 'volunteer',
      title: 'Volunteer Applications',
      note: 'Join the operations, runner, and committee support teams keeping every council session seamless.',
      href: '/apply?track=volunteers',
      open: settings.volunteer.open,
      buttonText: settings.volunteer.button_text
    });
  }

  if (settings.security.visible) {
    tracks.push({
      key: 'security',
      title: 'Security Applications',
      note: 'Uphold venue access standards, delegate coordination, and calm conference logistics across sessions.',
      href: '/apply?track=security',
      open: settings.security.open,
      buttonText: settings.security.button_text
    });
  }

  const noneVisible = tracks.length === 0;
  applySection.hidden = noneVisible;
  navApplyLinks.forEach(link => {
    link.hidden = noneVisible;
  });
  if (noneVisible) return;

  if (descEl && settings.description.trim()) {
    descEl.textContent = settings.description.trim();
  }

  tracksHost.className = tracks.length === 1 ? 'vm-apply-grid vm-apply-grid--single' : 'vm-apply-grid';
  tracksHost.textContent = '';

  tracks.forEach(track => {
    const statusLabel = formatTrackStatusLabel(track.open);
    const card = document.createElement('article');
    card.className = `vm-apply-card ${track.open ? 'is-open' : 'is-closed'}`;

    const topBlock = document.createElement('div');
    const headerRow = document.createElement('div');
    headerRow.className = 'vm-apply-card-top';

    const title = document.createElement('h3');
    title.className = 'vm-apply-track-name';
    title.textContent = track.title;

    const status = document.createElement('span');
    status.className = `vm-apply-status ${track.open ? 'is-open' : 'is-closed'}`;
    status.textContent = `Status: ${statusLabel}`;

    headerRow.appendChild(title);
    headerRow.appendChild(status);

    const note = document.createElement('p');
    note.className = 'vm-apply-card-note';
    note.textContent = track.note;

    topBlock.appendChild(headerRow);
    topBlock.appendChild(note);

    const actions = document.createElement('div');
    actions.className = 'vm-apply-card-actions';

    if (track.open) {
      const link = document.createElement('a');
      link.className = 'vm-btn-primary';
      link.href = track.href;
      link.textContent = track.buttonText;
      actions.appendChild(link);
    } else {
      const closedBtn = document.createElement('button');
      closedBtn.type = 'button';
      closedBtn.className = 'vm-btn-disabled';
      closedBtn.disabled = true;
      closedBtn.textContent = `${track.buttonText} (${statusLabel})`;
      actions.appendChild(closedBtn);
    }

    card.appendChild(topBlock);
    card.appendChild(actions);
    tracksHost.appendChild(card);
  });
}

function renderSiteSettings(settings?: SiteSettings, hero?: HeroContent) {
  if (!settings) return;
  if (settings.site_name) {
    document.title = settings.site_name;
    const navBrand = document.querySelector('.vm-brand-text');
    if (navBrand) navBrand.textContent = settings.site_name;
    const footerBrand = document.querySelector('.footer-brand h2');
    if (footerBrand) footerBrand.textContent = settings.site_name;
    const wordmark = document.querySelector('.footer-wordmark');
    if (wordmark) wordmark.textContent = settings.site_name.toUpperCase();
  }
  const footerTagline = document.querySelector('.vm-footer-tagline');
  if (footerTagline && hero?.tagline) {
    footerTagline.textContent = hero.tagline;
  }
  const footerContact = document.getElementById('footerContactLink') as HTMLAnchorElement | null;
  if (footerContact) {
    const email = settings.contact_email?.trim() || '';
    if (email) {
      footerContact.href = `mailto:${email}`;
      footerContact.textContent = email;
      footerContact.hidden = false;
    } else {
      footerContact.hidden = true;
    }
  }
}

function initSectionReveal() {
  const targets = Array.from(document.querySelectorAll<HTMLElement>('.vm-reveal'));
  if (targets.length === 0) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches || typeof IntersectionObserver === 'undefined') {
    targets.forEach(el => el.classList.add('is-visible'));
    return;
  }

  document.documentElement.classList.add('vm-anim-ready');

  const revealVisible = () => {
    const vh = window.innerHeight || 800;
    targets.forEach(el => {
      if (el.classList.contains('is-visible')) return;
      const rect = el.getBoundingClientRect();
      if (rect.top < vh * 0.96 && rect.bottom > -40) {
        el.classList.add('is-visible');
      }
    });
  };

  const io = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    },
    { rootMargin: '0px 0px -4% 0px', threshold: 0.01 }
  );

  targets.forEach(el => io.observe(el));
  window.addEventListener('scroll', revealVisible, { passive: true });
  window.addEventListener('hashchange', revealVisible);
  revealVisible();
}

export function initPublicSite() {
  const globeCtrl = initHeroGlobe();
  initHeroStatueTilt();
  initHeroLetterLift();
  initMarquee();
  initNavigationAndProgress();
  initEbDropdown();
  initSectionReveal();

  // Render default EB & Application cards immediately before network response resolves
  renderExecutiveBoard(DEFAULT_EB_DEPARTMENTS, DEFAULT_EB_MEMBERS);
  renderApplications(DEFAULT_APPLICATION_SETTINGS);

  window.__veritasApplyPublicData = (rawPayload: unknown) => {
    const payload = (rawPayload || {}) as PublicSitePayload;
    const content = payload.content;
    if (content) {
      renderHero(content.hero);
      renderAbout(content.about);
      renderConferenceInfo(content.register, content.settings);
      if (!Array.isArray(payload.committees)) {
        renderCommittees(undefined, content.committees);
      }
      renderSchedule(content.schedule, payload.scheduleDays, payload.scheduleSessions);
      renderFaq(content.faq, payload.faqs);
      if (content.application_settings) {
        renderApplications(content.application_settings);
      }
      renderSiteSettings(content.settings, content.hero);
    } else {
      if (Array.isArray(payload.scheduleDays) || Array.isArray(payload.scheduleSessions)) {
        renderSchedule(undefined, payload.scheduleDays, payload.scheduleSessions);
      }
      if (Array.isArray(payload.faqs)) {
        renderFaq(undefined, payload.faqs);
      }
    }
    if (Array.isArray(payload.committees)) {
      renderCommittees(payload.committees, content?.committees);
    }
    if (Array.isArray(payload.ebDepartments) && Array.isArray(payload.ebMembers)) {
      renderExecutiveBoard(payload.ebDepartments, payload.ebMembers);
    }
    if (payload.teamCards) {
      renderSecretariat(payload.teamCards);
    }
  };

  window.__veritasSetPortalMode = (isPortal: boolean) => {
    document.documentElement.classList.toggle('is-portal-route', isPortal);
    globeCtrl.setPaused(isPortal);
  };
}

initPublicSite();
