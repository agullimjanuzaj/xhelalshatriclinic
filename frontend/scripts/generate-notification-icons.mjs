// Generates monochrome notification icons for Android push notifications.
// Uses only Node.js built-in modules (zlib + fs) — no npm dependencies needed.
// Run: node frontend/scripts/generate-notification-icons.mjs

import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '../public/icons');

// ── PNG encoder ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const tb = Buffer.from(type);
  const lb = Buffer.alloc(4); lb.writeUInt32BE(data.length);
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc32(Buffer.concat([tb, data])));
  return Buffer.concat([lb, tb, data, cb]);
}

function makePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, colour type RGBA

  // Build raw scanlines: 1 filter byte (0=None) + w*4 RGBA bytes per row
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0; // filter byte
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(buf, w, x, y, a) {
  if (x < 0 || y < 0 || x >= w || y >= buf.length / (4 * w)) return;
  const i = (y * w + x) * 4;
  buf[i] = 255; buf[i + 1] = 255; buf[i + 2] = 255;
  buf[i + 3] = Math.max(buf[i + 3], Math.round(a * 255));
}

// ── Icon shapes ─────────────────────────────────────────────────────────────

// Medical cross — white plus sign on transparent background.
// barRatio: width of each arm as a fraction of the total icon size.
// marginRatio: blank margin around the cross as a fraction of icon size.
function drawCross(buf, w, h, barRatio = 0.22, marginRatio = 0.1) {
  const bar = barRatio * w;
  const mx = marginRatio * w;
  const my = marginRatio * h;
  const cx = w / 2;
  const cy = h / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inH = x >= mx && x < w - mx && Math.abs(y - cy) <= bar / 2;
      const inV = y >= my && y < h - my && Math.abs(x - cx) <= bar / 2;
      if (inH || inV) setPixel(buf, w, x, y, 1);
    }
  }
}

// Small filled circle — used for the tiny badge icon.
function drawCircle(buf, w, h, radiusRatio = 0.35) {
  const cx = w / 2;
  const cy = h / 2;
  const r = radiusRatio * Math.min(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      if (dx * dx + dy * dy <= r * r) setPixel(buf, w, x, y, 1);
    }
  }
}

// ── Generate files ───────────────────────────────────────────────────────────

function generate(filename, w, h, drawFn) {
  const rgba = Buffer.alloc(w * h * 4, 0); // fully transparent
  drawFn(rgba, w, h);
  const png = makePNG(w, h, rgba);
  const dest = join(ICONS_DIR, filename);
  writeFileSync(dest, png);
  console.log(`✓  ${filename}  (${w}×${h}, ${png.length} bytes)`);
}

generate('notification-icon.png', 96, 96, drawCross);
generate('badge.png',             72, 72, drawCross);

console.log('\nDone. Icons written to frontend/public/icons/');
