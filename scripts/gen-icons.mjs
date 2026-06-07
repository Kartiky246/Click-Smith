#!/usr/bin/env node
/**
 * Generates ClickSmith extension icons as PNGs using only Node built-ins.
 * Icon: gradient rounded-rect (blue #4F6EF7 → purple #7C3AED) with a white cursor arrow.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── PNG writer ────────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.allocUnsafe(4); len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([t, data]);
  const crcBuf = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, t, data, crcBuf]);
}

function u32(n) { const b = Buffer.allocUnsafe(4); b.writeUInt32BE(n); return b; }

function makePNG(w, h, getPixel) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.allocUnsafe(1 + w * 4);
    row[0] = 0; // no filter
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = getPixel(x, y, w, h);
      row[1 + x * 4]     = r;
      row[1 + x * 4 + 1] = g;
      row[1 + x * 4 + 2] = b;
      row[1 + x * 4 + 3] = a;
    }
    rows.push(row);
  }
  const ihdr = chunk('IHDR', Buffer.concat([u32(w), u32(h), Buffer.from([8, 6, 0, 0, 0])]));
  const idat = chunk('IDAT', deflateSync(Buffer.concat(rows)));
  const iend = chunk('IEND', Buffer.alloc(0));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ihdr, idat, iend]);
}

// ── Drawing helpers ───────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t; }

function inRoundedRect(cx, cy, r) {
  const qx = Math.max(r - cx, 0, cx - (1 - r));
  const qy = Math.max(r - cy, 0, cy - (1 - r));
  return qx * qx + qy * qy <= r * r;
}

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

// Cursor arrow from SVG path "M4 4l7.07 17 2.51-7.39L21 11.07z" in 24×24 viewBox
const RAW_CURSOR = [[4, 4], [11.07, 21], [13.58, 13.61], [21, 11.07]];

function getPixel(x, y, w, h) {
  const cx = (x + 0.5) / w;
  const cy = (y + 0.5) / h;

  if (!inRoundedRect(cx, cy, 0.2)) return [0, 0, 0, 0];

  // Diagonal gradient: blue (#4F6EF7) → purple (#7C3AED)
  const t = (cx + cy) / 2;
  const bgR = Math.round(lerp(0x4f, 0x7c, t));
  const bgG = Math.round(lerp(0x6e, 0x3a, t));
  const bgB = Math.round(lerp(0xf7, 0xed, t));

  // Cursor arrow (skip for tiny 16px — too small to look good)
  if (w >= 32) {
    const pad = 0.16;
    const scale = 1 - pad * 2;
    const poly = RAW_CURSOR.map(([px, py]) => [px / 24 * scale + pad, py / 24 * scale + pad]);
    if (pointInPolygon(cx, cy, poly)) return [255, 255, 255, 230];
  }

  return [bgR, bgG, bgB, 255];
}

// ── Generate ──────────────────────────────────────────────────────────────────

const publicDir = join(__dirname, '..', 'apps', 'extension', 'src', 'public');
mkdirSync(publicDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const png = makePNG(size, size, getPixel);
  writeFileSync(join(publicDir, `icon-${size}.png`), png);
  console.log(`✓ icon-${size}.png (${size}×${size})`);
}
