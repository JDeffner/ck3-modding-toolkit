import { decodeDds, type DecodedImage } from "./decoder";
import { encodePng } from "./png";

export { decodeDds, ddsFormatInfo } from "./decoder";
export { encodePng } from "./png";
export { encodeDds, hasTransparency, type DdsEncodeFormat } from "./encode";
export type { DecodedImage } from "./decoder";

/** Nearest-neighbour downscale so max(width, height) <= maxDim. Returns the image unchanged if already small enough. */
function downscale(img: DecodedImage, maxDim: number): DecodedImage {
  const { width, height, pixels } = img;
  const longest = Math.max(width, height);
  if (longest <= maxDim || maxDim <= 0) return img;

  const scale = maxDim / longest;
  const dw = Math.max(1, Math.round(width * scale));
  const dh = Math.max(1, Math.round(height * scale));
  const out = new Uint8Array(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(height - 1, Math.floor((y * height) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(width - 1, Math.floor((x * width) / dw));
      const so = (sy * width + sx) * 4;
      const dof = (y * dw + x) * 4;
      out[dof] = pixels[so];
      out[dof + 1] = pixels[so + 1];
      out[dof + 2] = pixels[so + 2];
      out[dof + 3] = pixels[so + 3];
    }
  }
  return { width: dw, height: dh, pixels: out };
}

/** Decode a DDS, optionally downscale so max(w,h) <= maxDim, encode PNG, return a data URI. */
export function ddsToPngDataUri(buf: Uint8Array, maxDim = 256): string {
  const decoded = decodeDds(buf);
  const scaled = downscale(decoded, maxDim);
  const png = encodePng(scaled.width, scaled.height, scaled.pixels);
  const base64 = Buffer.from(png).toString("base64");
  return `data:image/png;base64,${base64}`;
}
