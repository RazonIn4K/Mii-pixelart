/**
 * file-signature.ts — Magic-byte sniffing for imported image files
 *
 * File extensions and browser-reported MIME types are attacker-controlled
 * metadata. Before an imported file is handed to the browser's image decoder,
 * its leading bytes are checked against the signatures of the formats the
 * Studio actually supports. This rejects renamed files, SVG-in-PNG-clothing,
 * and polyglots whose container disagrees with their name — before any decode
 * work happens.
 *
 * Pure TypeScript: byte-level functions take a Uint8Array so they can run and
 * be tested in any runtime; only the small File helper touches Blob APIs.
 */

export type SniffedImageFormat =
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "avif"
  | "bmp"
  | "svg";

/** Bytes needed to identify every supported signature (ISO-BMFF needs slack). */
export const IMAGE_SIGNATURE_SNIFF_BYTES = 64;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** ISO-BMFF brands that identify AVIF content. */
const AVIF_BRANDS = new Set(["avif", "avis"]);

function startsWith(
  bytes: Uint8Array,
  signature: number[],
  offset = 0,
): boolean {
  if (bytes.length < offset + signature.length) return false;
  for (let i = 0; i < signature.length; i += 1) {
    if (bytes[offset + i] !== signature[i]) return false;
  }
  return true;
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let i = start; i < start + length && i < bytes.length; i += 1) {
    out += String.fromCharCode(bytes[i]);
  }
  return out;
}

function isIsoBmffAvif(bytes: Uint8Array): boolean {
  // ISO-BMFF: [4-byte box size]["ftyp"][major brand][minor version][compatible brands...]
  if (bytes.length < 12 || ascii(bytes, 4, 4) !== "ftyp") return false;
  if (AVIF_BRANDS.has(ascii(bytes, 8, 4))) return true;
  // Scan compatible brands within the sniff window (box size permitting).
  const boxSize =
    (bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
  const scanEnd = Math.min(bytes.length, boxSize > 0 ? boxSize : bytes.length);
  for (let cursor = 16; cursor + 4 <= scanEnd; cursor += 4) {
    if (AVIF_BRANDS.has(ascii(bytes, cursor, 4))) return true;
  }
  return false;
}

function looksLikeSvg(bytes: Uint8Array): boolean {
  // Skip UTF-8 BOM and leading whitespace, then look for XML/SVG markers.
  let start = 0;
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) start = 3;
  while (
    start < bytes.length &&
    (bytes[start] === 0x20 ||
      bytes[start] === 0x09 ||
      bytes[start] === 0x0a ||
      bytes[start] === 0x0d)
  ) {
    start += 1;
  }
  if (bytes[start] !== 0x3c /* "<" */) return false;
  const head = ascii(
    bytes,
    start,
    Math.min(60, bytes.length - start),
  ).toLowerCase();
  return (
    head.startsWith("<svg") || head.startsWith("<?xml") || head.includes("<svg")
  );
}

/**
 * Identify the leading bytes of a file against supported image signatures.
 * Returns null when no known signature matches.
 */
export function sniffImageFormat(bytes: Uint8Array): SniffedImageFormat | null {
  if (startsWith(bytes, PNG_SIGNATURE)) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") {
    return "gif";
  }
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "webp";
  }
  if (isIsoBmffAvif(bytes)) return "avif";
  if (ascii(bytes, 0, 2) === "BM") return "bmp";
  if (looksLikeSvg(bytes)) return "svg";
  return null;
}

const FORMAT_BY_EXTENSION = new Map<string, SniffedImageFormat>([
  ["png", "png"],
  ["jpg", "jpeg"],
  ["jpeg", "jpeg"],
  ["gif", "gif"],
  ["webp", "webp"],
  ["avif", "avif"],
  ["bmp", "bmp"],
]);

const FORMAT_BY_MIME = new Map<string, SniffedImageFormat>([
  ["image/png", "png"],
  ["image/jpeg", "jpeg"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/avif", "avif"],
  ["image/bmp", "bmp"],
  ["image/x-ms-bmp", "bmp"],
]);

/**
 * The raster format a file claims to be, derived from its extension first and
 * its declared MIME type second. Returns null when neither claims a supported
 * raster format.
 */
export function declaredImageFormat(
  fileName: string,
  mimeType: string,
): SniffedImageFormat | null {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (extension && extension !== fileName.toLowerCase()) {
    const fromExtension = FORMAT_BY_EXTENSION.get(extension);
    if (fromExtension) return fromExtension;
  }
  return FORMAT_BY_MIME.get(mimeType.trim().toLowerCase()) ?? null;
}

export type SignatureCheckResult =
  | { ok: true; format: SniffedImageFormat }
  | { ok: false; reason: "svg" | "unknown-signature" | "mismatch" };

/**
 * Compare a file's actual leading bytes against what its name/MIME claim.
 * Content wins: an unknown or contradictory signature fails closed.
 */
export function checkImageSignature(
  bytes: Uint8Array,
  fileName: string,
  mimeType: string,
): SignatureCheckResult {
  const sniffed = sniffImageFormat(bytes);
  if (sniffed === "svg") return { ok: false, reason: "svg" };
  if (sniffed === null) return { ok: false, reason: "unknown-signature" };
  const declared = declaredImageFormat(fileName, mimeType);
  if (declared !== null && declared !== sniffed) {
    return { ok: false, reason: "mismatch" };
  }
  return { ok: true, format: sniffed };
}

/** Read just enough leading bytes of a Blob/File to sniff its signature. */
export async function readFileSignature(blob: Blob): Promise<Uint8Array> {
  const head = blob.slice(0, IMAGE_SIGNATURE_SNIFF_BYTES);
  return new Uint8Array(await head.arrayBuffer());
}
