// layouts.js — panel geometry for the Midnight Duo cover engine.
//
// Every layout is a pure function of (width, height): it returns the list of
// photo panels as {x, y, w, h, slot, tilt} rectangles. `slot` is the index
// into the photo order (0 = hero photo, then 1..4 in reading order); a slot
// of -1 means "title block, not a photo". All coordinates are in cover
// pixels, so the same geometry scales from the live preview to a 1920px
// export without any second code path.

export const SIZES = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  wide: [1920, 1080],
  story: [1080, 1920],
};

export const LAYOUT_NAMES = ['band', 'nine', 'hero', 'bleed', 'tilted', 'diptych', 'strip'];

function gutterFor(w) {
  return Math.max(4, Math.round(w * 0.004));
}

// The DEFAULT layout (Version D, user-picked 2026-11-19): full-height photo
// area, hero LEFT (~56% width) + 2x2 stack RIGHT, ink gutters. The title
// block lives only on the hero's lower area — the four right panels stay
// 100% clean photos, no text over them ever.
function bandPanels(w, h) {
  const g = gutterFor(w);
  const heroW = Math.round(w * 0.56);
  const rightX = heroW + g;
  const rightW = w - rightX;
  const cellW = Math.floor((rightW - g) / 2);
  const cellH = Math.floor((h - g) / 2);
  return [
    { x: 0, y: 0, w: heroW, h, slot: 0, tilt: 0 },
    { x: rightX, y: 0, w: cellW, h: cellH, slot: 1, tilt: 0 },
    { x: rightX + cellW + g, y: 0, w: cellW, h: cellH, slot: 2, tilt: 0 },
    { x: rightX, y: cellH + g, w: cellW, h: cellH, slot: 3, tilt: 0 },
    { x: rightX + cellW + g, y: cellH + g, w: cellW, h: cellH, slot: 4, tilt: 0 },
  ];
}

// Nine-panel classic: 3x3 grid, centre cell is the title block.
function ninePanels(w, h) {
  const g = gutterFor(w);
  const cw = Math.floor((w - 2 * g) / 3);
  const ch = Math.floor((h - 2 * g) / 3);
  const cells = [];
  let slot = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const centre = row === 1 && col === 1;
      cells.push({
        x: col * (cw + g),
        y: row * (ch + g),
        w: cw,
        h: ch,
        slot: centre ? -1 : slot,
        tilt: 0,
      });
      if (!centre) slot += 1;
    }
  }
  return cells;
}

// Hero + three: one large hero left (62%) + three stacked panels right.
function heroPanels(w, h) {
  const g = gutterFor(w);
  const heroW = Math.round(w * 0.62);
  const rightX = heroW + g;
  const rightW = w - rightX;
  const cellH = Math.floor((h - 2 * g) / 3);
  return [
    { x: 0, y: 0, w: heroW, h, slot: 0, tilt: 0 },
    { x: rightX, y: 0, w: rightW, h: cellH, slot: 1, tilt: 0 },
    { x: rightX, y: cellH + g, w: rightW, h: cellH, slot: 2, tilt: 0 },
    { x: rightX, y: 2 * (cellH + g), w: rightW, h: cellH, slot: 3, tilt: 0 },
  ];
}

// Full-bleed hero: one photo edge to edge, title band along the bottom,
// thin strip of three mini panels across the top.
function bleedPanels(w, h) {
  const g = gutterFor(w);
  const stripH = Math.round(h * 0.14);
  const bandH = Math.round(h * 0.2);
  const cellW = Math.floor((w - 2 * g) / 3);
  return [
    { x: 0, y: 0, w, h, slot: 0, tilt: 0 },
    { x: 0, y: g, w: cellW, h: stripH, slot: 1, tilt: 0 },
    { x: cellW + g, y: g, w: cellW, h: stripH, slot: 2, tilt: 0 },
    { x: 2 * (cellW + g), y: g, w: cellW, h: stripH, slot: 3, tilt: 0 },
    { x: 0, y: h - bandH, w, h: bandH, slot: -1, tilt: 0 },
  ];
}

// Tilted snapshots: three polaroid-style cards scattered over a gradient
// sky, each slightly rotated. The cover background (sky + sun) is drawn
// by cover.js; these rects are the photo cards only.
function tiltedPanels(w, h) {
  const cardW = Math.round(w * 0.42);
  const cardH = Math.round(h * 0.52);
  return [
    { x: Math.round(w * 0.06), y: Math.round(h * 0.1), w: cardW, h: cardH, slot: 0, tilt: -0.1 },
    { x: Math.round(w * 0.5), y: Math.round(h * 0.06), w: cardW, h: cardH, slot: 1, tilt: 0.07 },
    { x: Math.round(w * 0.28), y: Math.round(h * 0.42), w: cardW, h: cardH, slot: 2, tilt: -0.03 },
  ];
}

// Diptych split: two tall panels divided by a diagonal neon band that
// carries the caption (drawn by cover.js).
function diptychPanels(w, h) {
  const g = gutterFor(w);
  const half = Math.floor((w - g) / 2);
  return [
    { x: 0, y: 0, w: half, h, slot: 0, tilt: 0 },
    { x: half + g, y: 0, w: half, h, slot: 1, tilt: 0 },
  ];
}

// Strip comic: four horizontal scene bands, caption in a burst badge.
function stripPanels(w, h) {
  const g = gutterFor(w);
  const bandH = Math.floor((h - 3 * g) / 4);
  const panels = [];
  for (let i = 0; i < 4; i += 1) {
    panels.push({ x: 0, y: i * (bandH + g), w, h: bandH, slot: i, tilt: 0 });
  }
  return panels;
}

export function panelRects(layout, w, h) {
  if (layout === 'nine') return ninePanels(w, h);
  if (layout === 'hero') return heroPanels(w, h);
  if (layout === 'bleed') return bleedPanels(w, h);
  if (layout === 'tilted') return tiltedPanels(w, h);
  if (layout === 'diptych') return diptychPanels(w, h);
  if (layout === 'strip') return stripPanels(w, h);
  return bandPanels(w, h);
}

// Where the layout's title block goes, as a rect in cover pixels.
// band: the hero's lower area (Version D). nine: the centre cell.
// bleed: the bottom band. Others: a centred block over the middle.
export function titleRect(layout, w, h) {
  const g = gutterFor(w);
  if (layout === 'band') {
    const heroW = Math.round(w * 0.56);
    return { x: 0, y: Math.round(h * 0.5), w: heroW, h: h - Math.round(h * 0.5) };
  }
  if (layout === 'nine') {
    const cw = Math.floor((w - 2 * g) / 3);
    const ch = Math.floor((h - 2 * g) / 3);
    return { x: cw + g, y: ch + g, w: cw, h: ch };
  }
  if (layout === 'bleed') {
    return { x: 0, y: h - Math.round(h * 0.2), w, h: Math.round(h * 0.2) };
  }
  return { x: Math.round(w * 0.1), y: Math.round(h * 0.36), w: Math.round(w * 0.8), h: Math.round(h * 0.28) };
}
