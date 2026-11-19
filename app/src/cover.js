// cover.js — the cover renderer for the Midnight Duo cover engine.
//
// One code path draws the live preview and the exported PNG: drawCover()
// takes a canvas context, the app state and the target size, and paints
// the whole cover. Everything is deterministic: fixed grain seed, fixed
// skyline-free geometry, no Date, no Math.random.
//
// State shape:
//   { photos: [{img, name, zoom, ox, oy}], layout, grade, size,
//     caption, subtitle, city, heroPhoto, panelCaptions: [] }

import { panelRects, titleRect, SIZES } from './layouts.js';
import { applyGrade, addGrain, addVignette, mulberry32 } from './grades.js';

const INK = '#0b0218';
const INK_OUTLINE = '#150329';
const VIOLET_DEEP = '#1a063a';
const MAGENTA = '#c2188a';
const SASH_PINK = '#e91e63';
const BADGE_PINK = '#ff2e88';
const STAR_YELLOW = '#ffd400';
const TAG_YELLOW = '#ffe054';
const CITY_PINK = '#f6c9e6';

let fontsReady = false;

export async function ensureFonts() {
  if (fontsReady) return;
  try {
    await Promise.all([
      document.fonts.load('100px Anton'),
      document.fonts.load('40px Pacifico'),
      document.fonts.ready,
    ]);
  } catch (err) {
    // Fonts are local; if they fail to load the canvas still draws with
    // the fallback sans — the cover stays legible, just less bold.
  }
  fontsReady = true;
}

// Fit a font size so `text` fits inside maxWidth, starting from `start`.
function fitSize(ctx, text, start, maxWidth, family) {
  let size = start;
  while (size > 12) {
    ctx.font = `${size}px ${family}`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return size;
}

// Draw text with manual letter tracking (char by char), centred on cx.
// `stroke` draws a thick ink outline first; `fill` is the face colour.
// Returns the total drawn width.
function drawTracked(ctx, text, cx, y, tracking, family, size, fill, stroke, strokeWidth) {
  ctx.font = `${size}px ${family}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1);
  let x = cx - total / 2;
  ctx.lineJoin = 'round';
  for (let i = 0; i < text.length; i += 1) {
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = strokeWidth;
      ctx.strokeText(text[i], x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(text[i], x, y);
    x += widths[i] + tracking;
  }
  return total;
}

function drawStarPath(ctx, cx, cy, rOuter, rInner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const a = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawStar(ctx, cx, cy, r, fill) {
  drawStarPath(ctx, cx, cy, r, r * 0.45, 5);
  ctx.fillStyle = fill;
  ctx.fill();
}

// Spiky round badge (starburst) with two centred text lines.
function drawStarburst(ctx, cx, cy, r, labelTop, labelBottom) {
  drawStarPath(ctx, cx, cy, r, r * 0.82, 14);
  ctx.fillStyle = STAR_YELLOW;
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.strokeStyle = INK_OUTLINE;
  ctx.stroke();
  const size = r * 0.34;
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK_OUTLINE;
  ctx.fillText(labelTop, cx, cy - size * 0.55);
  ctx.fillText(labelBottom, cx, cy + size * 0.55);
}

// Magenta corner sash across the hero's top-left, rotated white text.
function drawSash(ctx, hero, text) {
  const barH = Math.max(18, hero.h * 0.045);
  ctx.save();
  ctx.beginPath();
  ctx.rect(hero.x, hero.y, hero.w, hero.h);
  ctx.clip();
  // The bar's centreline passes through (0, 0.26*heroH) at -45°; it meets
  // the top edge at t = 0.26*heroH / sin(45°) along the bar. Centre the
  // text on the middle of the VISIBLE segment so no letter is clipped.
  const tTop = (hero.h * 0.26) / Math.SQRT1_2;
  const textX = tTop * 0.5;
  ctx.translate(hero.x, hero.y + hero.h * 0.26);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = SASH_PINK;
  ctx.fillRect(-hero.h * 0.3, -barH / 2, hero.w * 1.4, barH);
  const size = fitSize(ctx, text, barH * 0.62, tTop * 0.92, 'Anton, sans-serif');
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, textX, 0);
  ctx.restore();
}

// Draw one photo into a panel rect, cover-fit, with the panel's zoom/pan,
// then run the grade over the panel pixels.
function paintPanel(ctx, photo, rect, grade) {
  if (!photo || !photo.img) return;
  const img = photo.img;
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight) * (photo.zoom || 1);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = rect.x + (rect.w - dw) / 2 + (photo.ox || 0);
  const dy = rect.y + (rect.h - dh) / 2 + (photo.oy || 0);
  const off = document.createElement('canvas');
  off.width = Math.max(2, Math.round(rect.w));
  off.height = Math.max(2, Math.round(rect.h));
  const octx = off.getContext('2d');
  octx.drawImage(img, dx - rect.x, dy - rect.y, dw, dh);
  const image = octx.getImageData(0, 0, off.width, off.height);
  applyGrade(image, grade);
  octx.putImageData(image, 0, 0);
  ctx.save();
  if (rect.tilt) {
    ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
    ctx.rotate(rect.tilt);
    ctx.translate(-rect.w / 2, -rect.h / 2);
    ctx.drawImage(off, 0, 0);
  } else {
    ctx.drawImage(off, rect.x, rect.y);
  }
  ctx.restore();
  // Ink frame around the panel.
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, Math.round(rect.w * 0.004));
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

// The Version D title block: hero-local dark scrim, city line flanked by
// drawn stars, stacked MIDNIGHT / DUO, yellow tagline underneath.
function paintBandTitle(ctx, state, w, h, hero) {
  const rect = titleRect('band', w, h);
  // Scrim: transparent at the top of the block, deep violet-black at the
  // bottom, hero width only — the right panels stay untouched.
  const scrim = ctx.createLinearGradient(0, rect.y, 0, h);
  scrim.addColorStop(0, 'rgba(16,2,40,0)');
  scrim.addColorStop(0.45, 'rgba(16,2,40,0.55)');
  scrim.addColorStop(1, 'rgba(16,2,40,0.92)');
  ctx.fillStyle = scrim;
  ctx.fillRect(hero.x, rect.y, hero.w, h - rect.y);

  const caption = (state.caption || 'MIDNIGHT DUO').toUpperCase();
  const words = caption.split(/\s+/).filter(Boolean);
  const line1 = words[0] || 'MIDNIGHT';
  const line2 = words.slice(1).join(' ') || 'DUO';
  const maxW = hero.w * 0.88;
  const base = Math.min(hero.w * 0.19, h * 0.16);

  const city = (state.city || 'AZURA BAY').toUpperCase();
  const citySize = Math.max(14, Math.round(h * 0.026));
  const cityY = rect.y + (h - rect.y) * 0.16;
  const cityW = drawTracked(ctx, city, hero.x + hero.w / 2, cityY, citySize * 0.42, 'Anton, sans-serif', citySize, CITY_PINK, null, 0);
  const starR = citySize * 0.52;
  drawStar(ctx, hero.x + hero.w / 2 - cityW / 2 - starR * 1.9, cityY - citySize * 0.32, starR, CITY_PINK);
  drawStar(ctx, hero.x + hero.w / 2 + cityW / 2 + starR * 1.9, cityY - citySize * 0.32, starR, CITY_PINK);

  const size1 = fitSize(ctx, line1, base, maxW, 'Anton, sans-serif');
  const size2 = fitSize(ctx, line2, base, maxW, 'Anton, sans-serif');
  // Anchor the block from the bottom up so the tagline never falls off
  // the canvas: tagline near the bottom edge, two title lines above it,
  // city line above those. Size is capped by the vertical room as well
  // as by the hero width.
  const tagSize = Math.max(12, Math.round(h * 0.02));
  const tagY = Math.round(h * 0.955);
  const size = Math.min(size1, size2, Math.floor((tagY - cityY) / 2.75));
  const lineH = size * 1.0;
  const line2Base = tagY - tagSize * 2.0;
  const line1Base = line2Base - lineH;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = Math.max(4, size * 0.13);
  ctx.strokeText(line1, hero.x + hero.w / 2, line1Base);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(line1, hero.x + hero.w / 2, line1Base);
  ctx.strokeText(line2, hero.x + hero.w / 2, line2Base);
  ctx.fillText(line2, hero.x + hero.w / 2, line2Base);

  const tag = (state.subtitle || 'Two leads · One score').toUpperCase();
  // Shrink the tagline until its tracked width fits the hero (narrow
  // sizes would otherwise push it past the hero's edges).
  let tagFont = tagSize;
  let tagTrack = tagSize * 0.3;
  while (tagFont > 8) {
    ctx.font = `${tagFont}px Anton, sans-serif`;
    const wSum = [...tag].reduce((a, ch) => a + ctx.measureText(ch).width, 0);
    if (wSum + tagTrack * (tag.length - 1) <= hero.w * 0.92) break;
    tagFont -= 1;
    tagTrack = tagFont * 0.3;
  }
  drawTracked(ctx, tag, hero.x + hero.w / 2, tagY, tagTrack, 'Anton, sans-serif', tagFont, TAG_YELLOW, null, 0);
}

// Centre title block used by the nine-panel layout.
function paintCentreTitle(ctx, state, w, h) {
  const rect = titleRect('nine', w, h);
  const grad = ctx.createLinearGradient(rect.x, rect.y, rect.x, rect.y + rect.h);
  grad.addColorStop(0, VIOLET_DEEP);
  grad.addColorStop(1, MAGENTA);
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const caption = (state.caption || 'MIDNIGHT DUO').toUpperCase();
  const size = fitSize(ctx, caption, rect.w * 0.2, rect.w * 0.9, 'Anton, sans-serif');
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = Math.max(3, size * 0.12);
  ctx.strokeText(caption, rect.x + rect.w / 2, rect.y + rect.h * 0.44);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(caption, rect.x + rect.w / 2, rect.y + rect.h * 0.44);
  const sub = state.subtitle || '';
  if (sub) {
    const subSize = Math.max(10, Math.round(rect.h * 0.09));
    ctx.font = `${subSize}px Pacifico, cursive`;
    ctx.fillStyle = TAG_YELLOW;
    ctx.fillText(sub, rect.x + rect.w / 2, rect.y + rect.h * 0.74);
  }
}

// Bottom band used by the bleed layout.
function paintBottomBand(ctx, state, w, h) {
  const rect = titleRect('bleed', w, h);
  const grad = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  grad.addColorStop(0, VIOLET_DEEP);
  grad.addColorStop(1, MAGENTA);
  ctx.fillStyle = grad;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const caption = (state.caption || 'MIDNIGHT DUO').toUpperCase();
  const size = fitSize(ctx, caption, rect.h * 0.5, rect.w * 0.9, 'Anton, sans-serif');
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = INK_OUTLINE;
  ctx.lineWidth = Math.max(3, size * 0.12);
  ctx.strokeText(caption, rect.x + rect.w / 2, rect.y + rect.h * 0.46);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(caption, rect.x + rect.w / 2, rect.y + rect.h * 0.46);
  const tag = (state.subtitle || '').toUpperCase();
  if (tag) {
    drawTracked(ctx, tag, rect.x + rect.w / 2, rect.y + rect.h * 0.82, size * 0.08, 'Anton, sans-serif', Math.max(10, size * 0.22), TAG_YELLOW, null, 0);
  }
}

// Per-panel mini captions (small caps strip at the panel's bottom edge).
function paintPanelCaption(ctx, rect, text) {
  if (!text) return;
  const size = Math.max(10, Math.round(rect.h * 0.045));
  ctx.font = `${size}px Anton, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  const pad = Math.max(6, rect.w * 0.02);
  const tw = ctx.measureText(text.toUpperCase()).width;
  ctx.fillStyle = 'rgba(11,2,24,0.72)';
  ctx.fillRect(rect.x, rect.y + rect.h - size - pad * 1.6, tw + pad * 2, size + pad * 1.6);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text.toUpperCase(), rect.x + pad, rect.y + rect.h - pad * 0.8);
}

// Main entry: paint the whole cover into ctx at w x h.
export function drawCover(ctx, state, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, w, h);
  const layout = state.layout || 'band';
  const grade = state.grade || 'poster';

  if (layout === 'tilted') {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#2b0a4d');
    sky.addColorStop(0.55, '#c2188a');
    sky.addColorStop(1, '#ff9a3d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(w * 0.78, h * 0.2, Math.round(h * 0.11), 0, Math.PI * 2);
    ctx.fillStyle = '#ffe054';
    ctx.fill();
  }

  const panels = panelRects(layout, w, h);
  const order = photoOrder(state);
  panels.forEach((rect, i) => {
    if (rect.slot === -1) return;
    const photo = order[rect.slot % order.length];
    if (layout === 'tilted') {
      // Polaroid white frame behind the tilted card.
      ctx.save();
      ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
      ctx.rotate(rect.tilt);
      ctx.fillStyle = '#fdf6ec';
      ctx.fillRect(-rect.w / 2 - 10, -rect.h / 2 - 10, rect.w + 20, rect.h + 34);
      ctx.restore();
    }
    paintPanel(ctx, photo, rect, grade);
    const cap = (state.panelCaptions || [])[i];
    if (cap) paintPanelCaption(ctx, rect, cap);
  });

  if (layout === 'band') {
    const hero = panels[0];
    paintBandTitle(ctx, state, w, h, hero);
    drawSash(ctx, hero, 'ONE NIGHT ONLY');
  } else if (layout === 'nine') {
    paintCentreTitle(ctx, state, w, h);
  } else if (layout === 'bleed') {
    paintBottomBand(ctx, state, w, h);
  } else if (layout === 'diptych') {
    const bandH = Math.max(30, h * 0.09);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.12);
    ctx.fillStyle = MAGENTA;
    ctx.fillRect(-w, -bandH / 2, w * 2, bandH);
    ctx.restore();
    const caption = (state.caption || 'MIDNIGHT DUO').toUpperCase();
    const size = fitSize(ctx, caption, bandH * 0.7, w * 0.7, 'Anton, sans-serif');
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-0.12);
    ctx.font = `${size}px Anton, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK_OUTLINE;
    ctx.lineWidth = Math.max(3, size * 0.12);
    ctx.strokeText(caption, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(caption, 0, 0);
    ctx.restore();
  } else if (layout === 'strip') {
    drawStarburst(ctx, w * 0.5, h * 0.5, Math.max(30, h * 0.08), (state.caption || 'MIDNIGHT').split(' ')[0], 'DUO');
  }

  // Finish: grain + vignette for the poster grade, light vignette otherwise.
  const image = ctx.getImageData(0, 0, w, h);
  if (grade === 'poster') {
    addGrain(image, w, h, 20261119, 7);
    addVignette(image, w, h, 0.22);
  } else {
    addVignette(image, w, h, 0.12);
  }
  ctx.putImageData(image, 0, 0);
}

// Photo order for panels: the hero photo first, then the rest in tray
// order. `state.heroPhoto` is an index into state.photos.
export function photoOrder(state) {
  const photos = state.photos || [];
  if (photos.length === 0) return [];
  const hero = photos[state.heroPhoto || 0] || photos[0];
  const rest = photos.filter((p) => p !== hero);
  return [hero, ...rest];
}

// Render the cover at an export size and return the canvas.
export async function renderCoverCanvas(state, sizeName) {
  const [w, h] = SIZES[sizeName || state.size || 'wide'] || SIZES.wide;
  await ensureFonts();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  drawCover(canvas.getContext('2d'), state, w, h);
  return canvas;
}

// Deterministic seeded shuffle used for the skyline-free layouts only.
export function seededPick(seed, n) {
  const rand = mulberry32(seed);
  return Math.floor(rand() * n);
}
