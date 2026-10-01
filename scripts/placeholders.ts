/**
 * Designed SVG placeholders, one per image slot, so the site looks finished without stock photos.
 * Deterministic per slot name. Rasterised to WebP by fetch-images.ts.
 */
type Rng = { next: () => number; int: (a: number, b: number) => number; pick: <T>(a: readonly T[]) => T };

export function rngFor(key: string): Rng {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 5; i++) next(); // decorrelate nearby seeds
  return {
    next,
    int: (x, y) => Math.floor(next() * (y - x + 1)) + x,
    pick: (arr) => arr[Math.floor(next() * arr.length)]!,
  };
}

const P = {
  damson: ["#1c0b1a", "#2a1227", "#3d1d38", "#52284b", "#6b3a62", "#8d5a83", "#c9a9c1"],
  kiln: ["#6f2f1b", "#8f3f26", "#b4583a", "#c96f4f", "#d98b6c", "#ebb59c"],
  gold: ["#9a6408", "#c88a17", "#e3a72f", "#f1cf82", "#fbefd2"],
  neutral: ["#231a21", "#66555f", "#b5a89c", "#e7ddd0", "#f4ece0", "#fbf7f0"],
  green: ["#1f3d2c", "#2f6b47", "#4f8a63", "#86b393"],
};

const grain = (id: string, opacity = 0.18) =>
  `<filter id="${id}"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 ${opacity}"/></feComponentTransfer></filter>`;

function wrap(w: number, h: number, defs: string, body: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${defs}${grain("g")}</defs>${body}<rect width="100%" height="100%" filter="url(#g)"/></svg>`;
}

function arches(w: number, h: number, r: Rng) {
  if (r.next() > 0.55) return doorway(w, h, r);
  const warm = r.next() > 0.5;
  const wall = warm ? r.pick(P.kiln.slice(2, 5)) : r.pick(["#d9c7b1", "#e2cdb4", "#cdb49a"]);
  const shadow = warm ? P.kiln[0] : "#8a6f5c";
  const n = r.int(3, 6);
  const aw = w / (n + 0.6);
  const top = h * (0.18 + r.next() * 0.1);
  let a = "";
  for (let i = 0; i < n; i++) {
    const x = aw * 0.3 + i * aw + aw * 0.12;
    const ww = aw * 0.76;
    const y = top + ww / 2;
    a += `<path d="M${x} ${h} V${y} A${ww / 2} ${ww / 2} 0 0 1 ${x + ww} ${y} V${h} Z" fill="url(#inside)"/>`;
    a += `<path d="M${x + ww * 0.62} ${h} V${y + ww * 0.1} A${ww / 2} ${ww / 2} 0 0 0 ${x + ww * 0.2} ${y - ww * 0.25}" fill="none" stroke="${shadow}" stroke-opacity="0.25" stroke-width="${ww * 0.06}"/>`;
  }
  const light = `<polygon points="${w * 0.15},${h} ${w * 0.55},${h * 0.55} ${w},${h * 0.62} ${w},${h}" fill="${P.gold[3]}" opacity="0.28"/>`;
  return wrap(
    w,
    h,
    `<linearGradient id="inside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.damson[2]}"/><stop offset="1" stop-color="${P.damson[0]}"/></linearGradient><linearGradient id="wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${wall}"/><stop offset="1" stop-color="${shadow}" stop-opacity="0.9"/></linearGradient>`,
    `<rect width="${w}" height="${h}" fill="url(#wall)"/>${a}${light}<rect y="${h * 0.93}" width="${w}" height="${h * 0.07}" fill="${shadow}" opacity="0.45"/>`,
  );
}

/** A single great arch framing a view of the hills. */
function doorway(w: number, h: number, r: Rng) {
  const view = landscapeBody(w, h, r);
  const wall = r.pick([P.neutral[4], "#e2cdb4", P.kiln[5], "#efe3ec"]);
  const aw = w * (0.38 + r.next() * 0.18);
  const x = w * (0.2 + r.next() * 0.6) - aw / 2;
  const y = h * 0.22 + aw / 2;
  const hole = `M${x} ${h} V${y} A${aw / 2} ${aw / 2} 0 0 1 ${x + aw} ${y} V${h} Z`;
  return wrap(
    w,
    h,
    `<clipPath id="door"><path d="${hole}"/></clipPath>${view.defs}`,
    `<rect width="${w}" height="${h}" fill="${wall}"/><g clip-path="url(#door)">${view.body}</g><path d="${hole}" fill="none" stroke="${P.kiln[1]}" stroke-width="${w * 0.012}"/><path d="M${x - w * 0.02} ${h} V${y} A${aw / 2 + w * 0.02} ${aw / 2 + w * 0.02} 0 0 1 ${x + aw + w * 0.02} ${y} V${h}" fill="none" stroke="${P.kiln[3]}" stroke-opacity="0.5" stroke-width="${w * 0.004}"/><polygon points="${x + aw},${h} ${x + aw * 1.6},${h} ${x + aw * 0.9},${h * 0.8}" fill="${P.gold[3]}" opacity="0.35"/>`,
  );
}

function landscape(w: number, h: number, r: Rng) {
  const v = landscapeBody(w, h, r);
  return wrap(w, h, v.defs, v.body);
}

function landscapeBody(w: number, h: number, r: Rng) {
  const dusk = r.next() > 0.5;
  const skyTop = dusk ? P.damson[3] : "#f3d9a4";
  const skyBot = dusk ? P.kiln[4] : P.neutral[5];
  const sunY = h * (0.35 + r.next() * 0.15);
  const sunX = w * (0.2 + r.next() * 0.6);
  let hills = "";
  const layers = 4;
  for (let l = 0; l < layers; l++) {
    const base = h * (0.5 + l * 0.12);
    const amp = h * (0.08 - l * 0.012);
    let d = `M0 ${h} L0 ${base}`;
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const x = (w / steps) * i;
      const cx = x - w / steps / 2;
      d += ` Q${cx} ${base - amp * (0.4 + r.next())} ${x} ${base + (r.next() - 0.5) * amp}`;
    }
    d += ` L${w} ${h} Z`;
    const colors = dusk
      ? [P.damson[4], P.damson[3], P.damson[2], P.damson[1]]
      : [P.green[3], P.green[2], P.green[1], P.green[0]];
    hills += `<path d="${d}" fill="${colors[l]}"/>`;
    if (l === 1)
      hills += `<rect y="${base - amp}" width="${w}" height="${h * 0.06}" fill="#fff" opacity="0.18"/>`;
  }
  return {
    defs: `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyBot}"/></linearGradient><radialGradient id="glow"><stop offset="0" stop-color="${P.gold[3]}" stop-opacity="0.9"/><stop offset="1" stop-color="${P.gold[3]}" stop-opacity="0"/></radialGradient>`,
    body: `<rect width="${w}" height="${h}" fill="url(#sky)"/><circle cx="${sunX}" cy="${sunY}" r="${h * 0.45}" fill="url(#glow)"/><circle cx="${sunX}" cy="${sunY}" r="${h * 0.07}" fill="${P.gold[2]}"/>${hills}`,
  };
}

function interior(w: number, h: number, r: Rng) {
  const wall = r.pick([P.damson[2], P.damson[1], "#3b2a2f", P.kiln[0]]);
  let books = "";
  const shelfH = h / 4;
  for (let s = 0; s < 4; s++) {
    let x = w * 0.04;
    const y = s * shelfH + shelfH * 0.15;
    while (x < w * 0.96) {
      const bw = r.int(Math.round(w * 0.012), Math.round(w * 0.03));
      const bh = shelfH * (0.55 + r.next() * 0.3);
      const c = r.pick([...P.kiln, ...P.gold.slice(0, 3), ...P.damson.slice(3), P.neutral[3], P.green[1]]);
      const lean = r.next() > 0.93 ? `transform="rotate(${r.int(-12, -4)} ${x} ${y + shelfH * 0.85})"` : "";
      books += `<rect x="${x}" y="${y + shelfH * 0.85 - bh}" width="${bw}" height="${bh}" fill="${c}" ${lean}/>`;
      books += `<rect x="${x + bw * 0.2}" y="${y + shelfH * 0.85 - bh * 0.8}" width="${bw * 0.6}" height="${bh * 0.04}" fill="#fff" opacity="0.35"/>`;
      x += bw + (r.next() > 0.85 ? w * 0.03 : 1);
    }
    books += `<rect x="0" y="${y + shelfH * 0.85}" width="${w}" height="${shelfH * 0.07}" fill="${P.neutral[0]}" opacity="0.7"/>`;
  }
  const lx = w * (0.3 + r.next() * 0.4);
  return wrap(
    w,
    h,
    `<radialGradient id="lamp" cx="${lx / w}" cy="0.25" r="0.6"><stop offset="0" stop-color="${P.gold[3]}" stop-opacity="0.55"/><stop offset="1" stop-color="${P.gold[3]}" stop-opacity="0"/></radialGradient>`,
    `<rect width="${w}" height="${h}" fill="${wall}"/>${books}<rect width="${w}" height="${h}" fill="url(#lamp)"/><rect width="${w}" height="${h}" fill="${P.damson[0]}" opacity="0.18"/>`,
  );
}

function detail(w: number, h: number, r: Rng) {
  const bg = r.pick([P.neutral[4], P.gold[4], "#efe3ec", "#f6e2d9"]);
  let shapes = "";
  const n = r.int(4, 7);
  for (let i = 0; i < n; i++) {
    const c = r.pick([...P.kiln.slice(1, 4), ...P.damson.slice(2, 5), P.gold[2], P.gold[1], P.green[1]]);
    const kind = r.int(0, 3);
    const x = r.next() * w;
    const y = r.next() * h;
    const s = (0.15 + r.next() * 0.35) * Math.min(w, h);
    if (kind === 0) shapes += `<circle cx="${x}" cy="${y}" r="${s / 2}" fill="${c}" opacity="0.9"/>`;
    else if (kind === 1)
      shapes += `<rect x="${x - s / 2}" y="${y - s / 3}" width="${s}" height="${s * 0.66}" rx="${s * 0.04}" fill="${c}" transform="rotate(${r.int(-25, 25)} ${x} ${y})"/>`;
    else if (kind === 2)
      shapes += `<path d="M${x - s / 2} ${y + s / 2} V${y} A${s / 2} ${s / 2} 0 0 1 ${x + s / 2} ${y} V${y + s / 2} Z" fill="${c}"/>`;
    else
      shapes += `<path d="M${x} ${y} q${s} ${-s / 2} ${s * 1.6} 0 t${s * 1.4} 0" stroke="${c}" stroke-width="${s * 0.05}" fill="none" stroke-linecap="round"/>`;
  }
  return wrap(
    w,
    h,
    "",
    `<rect width="${w}" height="${h}" fill="${bg}"/>${shapes}<rect width="${w}" height="${h}" fill="${P.damson[0]}" opacity="0.06"/>`,
  );
}

function pool(w: number, h: number, r: Rng) {
  const lanes = 6;
  let body = `<rect width="${w}" height="${h}" fill="#2d7fa3"/>`;
  for (let i = 0; i < lanes; i++) {
    const y = (h / lanes) * i;
    body += `<rect y="${y}" width="${w}" height="${h / lanes}" fill="${i % 2 ? "#3a93b8" : "#2f86ab"}"/>`;
    body += `<line x1="0" y1="${y + h / lanes / 2}" x2="${w}" y2="${y + h / lanes / 2}" stroke="#123f5a" stroke-width="${h * 0.012}" opacity="0.45"/>`;
    for (let k = 0; k < 40; k++)
      body += `<circle cx="${(w / 40) * k + (i % 2) * 8}" cy="${y}" r="${h * 0.008}" fill="${k % 2 ? "#fff" : P.kiln[2]}"/>`;
  }
  for (let k = 0; k < 14; k++)
    body += `<path d="M${r.next() * w} ${r.next() * h} q${w * 0.04} ${-h * 0.02} ${w * 0.08} 0" stroke="#fff" stroke-opacity="0.35" stroke-width="3" fill="none"/>`;
  return wrap(w, h, "", body);
}

function track(w: number, h: number, r: Rng) {
  let body = `<rect width="${w}" height="${h}" fill="${P.green[1]}"/>`;
  const cy = h * (1.3 + r.next() * 0.3);
  for (let i = 0; i < 8; i++) {
    const rad = h * 0.9 + i * h * 0.07;
    body += `<circle cx="${w * 0.5}" cy="${cy}" r="${rad}" fill="none" stroke="${P.kiln[2]}" stroke-width="${h * 0.07}"/>`;
    body += `<circle cx="${w * 0.5}" cy="${cy}" r="${rad + h * 0.035}" fill="none" stroke="#fff" stroke-width="${h * 0.006}"/>`;
  }
  return wrap(w, h, "", body);
}

function court(w: number, h: number, r: Rng) {
  const base = r.pick(["#2d5a86", P.kiln[2], P.green[1], P.damson[3]]);
  const m = w * 0.12;
  const t = h * 0.12;
  return wrap(
    w,
    h,
    "",
    `<rect width="${w}" height="${h}" fill="${base}"/><rect x="${m}" y="${t}" width="${w - 2 * m}" height="${h - 2 * t}" fill="none" stroke="#fff" stroke-width="${w * 0.006}"/><line x1="${w / 2}" y1="${t}" x2="${w / 2}" y2="${h - t}" stroke="#fff" stroke-width="${w * 0.006}"/><circle cx="${w / 2}" cy="${h / 2}" r="${h * 0.14}" fill="none" stroke="#fff" stroke-width="${w * 0.006}"/><circle cx="${w * (0.3 + r.next() * 0.4)}" cy="${h * (0.3 + r.next() * 0.4)}" r="${h * 0.04}" fill="${P.gold[2]}"/>`,
  );
}

function sports(w: number, h: number, r: Rng) {
  const variant = r.int(0, 3);
  if (variant === 1) return track(w, h, r);
  if (variant === 2) return court(w, h, r);
  const track_ = r.next() > 0.5;
  const base = track_ ? P.kiln[2] : P.green[1];
  let lines = "";
  const vx = w * (0.3 + r.next() * 0.4);
  const vy = -h * 0.6;
  for (let i = -8; i <= 8; i++) {
    const bx = w / 2 + i * w * 0.14;
    lines += `<line x1="${vx}" y1="${vy}" x2="${bx}" y2="${h}" stroke="#fff" stroke-opacity="0.75" stroke-width="${w * 0.004}"/>`;
  }
  const stripes = track_
    ? ""
    : Array.from(
        { length: 6 },
        (_, i) =>
          `<rect y="${h * 0.3 + i * h * 0.12}" width="${w}" height="${h * 0.06}" fill="#fff" opacity="0.05"/>`,
      ).join("");
  return wrap(
    w,
    h,
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.gold[4]}"/><stop offset="1" stop-color="${P.gold[3]}"/></linearGradient>`,
    `<rect width="${w}" height="${h}" fill="url(#sky)"/><rect y="${h * 0.28}" width="${w}" height="${h * 0.72}" fill="${base}"/>${stripes}<g clip-path="inset(28% 0 0 0)"><svg y="${h * 0.28}" height="${h * 0.72}" width="${w}" viewBox="0 ${h * 0.28} ${w} ${h * 0.72}" preserveAspectRatio="none">${lines}</svg></g><rect y="${h * 0.24}" width="${w}" height="${h * 0.05}" fill="${P.damson[2]}" opacity="0.85"/>`,
  );
}

function avatar(w: number, h: number, r: Rng) {
  const bg = r.pick([P.gold[3], "#efe3ec", P.kiln[5], "#dcefe2", "#dde9f5", P.neutral[3]]);
  const skin = r.pick(["#8d5a3c", "#a56b46", "#c58c62", "#6e4430", "#b97d55"]);
  const hair = r.pick(["#1c0b1a", "#2b1b14", "#3d2416", "#5a5150", "#1d1d1d"]);
  const top = r.pick([P.damson[2], P.kiln[1], P.green[1], "#2d5a86", P.neutral[1], P.gold[1]]);
  const cx = w / 2;
  const style = r.int(0, 2);
  const hairShape =
    style === 0
      ? `<path d="M${cx - w * 0.2} ${h * 0.42} Q${cx - w * 0.22} ${h * 0.16} ${cx} ${h * 0.15} Q${cx + w * 0.22} ${h * 0.16} ${cx + w * 0.2} ${h * 0.42} L${cx + w * 0.23} ${h * 0.62} L${cx - w * 0.23} ${h * 0.62} Z" fill="${hair}"/>`
      : style === 1
        ? `<path d="M${cx - w * 0.19} ${h * 0.38} Q${cx - w * 0.2} ${h * 0.15} ${cx} ${h * 0.15} Q${cx + w * 0.2} ${h * 0.15} ${cx + w * 0.19} ${h * 0.38} Z" fill="${hair}"/><circle cx="${cx}" cy="${h * 0.14}" r="${w * 0.08}" fill="${hair}"/>`
        : `<path d="M${cx - w * 0.18} ${h * 0.36} Q${cx - w * 0.18} ${h * 0.17} ${cx} ${h * 0.17} Q${cx + w * 0.18} ${h * 0.17} ${cx + w * 0.18} ${h * 0.36} Z" fill="${hair}"/>`;
  return wrap(
    w,
    h,
    "",
    `<rect width="${w}" height="${h}" fill="${bg}"/><circle cx="${cx}" cy="${h * 0.5}" r="${w * 0.42}" fill="#fff" opacity="0.25"/>${hairShape}<path d="M${cx - w * 0.36} ${h} Q${cx - w * 0.34} ${h * 0.66} ${cx} ${h * 0.64} Q${cx + w * 0.34} ${h * 0.66} ${cx + w * 0.36} ${h} Z" fill="${top}"/><path d="M${cx - w * 0.06} ${h * 0.5} h${w * 0.12} v${h * 0.1} q${-w * 0.06} ${h * 0.04} ${-w * 0.12} 0 Z" fill="${skin}"/><ellipse cx="${cx}" cy="${h * 0.4}" rx="${w * 0.14}" ry="${h * 0.135}" fill="${skin}"/>${style === 2 ? "" : `<path d="M${cx - w * 0.16} ${h * 0.33} Q${cx} ${h * 0.2} ${cx + w * 0.16} ${h * 0.31} Q${cx + w * 0.1} ${h * 0.22} ${cx} ${h * 0.21} Q${cx - w * 0.13} ${h * 0.22} ${cx - w * 0.16} ${h * 0.33} Z" fill="${hair}"/>`}`,
  );
}

function panorama(w: number, h: number, r: Rng) {
  const horizon = h * 0.55;
  let skyline = "";
  let x = 0;
  while (x < w) {
    const kind = r.int(0, 3);
    const bw = w * (0.03 + r.next() * 0.06);
    if (kind === 0) {
      const bh = h * (0.08 + r.next() * 0.12);
      skyline += `<rect x="${x}" y="${horizon - bh}" width="${bw}" height="${bh}" fill="${r.pick(P.kiln.slice(1, 4))}"/>`;
      for (let i = 0; i < 3; i++) {
        const ax = x + bw * (0.12 + i * 0.3);
        const aw = bw * 0.18;
        skyline += `<path d="M${ax} ${horizon} V${horizon - bh * 0.45} a${aw / 2} ${aw / 2} 0 0 1 ${aw} 0 V${horizon} Z" fill="${P.damson[1]}" opacity="0.85"/>`;
      }
    } else if (kind === 1) {
      const tr = h * (0.03 + r.next() * 0.04);
      skyline += `<rect x="${x + bw / 2 - 3}" y="${horizon - tr * 2}" width="6" height="${tr * 2}" fill="${P.neutral[0]}"/><circle cx="${x + bw / 2}" cy="${horizon - tr * 2}" r="${tr}" fill="${r.pick(P.green)}"/>`;
    } else {
      skyline += `<path d="M${x} ${horizon} Q${x + bw / 2} ${horizon - h * (0.03 + r.next() * 0.05)} ${x + bw} ${horizon} Z" fill="${P.green[2]}"/>`;
    }
    x += bw;
  }
  return wrap(
    w,
    h,
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d9cc0"/><stop offset="0.45" stop-color="${P.gold[4]}"/><stop offset="0.55" stop-color="${P.gold[3]}"/></linearGradient><linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.green[2]}"/><stop offset="1" stop-color="${P.green[0]}"/></linearGradient>`,
    `<rect width="${w}" height="${h}" fill="url(#sky)"/><rect y="${horizon}" width="${w}" height="${h - horizon}" fill="url(#ground)"/>${skyline}<rect y="${horizon + h * 0.12}" width="${w}" height="${h * 0.02}" fill="${P.neutral[3]}" opacity="0.6"/>`,
  );
}

function map(w: number, h: number, r: Rng) {
  let roads = "";
  for (let i = 0; i < 7; i++) {
    roads += `<path d="M${r.next() * w} 0 C${r.next() * w} ${h * 0.3} ${r.next() * w} ${h * 0.7} ${r.next() * w} ${h}" stroke="#fff" stroke-width="${r.int(6, 14)}" fill="none"/>`;
  }
  const parks = Array.from(
    { length: 6 },
    () =>
      `<ellipse cx="${r.next() * w}" cy="${r.next() * h}" rx="${w * 0.08}" ry="${h * 0.06}" fill="${P.green[3]}" opacity="0.7"/>`,
  ).join("");
  return wrap(
    w,
    h,
    "",
    `<rect width="${w}" height="${h}" fill="${P.neutral[4]}"/>${parks}<path d="M0 ${h * 0.7} C${w * 0.3} ${h * 0.6} ${w * 0.6} ${h * 0.9} ${w} ${h * 0.75}" stroke="#a8c8ea" stroke-width="28" fill="none"/>${roads}<circle cx="${w / 2}" cy="${h / 2}" r="34" fill="${P.damson[2]}"/><circle cx="${w / 2}" cy="${h / 2}" r="12" fill="${P.gold[2]}"/>`,
  );
}

const SCENES = { arches, landscape, interior, detail, sports, avatar, panorama, map } as const;
export type Scene = keyof typeof SCENES;

export function placeholderSvg(slot: string, scene: string, w: number, h: number): string {
  if (/swimming/.test(slot)) return pool(w, h, rngFor(slot));
  if (/athletics|track/.test(slot)) return track(w, h, rngFor(slot));
  if (/tennis|badminton|basketball|netball/.test(slot)) return court(w, h, rngFor(slot));
  const fn = SCENES[scene as Scene] ?? detail;
  return fn(w, h, rngFor(slot));
}

export function sizeFor(orientation: string, minWidth: number): [number, number] {
  switch (orientation) {
    case "portrait":
      return [minWidth, Math.round(minWidth * 1.25)];
    case "squarish":
      return [minWidth, minWidth];
    case "video":
      return [minWidth, Math.round((minWidth * 9) / 16)];
    case "panorama":
      return [minWidth, minWidth / 2];
    default:
      return [minWidth, Math.round(minWidth * 0.62)];
  }
}
