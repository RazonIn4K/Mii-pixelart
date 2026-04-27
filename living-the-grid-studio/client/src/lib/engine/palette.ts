/**
 * palette.ts — Tomodachi Life: Living the Dream game palette
 *
 * DESIGN: "Paper Studio" — this module provides the 84-color game palette
 * (77 base shades + 7 fully saturated extras) used by the Palette House.
 * Each color is labeled by row and column for easy in-game matching.
 */

export interface PaletteColor {
  /** Unique identifier, e.g. "R1C3" (Row 1, Column 3) */
  id: string;
  /** Display name */
  name: string;
  /** Hex color string, e.g. "#FF0000" */
  hex: string;
  /** RGB tuple */
  rgb: [number, number, number];
  /** Row index (1-based) in the game palette grid */
  row: number;
  /** Column index (1-based) in the game palette grid */
  col: number;
  /** Whether this is one of the 7 fully saturated extras */
  isSaturated: boolean;
}

/**
 * The complete Tomodachi Life palette.
 * Organized as 11 rows x 7 columns (77 base) + 7 saturated extras.
 * Colors are approximations based on community-documented values.
 */
export const TOMODACHI_PALETTE: PaletteColor[] = [
  // Row 1: Reds
  { id: "R1C1", name: "Dark Red",      hex: "#8B0000", rgb: [139, 0, 0],     row: 1, col: 1, isSaturated: false },
  { id: "R1C2", name: "Red",           hex: "#CC0000", rgb: [204, 0, 0],     row: 1, col: 2, isSaturated: false },
  { id: "R1C3", name: "Bright Red",    hex: "#FF0000", rgb: [255, 0, 0],     row: 1, col: 3, isSaturated: false },
  { id: "R1C4", name: "Salmon",        hex: "#FF6666", rgb: [255, 102, 102], row: 1, col: 4, isSaturated: false },
  { id: "R1C5", name: "Light Salmon",  hex: "#FF9999", rgb: [255, 153, 153], row: 1, col: 5, isSaturated: false },
  { id: "R1C6", name: "Pale Pink",     hex: "#FFCCCC", rgb: [255, 204, 204], row: 1, col: 6, isSaturated: false },
  { id: "R1C7", name: "Rose White",    hex: "#FFE5E5", rgb: [255, 229, 229], row: 1, col: 7, isSaturated: false },

  // Row 2: Oranges
  { id: "R2C1", name: "Dark Orange",   hex: "#993300", rgb: [153, 51, 0],    row: 2, col: 1, isSaturated: false },
  { id: "R2C2", name: "Orange",        hex: "#CC6600", rgb: [204, 102, 0],   row: 2, col: 2, isSaturated: false },
  { id: "R2C3", name: "Bright Orange", hex: "#FF8800", rgb: [255, 136, 0],   row: 2, col: 3, isSaturated: false },
  { id: "R2C4", name: "Light Orange",  hex: "#FFBB66", rgb: [255, 187, 102], row: 2, col: 4, isSaturated: false },
  { id: "R2C5", name: "Peach",         hex: "#FFCC99", rgb: [255, 204, 153], row: 2, col: 5, isSaturated: false },
  { id: "R2C6", name: "Pale Peach",    hex: "#FFE0CC", rgb: [255, 224, 204], row: 2, col: 6, isSaturated: false },
  { id: "R2C7", name: "Cream",         hex: "#FFF0E5", rgb: [255, 240, 229], row: 2, col: 7, isSaturated: false },

  // Row 3: Yellows
  { id: "R3C1", name: "Dark Yellow",   hex: "#998800", rgb: [153, 136, 0],   row: 3, col: 1, isSaturated: false },
  { id: "R3C2", name: "Yellow",        hex: "#CCBB00", rgb: [204, 187, 0],   row: 3, col: 2, isSaturated: false },
  { id: "R3C3", name: "Bright Yellow", hex: "#FFEE00", rgb: [255, 238, 0],   row: 3, col: 3, isSaturated: false },
  { id: "R3C4", name: "Light Yellow",  hex: "#FFF566", rgb: [255, 245, 102], row: 3, col: 4, isSaturated: false },
  { id: "R3C5", name: "Pale Yellow",   hex: "#FFF899", rgb: [255, 248, 153], row: 3, col: 5, isSaturated: false },
  { id: "R3C6", name: "Ivory",         hex: "#FFFBCC", rgb: [255, 251, 204], row: 3, col: 6, isSaturated: false },
  { id: "R3C7", name: "Lemon White",   hex: "#FFFDE5", rgb: [255, 253, 229], row: 3, col: 7, isSaturated: false },

  // Row 4: Greens
  { id: "R4C1", name: "Dark Green",    hex: "#006600", rgb: [0, 102, 0],     row: 4, col: 1, isSaturated: false },
  { id: "R4C2", name: "Green",         hex: "#009900", rgb: [0, 153, 0],     row: 4, col: 2, isSaturated: false },
  { id: "R4C3", name: "Bright Green",  hex: "#00CC00", rgb: [0, 204, 0],     row: 4, col: 3, isSaturated: false },
  { id: "R4C4", name: "Light Green",   hex: "#66DD66", rgb: [102, 221, 102], row: 4, col: 4, isSaturated: false },
  { id: "R4C5", name: "Pale Green",    hex: "#99EE99", rgb: [153, 238, 153], row: 4, col: 5, isSaturated: false },
  { id: "R4C6", name: "Mint",          hex: "#CCF5CC", rgb: [204, 245, 204], row: 4, col: 6, isSaturated: false },
  { id: "R4C7", name: "Green White",   hex: "#E5FAE5", rgb: [229, 250, 229], row: 4, col: 7, isSaturated: false },

  // Row 5: Cyans
  { id: "R5C1", name: "Dark Cyan",     hex: "#006666", rgb: [0, 102, 102],   row: 5, col: 1, isSaturated: false },
  { id: "R5C2", name: "Cyan",          hex: "#009999", rgb: [0, 153, 153],   row: 5, col: 2, isSaturated: false },
  { id: "R5C3", name: "Bright Cyan",   hex: "#00CCCC", rgb: [0, 204, 204],   row: 5, col: 3, isSaturated: false },
  { id: "R5C4", name: "Light Cyan",    hex: "#66DDDD", rgb: [102, 221, 221], row: 5, col: 4, isSaturated: false },
  { id: "R5C5", name: "Pale Cyan",     hex: "#99EEEE", rgb: [153, 238, 238], row: 5, col: 5, isSaturated: false },
  { id: "R5C6", name: "Ice",           hex: "#CCF5F5", rgb: [204, 245, 245], row: 5, col: 6, isSaturated: false },
  { id: "R5C7", name: "Cyan White",    hex: "#E5FAFA", rgb: [229, 250, 250], row: 5, col: 7, isSaturated: false },

  // Row 6: Blues
  { id: "R6C1", name: "Dark Blue",     hex: "#000088", rgb: [0, 0, 136],     row: 6, col: 1, isSaturated: false },
  { id: "R6C2", name: "Blue",          hex: "#0000CC", rgb: [0, 0, 204],     row: 6, col: 2, isSaturated: false },
  { id: "R6C3", name: "Bright Blue",   hex: "#0044FF", rgb: [0, 68, 255],    row: 6, col: 3, isSaturated: false },
  { id: "R6C4", name: "Light Blue",    hex: "#6688FF", rgb: [102, 136, 255], row: 6, col: 4, isSaturated: false },
  { id: "R6C5", name: "Pale Blue",     hex: "#99BBFF", rgb: [153, 187, 255], row: 6, col: 5, isSaturated: false },
  { id: "R6C6", name: "Sky",           hex: "#CCDDFF", rgb: [204, 221, 255], row: 6, col: 6, isSaturated: false },
  { id: "R6C7", name: "Blue White",    hex: "#E5EEFF", rgb: [229, 238, 255], row: 6, col: 7, isSaturated: false },

  // Row 7: Purples
  { id: "R7C1", name: "Dark Purple",   hex: "#440088", rgb: [68, 0, 136],    row: 7, col: 1, isSaturated: false },
  { id: "R7C2", name: "Purple",        hex: "#6600CC", rgb: [102, 0, 204],   row: 7, col: 2, isSaturated: false },
  { id: "R7C3", name: "Bright Purple", hex: "#8800FF", rgb: [136, 0, 255],   row: 7, col: 3, isSaturated: false },
  { id: "R7C4", name: "Light Purple",  hex: "#AA66FF", rgb: [170, 102, 255], row: 7, col: 4, isSaturated: false },
  { id: "R7C5", name: "Pale Purple",   hex: "#CC99FF", rgb: [204, 153, 255], row: 7, col: 5, isSaturated: false },
  { id: "R7C6", name: "Lavender",      hex: "#E0CCFF", rgb: [224, 204, 255], row: 7, col: 6, isSaturated: false },
  { id: "R7C7", name: "Purple White",  hex: "#F0E5FF", rgb: [240, 229, 255], row: 7, col: 7, isSaturated: false },

  // Row 8: Pinks
  { id: "R8C1", name: "Dark Pink",     hex: "#880044", rgb: [136, 0, 68],    row: 8, col: 1, isSaturated: false },
  { id: "R8C2", name: "Pink",          hex: "#CC0066", rgb: [204, 0, 102],   row: 8, col: 2, isSaturated: false },
  { id: "R8C3", name: "Bright Pink",   hex: "#FF0088", rgb: [255, 0, 136],   row: 8, col: 3, isSaturated: false },
  { id: "R8C4", name: "Light Pink",    hex: "#FF66AA", rgb: [255, 102, 170], row: 8, col: 4, isSaturated: false },
  { id: "R8C5", name: "Pale Pink",     hex: "#FF99CC", rgb: [255, 153, 204], row: 8, col: 5, isSaturated: false },
  { id: "R8C6", name: "Blush",         hex: "#FFCCDD", rgb: [255, 204, 221], row: 8, col: 6, isSaturated: false },
  { id: "R8C7", name: "Pink White",    hex: "#FFE5EE", rgb: [255, 229, 238], row: 8, col: 7, isSaturated: false },

  // Row 9: Browns / Skin tones
  { id: "R9C1", name: "Dark Brown",    hex: "#553300", rgb: [85, 51, 0],     row: 9, col: 1, isSaturated: false },
  { id: "R9C2", name: "Brown",         hex: "#885522", rgb: [136, 85, 34],   row: 9, col: 2, isSaturated: false },
  { id: "R9C3", name: "Tan",           hex: "#BB8844", rgb: [187, 136, 68],  row: 9, col: 3, isSaturated: false },
  { id: "R9C4", name: "Light Tan",     hex: "#DDAA66", rgb: [221, 170, 102], row: 9, col: 4, isSaturated: false },
  { id: "R9C5", name: "Beige",         hex: "#EECCAA", rgb: [238, 204, 170], row: 9, col: 5, isSaturated: false },
  { id: "R9C6", name: "Pale Beige",    hex: "#F5E0CC", rgb: [245, 224, 204], row: 9, col: 6, isSaturated: false },
  { id: "R9C7", name: "Beige White",   hex: "#FAF0E5", rgb: [250, 240, 229], row: 9, col: 7, isSaturated: false },

  // Row 10: Grays
  { id: "R10C1", name: "Black",        hex: "#000000", rgb: [0, 0, 0],       row: 10, col: 1, isSaturated: false },
  { id: "R10C2", name: "Dark Gray",    hex: "#333333", rgb: [51, 51, 51],    row: 10, col: 2, isSaturated: false },
  { id: "R10C3", name: "Gray",         hex: "#666666", rgb: [102, 102, 102], row: 10, col: 3, isSaturated: false },
  { id: "R10C4", name: "Medium Gray",  hex: "#999999", rgb: [153, 153, 153], row: 10, col: 4, isSaturated: false },
  { id: "R10C5", name: "Light Gray",   hex: "#BBBBBB", rgb: [187, 187, 187], row: 10, col: 5, isSaturated: false },
  { id: "R10C6", name: "Pale Gray",    hex: "#DDDDDD", rgb: [221, 221, 221], row: 10, col: 6, isSaturated: false },
  { id: "R10C7", name: "White",        hex: "#FFFFFF", rgb: [255, 255, 255], row: 10, col: 7, isSaturated: false },

  // Row 11: Warm Grays
  { id: "R11C1", name: "Charcoal",     hex: "#1A1100", rgb: [26, 17, 0],     row: 11, col: 1, isSaturated: false },
  { id: "R11C2", name: "Dark Warm Gray",hex: "#443322", rgb: [68, 51, 34],   row: 11, col: 2, isSaturated: false },
  { id: "R11C3", name: "Warm Gray",    hex: "#776655", rgb: [119, 102, 85],  row: 11, col: 3, isSaturated: false },
  { id: "R11C4", name: "Medium Warm Gray",hex: "#AA9988", rgb: [170, 153, 136], row: 11, col: 4, isSaturated: false },
  { id: "R11C5", name: "Light Warm Gray",hex: "#CCBBAA", rgb: [204, 187, 170], row: 11, col: 5, isSaturated: false },
  { id: "R11C6", name: "Pale Warm Gray",hex: "#E5DDCC", rgb: [229, 221, 204], row: 11, col: 6, isSaturated: false },
  { id: "R11C7", name: "Warm White",   hex: "#F5F0E5", rgb: [245, 240, 229], row: 11, col: 7, isSaturated: false },

  // Saturated extras (Row 12)
  { id: "S1", name: "Pure Red",        hex: "#FF0000", rgb: [255, 0, 0],     row: 12, col: 1, isSaturated: true },
  { id: "S2", name: "Pure Orange",     hex: "#FF8800", rgb: [255, 136, 0],   row: 12, col: 2, isSaturated: true },
  { id: "S3", name: "Pure Yellow",     hex: "#FFFF00", rgb: [255, 255, 0],   row: 12, col: 3, isSaturated: true },
  { id: "S4", name: "Pure Green",      hex: "#00FF00", rgb: [0, 255, 0],     row: 12, col: 4, isSaturated: true },
  { id: "S5", name: "Pure Cyan",       hex: "#00FFFF", rgb: [0, 255, 255],   row: 12, col: 5, isSaturated: true },
  { id: "S6", name: "Pure Blue",       hex: "#0000FF", rgb: [0, 0, 255],     row: 12, col: 6, isSaturated: true },
  { id: "S7", name: "Pure Magenta",    hex: "#FF00FF", rgb: [255, 0, 255],   row: 12, col: 7, isSaturated: true },
];

/** Lookup a palette color by its ID */
export function getPaletteColor(id: string): PaletteColor | undefined {
  return TOMODACHI_PALETTE.find((c) => c.id === id);
}

/** Get all base (non-saturated) palette colors */
export function getBasePalette(): PaletteColor[] {
  return TOMODACHI_PALETTE.filter((c) => !c.isSaturated);
}

/** Get only the saturated extras */
export function getSaturatedExtras(): PaletteColor[] {
  return TOMODACHI_PALETTE.filter((c) => c.isSaturated);
}

/** Get palette colors organized by row */
export function getPaletteByRow(): Map<number, PaletteColor[]> {
  const map = new Map<number, PaletteColor[]>();
  for (const color of TOMODACHI_PALETTE) {
    const row = map.get(color.row) ?? [];
    row.push(color);
    map.set(color.row, row);
  }
  return map;
}
