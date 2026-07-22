/**
 * Renders media/icon.png (128x128 marketplace icon) with the project's own
 * PNG encoder — a gold crown on a dark rounded tile, matching the view icon.
 *
 * Run: npx esbuild scripts/makeIcon.ts --bundle --platform=node --outfile=dist/makeIcon.cjs && node dist/makeIcon.cjs
 */
import * as fs from "fs";
import { encodePng } from "../packages/server/src/dds/png";

const S = 128;
const px = new Uint8Array(S * S * 4);

function put(x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (y * S + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

// Dark rounded tile
const R = 22;
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    const cx = Math.max(R - x, x - (S - 1 - R), 0);
    const cy = Math.max(R - y, y - (S - 1 - R), 0);
    if (cx * cx + cy * cy <= R * R) put(x, y, 30, 30, 38, 255);
  }
}

// Crown silhouette (point-in-polygon, even-odd)
const crown: Array<[number, number]> = [
  [20, 88],
  [18, 46],
  [40, 64],
  [64, 34],
  [88, 64],
  [110, 46],
  [108, 88],
];
function inside(x: number, y: number, poly: Array<[number, number]>): boolean {
  let odd = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
  }
  return odd;
}
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    if (inside(x, y, crown)) put(x, y, 232, 185, 76, 255);
  }
}
// Band under the crown
for (let y = 92; y < 100; y++) {
  for (let x = 20; x <= 108; x++) put(x, y, 232, 185, 76, 255);
}
// Jewels: three circles on the band
for (const cx of [36, 64, 92]) {
  for (let y = 92; y < 100; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      const dx = x - cx;
      const dy = y - 96;
      if (dx * dx + dy * dy <= 9) put(x, y, 120, 40, 48, 255);
    }
  }
}
// Peak orbs
for (const [cx, cy] of [
  [18, 42],
  [64, 30],
  [110, 42],
] as Array<[number, number]>) {
  for (let y = cy - 5; y <= cy + 5; y++) {
    for (let x = cx - 5; x <= cx + 5; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= 22) put(x, y, 232, 185, 76, 255);
    }
  }
}

fs.writeFileSync("media/icon.png", encodePng(S, S, px));
console.log("media/icon.png written");
