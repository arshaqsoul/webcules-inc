/* Color sort key (pure + client-safe). The browser downsamples a photo's
 * thumbnail to a tiny canvas at upload and calls colorKeyFromRgba; the
 * integer it returns is stored on the asset, so "Color - rainbow" is a plain
 * numeric sort on the server.
 *
 * key = bucket * 100 + lightness (0-99)
 *   bucket 0-359 = dominant hue in degrees (reds first, through the
 *                  spectrum, to magenta) - weighted by how colorful each
 *                  pixel is, so a grey sky doesn't drown a red dress;
 *   bucket 360   = neutral photos (black & white, very muted), which sort
 *                  after the rainbow, dark to light. */

export const COLOR_KEY_MAX = 360 * 100 + 99;
const NEUTRAL_BUCKET = 360;
/** Mean colorfulness below this = neutral. */
const NEUTRAL_THRESHOLD = 0.07;

export function isValidColorKey(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= COLOR_KEY_MAX;
}

export function colorKeyFromRgba(rgba: ArrayLike<number>): number {
  const pixels = Math.floor(rgba.length / 4);
  if (pixels === 0) return NEUTRAL_BUCKET * 100;
  let lightSum = 0;
  let weightSum = 0;
  let x = 0;
  let y = 0;
  for (let p = 0; p < pixels; p++) {
    const r = rgba[p * 4] / 255;
    const g = rgba[p * 4 + 1] / 255;
    const b = rgba[p * 4 + 2] / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    lightSum += l;
    const chroma = max - min;
    // HSL saturation, damped near black/white where hue is noise.
    const sat = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * l - 1) || 1);
    const w = sat * (1 - Math.abs(2 * l - 1));
    if (chroma > 0) {
      let h: number;
      if (max === r) h = ((g - b) / chroma + 6) % 6;
      else if (max === g) h = (b - r) / chroma + 2;
      else h = (r - g) / chroma + 4;
      const rad = (h * 60 * Math.PI) / 180;
      x += Math.cos(rad) * w;
      y += Math.sin(rad) * w;
    }
    weightSum += w;
  }
  const lightness = Math.min(99, Math.floor((lightSum / pixels) * 100));
  if (weightSum / pixels < NEUTRAL_THRESHOLD || (x === 0 && y === 0)) return NEUTRAL_BUCKET * 100 + lightness;
  const hue = Math.round(((Math.atan2(y, x) * 180) / Math.PI + 360) % 360) % 360;
  return hue * 100 + lightness;
}
