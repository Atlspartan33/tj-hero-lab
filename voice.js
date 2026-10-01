// voice.js — plays one narrator line at a time (a new line cuts off the old one).
import { LINES } from './lines.js';

const cache = new Map();
let current = null, muted = false;

function clip(id) {
  if (!cache.has(id)) { const a = new Audio(`audio/${id}.mp3`); a.preload = 'auto'; cache.set(id, a); }
  return cache.get(id);
}
export function preload() { for (const id of Object.keys(LINES)) clip(id); }
export function setMuted(m) { muted = m; if (m) stop(); }
export function stop() {
  if (current) { current.pause(); current = null; }
  try { speechSynthesis.cancel(); } catch {}
}
function fallback(id) {
  try {
    const u = new SpeechSynthesisUtterance(LINES[id]);
    u.rate = 0.95; u.pitch = 1.1;
    speechSynthesis.speak(u);
  } catch {}
}
// Resolves when the line finishes (or fails), so callers can sequence lines.
export function say(id) {
  if (muted || !LINES[id]) return Promise.resolve();
  stop();
  const a = clip(id);
  current = a;
  a.currentTime = 0;
  return new Promise((res) => {
    a.onended = () => res();
    a.onerror = () => { fallback(id); res(); };
    a.play().catch(() => { fallback(id); res(); });
  });
}
