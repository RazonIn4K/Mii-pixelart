/**
 * color.ts — Color conversion and Delta E matching
 *
 * Provides conversions between RGB, HSL, and CIELAB color spaces,
 * plus CIE76 Delta E distance for finding closest palette matches.
 */

export interface RGB {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export interface Lab {
  L: number; // 0-100
  a: number; // ~-128 to 128
  b: number; // ~-128 to 128
}

// ─── Hex ↔ RGB ───────────────────────────────────────────────

export function hexToRgb(hex: string): RGB {
  const clean = hex.replace("#", "");
  return {
    r: parseInt(clean.substring(0, 2), 16),
    g: parseInt(clean.substring(2, 4), 16),
    b: parseInt(clean.substring(4, 6), 16),
  };
}

export function rgbToHex(rgb: RGB): string {
  const toHex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`.toUpperCase();
}

// ─── RGB ↔ HSL ───────────────────────────────────────────────

export function rgbToHsl(rgb: RGB): HSL {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

// ─── RGB ↔ CIELAB ────────────────────────────────────────────

function linearize(c: number): number {
  const v = c / 255;
  return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92;
}

export function rgbToLab(rgb: RGB): Lab {
  // RGB → XYZ (D65 illuminant)
  const r = linearize(rgb.r);
  const g = linearize(rgb.g);
  const b = linearize(rgb.b);

  let x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
  let z = (r * 0.0193339 + g * 0.119192 + b * 0.9503041) / 1.08883;

  const epsilon = 0.008856;
  const kappa = 903.3;

  x = x > epsilon ? Math.cbrt(x) : (kappa * x + 16) / 116;
  y = y > epsilon ? Math.cbrt(y) : (kappa * y + 16) / 116;
  z = z > epsilon ? Math.cbrt(z) : (kappa * z + 16) / 116;

  return {
    L: 116 * y - 16,
    a: 500 * (x - y),
    b: 200 * (y - z),
  };
}

// ─── Delta E (CIE76) ─────────────────────────────────────────

/** Compute CIE76 Delta E between two Lab colors. Lower = more similar. */
export function deltaE(lab1: Lab, lab2: Lab): number {
  return Math.sqrt(
    (lab1.L - lab2.L) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2
  );
}

/** Compute Delta E between two RGB colors. */
export function deltaERgb(c1: RGB, c2: RGB): number {
  return deltaE(rgbToLab(c1), rgbToLab(c2));
}

// ─── Palette Matching ─────────────────────────────────────────

import { TOMODACHI_PALETTE, type PaletteColor } from "./palette";

/** Pre-computed Lab values for the palette (lazy singleton) */
let _paletteLab: { color: PaletteColor; lab: Lab }[] | null = null;

function getPaletteLab() {
  if (!_paletteLab) {
    _paletteLab = TOMODACHI_PALETTE.map((c) => ({
      color: c,
      lab: rgbToLab({ r: c.rgb[0], g: c.rgb[1], b: c.rgb[2] }),
    }));
  }
  return _paletteLab;
}

/** Find the closest palette color to a given RGB value. */
export function findClosestPaletteColor(rgb: RGB): {
  color: PaletteColor;
  distance: number;
} {
  const lab = rgbToLab(rgb);
  const entries = getPaletteLab();
  let bestDist = Infinity;
  let bestEntry = entries[0];

  for (const entry of entries) {
    const d = deltaE(lab, entry.lab);
    if (d < bestDist) {
      bestDist = d;
      bestEntry = entry;
    }
  }

  return { color: bestEntry.color, distance: bestDist };
}

/** Find the N closest palette colors to a given RGB value. */
export function findClosestPaletteColors(
  rgb: RGB,
  n: number
): { color: PaletteColor; distance: number }[] {
  const lab = rgbToLab(rgb);
  const entries = getPaletteLab();

  return entries
    .map((entry) => ({
      color: entry.color,
      distance: deltaE(lab, entry.lab),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, n);
}
