// main.js — editor wiring for the Midnight Duo cover engine.
//
// Boots the editor shell: loads the five concept samples into the tray,
// renders the live preview on one canvas, and wires every control
// (layout / grade / size / caption / subtitle / city / tray / upload /
// export / undo / redo). Shot mode (?shot=cover) skips the editor chrome
// and paints a full-frame cover instead, for deterministic screenshots.

import { drawCover, renderCoverCanvas, ensureFonts } from './cover.js';
import { SIZES, LAYOUT_NAMES } from './layouts.js';
import { GRADE_NAMES } from './grades.js';
import { SAMPLE_PHOTOS, makePhoto, loadPhotos, snapshotState, restoreState } from './panels.js';
import { readShotParams, markShotReady } from './shots.js';

const $ = (sel) => document.querySelector(sel);

function defaultState() {
  return {
    photos: SAMPLE_PHOTOS.map((s) => makePhoto(s.name, s.src)),
    layout: 'band',
    grade: 'poster',
    size: 'wide',
    caption: 'MIDNIGHT DUO',
    subtitle: 'Two leads · One score',
    city: 'AZURA BAY',
    heroPhoto: 0,
    panelCaptions: [],
    selectedPanel: 0,
  };
}

const state = defaultState();
const undoStack = [];
const redoStack = [];

function pushHistory() {
  undoStack.push(snapshotState(state));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  syncUndoButtons();
}

function syncUndoButtons() {
  const undo = $('#undoBtn');
  const redo = $('#redoBtn');
  if (undo) undo.disabled = undoStack.length === 0;
  if (redo) redo.disabled = redoStack.length === 0;
}

function applySnapshot(snap) {
  restoreState(state, snap);
  syncControls();
  renderPreview();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshotState(state));
  applySnapshot(undoStack.pop());
  syncUndoButtons();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshotState(state));
  applySnapshot(redoStack.pop());
  syncUndoButtons();
}

function renderPreview() {
  const canvas = $('#coverCanvas');
  if (!canvas) return;
  const [w, h] = SIZES[state.size] || SIZES.wide;
  const scale = Math.min(1, 880 / w, 560 / h);
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.scale(scale, scale);
  drawCover(ctx, state, w, h);
  ctx.restore();
  const label = $('#sizeLabel');
  if (label) label.textContent = `${w} × ${h} · ${state.layout} · ${state.grade}`;
}

function syncControls() {
  document.querySelectorAll('[data-layout]').forEach((b) => {
    b.classList.toggle('active', b.dataset.layout === state.layout);
  });
  document.querySelectorAll('[data-grade]').forEach((b) => {
    b.classList.toggle('active', b.dataset.grade === state.grade);
  });
  document.querySelectorAll('[data-size]').forEach((b) => {
    b.classList.toggle('active', b.dataset.size === state.size);
  });
  const cap = $('#captionInput');
  if (cap) cap.value = state.caption;
  const sub = $('#subtitleInput');
  if (sub) sub.value = state.subtitle;
  const city = $('#cityInput');
  if (city) city.value = state.city;
  document.querySelectorAll('.tray-thumb').forEach((t, i) => {
    t.classList.toggle('hero', i === state.heroPhoto);
  });
}

function buildTray() {
  const tray = $('#tray');
  if (!tray) return;
  tray.innerHTML = '';
  state.photos.forEach((photo, i) => {
    const btn = document.createElement('button');
    btn.className = 'tray-thumb';
    btn.type = 'button';
    btn.title = `${photo.name} — click to make it the hero photo`;
    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = photo.name;
    btn.appendChild(img);
    const tag = document.createElement('span');
    tag.textContent = photo.name;
    btn.appendChild(tag);
    btn.addEventListener('click', () => {
      pushHistory();
      state.heroPhoto = i;
      syncControls();
      renderPreview();
    });
    tray.appendChild(btn);
  });
}

function buildButtons(containerSel, values, attr, onPick) {
  const box = $(containerSel);
  if (!box) return;
  values.forEach((v) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset[attr] = v;
    b.textContent = v;
    b.addEventListener('click', () => {
      pushHistory();
      onPick(v);
      syncControls();
      renderPreview();
    });
    box.appendChild(b);
  });
}

async function exportCover(sizeName) {
  const canvas = await renderCoverCanvas(state, sizeName);
  const [w, h] = SIZES[sizeName];
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `midnight-duo-${sizeName}-${w}x${h}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

function wireEditor() {
  buildButtons('#layoutBtns', LAYOUT_NAMES, 'layout', (v) => { state.layout = v; });
  buildButtons('#gradeBtns', GRADE_NAMES, 'grade', (v) => { state.grade = v; });
  buildButtons('#sizeBtns', Object.keys(SIZES), 'size', (v) => { state.size = v; });

  $('#captionInput').addEventListener('input', (e) => {
    state.caption = e.target.value;
    renderPreview();
  });
  $('#subtitleInput').addEventListener('input', (e) => {
    state.subtitle = e.target.value;
    renderPreview();
  });
  $('#cityInput').addEventListener('input', (e) => {
    state.city = e.target.value;
    renderPreview();
  });
  $('#captionInput').addEventListener('change', pushHistory);
  $('#subtitleInput').addEventListener('change', pushHistory);
  $('#cityInput').addEventListener('change', pushHistory);

  $('#undoBtn').addEventListener('click', undo);
  $('#redoBtn').addEventListener('click', redo);

  document.querySelectorAll('[data-export]').forEach((b) => {
    b.addEventListener('click', () => exportCover(b.dataset.export));
  });

  const upload = $('#uploadInput');
  if (upload) {
    upload.addEventListener('change', () => {
      const file = upload.files && upload.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        pushHistory();
        const photo = makePhoto(file.name.replace(/\.[^.]+$/, ''), String(reader.result));
        const img = new Image();
        img.onload = () => {
          photo.img = img;
          state.photos.push(photo);
          state.heroPhoto = state.photos.length - 1;
          buildTray();
          syncControls();
          renderPreview();
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  // Panel picking + drag-to-pan + wheel-to-zoom on the preview canvas.
  const canvas = $('#coverCanvas');
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  canvas.addEventListener('mousedown', (e) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const photo = state.photos[state.heroPhoto];
    if (!photo) return;
    const scale = canvas.width / (SIZES[state.size] || SIZES.wide)[0];
    photo.ox += (e.clientX - lastX) / scale;
    photo.oy += (e.clientY - lastY) / scale;
    lastX = e.clientX;
    lastY = e.clientY;
    renderPreview();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const photo = state.photos[state.heroPhoto];
    if (!photo) return;
    pushHistory();
    photo.zoom = Math.min(3, Math.max(0.5, (photo.zoom || 1) * (e.deltaY < 0 ? 1.1 : 0.9)));
    renderPreview();
  }, { passive: false });

  syncControls();
  syncUndoButtons();
}

async function runShotMode(params) {
  Object.assign(state, {
    layout: params.layout,
    grade: params.grade,
    size: params.size,
    caption: params.caption,
    subtitle: params.subtitle,
    city: params.city,
    heroPhoto: params.photo,
  });
  await loadPhotos(state.photos);
  const canvas = await renderCoverCanvas(state, state.size);
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.style.background = '#0b0218';
  canvas.style.display = 'block';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.objectFit = 'contain';
  document.body.appendChild(canvas);
  markShotReady();
}

async function boot() {
  const params = readShotParams();
  await ensureFonts();
  if (params.shot === 'cover') {
    await runShotMode(params);
    return;
  }
  // Editor mode (also used by ?shot=editor): load samples, build UI.
  if (params.shot === 'editor') {
    Object.assign(state, {
      layout: params.layout,
      grade: params.grade,
      size: params.size,
      caption: params.caption,
      subtitle: params.subtitle,
      city: params.city,
      heroPhoto: params.photo,
    });
  }
  await loadPhotos(state.photos);
  buildTray();
  wireEditor();
  renderPreview();
  if (params.shot === 'editor') markShotReady();
}

boot();
