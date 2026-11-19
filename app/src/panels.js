// panels.js — photo state for the Midnight Duo cover engine.
//
// A photo is { name, src, img, zoom, ox, oy }: `zoom` scales the
// cover-fit draw, `ox`/`oy` pan it inside its panel. The five concept
// samples ship preloaded in the tray; the user can also drop in their
// own photos, which join the same list and take part in the same panel
// order (hero first, then the rest in tray order).

export const SAMPLE_PHOTOS = [
  { name: 'duo', src: 'samples/duo.jpg' },
  { name: 'car', src: 'samples/car.jpg' },
  { name: 'heli', src: 'samples/heli.jpg' },
  { name: 'dj', src: 'samples/dj.jpg' },
  { name: 'boat', src: 'samples/boat.jpg' },
];

export function makePhoto(name, src) {
  return { name, src, img: null, zoom: 1, ox: 0, oy: 0 };
}

export function loadPhoto(photo) {
  return new Promise((resolve) => {
    if (photo.img) {
      resolve(photo);
      return;
    }
    const img = new Image();
    img.onload = () => {
      photo.img = img;
      resolve(photo);
    };
    img.onerror = () => resolve(photo);
    img.src = photo.src;
  });
}

export async function loadPhotos(photos) {
  await Promise.all(photos.map(loadPhoto));
  return photos;
}

// Serialise the adjustable part of the state for undo/redo history.
// Images themselves are never copied — only the knobs.
export function snapshotState(state) {
  return JSON.stringify({
    layout: state.layout,
    grade: state.grade,
    size: state.size,
    caption: state.caption,
    subtitle: state.subtitle,
    city: state.city,
    heroPhoto: state.heroPhoto,
    panelCaptions: state.panelCaptions,
    knobs: state.photos.map((p) => ({ zoom: p.zoom, ox: p.ox, oy: p.oy })),
  });
}

export function restoreState(state, snap) {
  const data = JSON.parse(snap);
  state.layout = data.layout;
  state.grade = data.grade;
  state.size = data.size;
  state.caption = data.caption;
  state.subtitle = data.subtitle;
  state.city = data.city;
  state.heroPhoto = data.heroPhoto;
  state.panelCaptions = data.panelCaptions;
  data.knobs.forEach((k, i) => {
    if (state.photos[i]) {
      state.photos[i].zoom = k.zoom;
      state.photos[i].ox = k.ox;
      state.photos[i].oy = k.oy;
    }
  });
}
