// grades.js — pixel grades for the Midnight Duo cover engine.
//
// Every grade is a pure function over ImageData: the same input bytes in,
// the same output bytes out. No Date, no Math.random, no network anywhere
// in this file. Grain uses a fixed-seed PRNG (mulberry32), so two runs of
// the entry program produce byte-identical output.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function liftSaturation(r, g, b, amount) {
  const grey = 0.299 * r + 0.587 * g + 0.114 * b;
  return [
    clamp255(grey + (r - grey) * amount),
    clamp255(grey + (g - grey) * amount),
    clamp255(grey + (b - grey) * amount),
  ];
}

function liftContrast(v, factor) {
  return clamp255((v - 128) * factor + 128);
}

// Posterize one channel to `levels` flat steps (5 levels => step 63.75).
function posterize(v, levels) {
  const step = 255 / (levels - 1);
  return clamp255(Math.round(v / step) * step);
}

// Apply a named grade to ImageData in place. `name` is one of:
// sunset | neon | golden | dusk | mono | poster (the default).
export function applyGrade(data, name) {
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i];
    let g = px[i + 1];
    let b = px[i + 2];
    if (name === 'poster') {
      // Painterly treatment: saturation + contrast lift, then flat posterize.
      [r, g, b] = liftSaturation(r, g, b, 1.45);
      r = liftContrast(r, 1.22);
      g = liftContrast(g, 1.22);
      b = liftContrast(b, 1.22);
      r = posterize(r, 5);
      g = posterize(g, 5);
      b = posterize(b, 5);
    } else if (name === 'sunset') {
      [r, g, b] = liftSaturation(r, g, b, 1.25);
      r = clamp255(r * 1.12 + 18);
      g = clamp255(g * 1.02 + 4);
      b = clamp255(b * 0.9 - 6);
    } else if (name === 'neon') {
      [r, g, b] = liftSaturation(r, g, b, 1.5);
      r = liftContrast(r, 1.3);
      g = liftContrast(g, 1.3);
      b = clamp255(b * 1.18 + 10);
    } else if (name === 'golden') {
      [r, g, b] = liftSaturation(r, g, b, 1.15);
      r = clamp255(r * 1.14 + 22);
      g = clamp255(g * 1.05 + 10);
      b = clamp255(b * 0.82);
    } else if (name === 'dusk') {
      // Teal-magenta split tone: cool shadows, warm highlights.
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const warm = lum / 255;
      r = clamp255(r * (0.88 + 0.3 * warm) + 14 * warm);
      g = clamp255(g * (1.06 + 0.06 * warm));
      b = clamp255(b * (1.14 - 0.2 * warm) + 16 * (1 - warm));
    } else if (name === 'mono') {
      const grey = 0.299 * r + 0.587 * g + 0.114 * b;
      const ink = liftContrast(grey, 1.35);
      r = clamp255(ink + 26);
      g = ink;
      b = clamp255(ink + 40);
    }
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
  return data;
}

// Deterministic film grain: a fixed-seed walk over the pixels, so the
// pattern is identical on every run. `amount` is the max +/- offset.
export function addGrain(data, width, height, seed, amount) {
  const rand = mulberry32(seed);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const n = (rand() * 2 - 1) * amount;
    px[i] = clamp255(px[i] + n);
    px[i + 1] = clamp255(px[i + 1] + n);
    px[i + 2] = clamp255(px[i + 2] + n);
  }
  return data;
}

// Darken the corners: a pure function of x/y, identical on every run.
export function addVignette(data, width, height, strength) {
  const px = data.data;
  const cx = width / 2;
  const cy = height / 2;
  const maxD = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (x - cx) / maxD;
      const dy = (y - cy) / maxD;
      const d = Math.sqrt(dx * dx + dy * dy);
      const f = 1 - strength * d * d;
      const i = (y * width + x) * 4;
      px[i] = clamp255(px[i] * f);
      px[i + 1] = clamp255(px[i + 1] * f);
      px[i + 2] = clamp255(px[i + 2] * f);
    }
  }
  return data;
}

export const GRADE_NAMES = ['poster', 'sunset', 'neon', 'golden', 'dusk', 'mono'];
