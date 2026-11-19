// shots.js — deterministic ?shot= scenes for screenshots.
//
// The screenshot runner opens the app with a query string and the page
// renders one fixed scene, then sets document.title to "shot-ready" so
// the runner knows the canvas is painted and the fonts are in.
//
//   ?shot=cover   full-frame exported cover at the requested size
//   ?shot=editor  the editor UI with a photo loaded
//
// Params (all optional, defaults are the Version D cover):
//   layout, grade, size, caption, subtitle, city, photo (hero index)

export function readShotParams() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot') || '';
  // `photo` accepts a tray index (0..4) or a sample name (duo/car/heli/dj/boat).
  const rawPhoto = q.get('photo') || '0';
  const names = ['duo', 'car', 'heli', 'dj', 'boat'];
  const byName = names.indexOf(rawPhoto);
  const photo = byName >= 0 ? byName : Number(rawPhoto) || 0;
  return {
    shot,
    layout: q.get('layout') || 'band',
    grade: q.get('grade') || 'poster',
    size: q.get('size') || 'wide',
    caption: q.get('caption') || 'MIDNIGHT DUO',
    subtitle: q.get('subtitle') || 'Two leads · One score',
    city: q.get('city') || 'AZURA BAY',
    photo,
  };
}

export function markShotReady() {
  document.title = 'shot-ready';
  window.__shotReady = true;
}
