import type { SupportedGeneratedImageMime } from "./openrouter-images";

export interface GeneratedImageDimensions {
  height: number;
  width: number;
}

/**
 * Read dimensions from the bounded raster formats accepted from the image
 * provider. This inspects only headers; it never asks a browser or native
 * decoder to allocate the declared pixel surface.
 */
export function readGeneratedImageDimensions(
  bytes: Uint8Array,
  mimeType: SupportedGeneratedImageMime,
): GeneratedImageDimensions | null {
  if (mimeType === "image/png") return readPngDimensions(bytes);
  if (mimeType === "image/jpeg") return readJpegDimensions(bytes);
  return readWebpDimensions(bytes);
}

function readPngDimensions(bytes: Uint8Array): GeneratedImageDimensions | null {
  if (
    bytes.byteLength < 24 ||
    bytes[12] !== 0x49 ||
    bytes[13] !== 0x48 ||
    bytes[14] !== 0x44 ||
    bytes[15] !== 0x52
  ) {
    return null;
  }
  return validDimensions(
    readUint32BigEndian(bytes, 16),
    readUint32BigEndian(bytes, 20),
  );
}

function readJpegDimensions(
  bytes: Uint8Array,
): GeneratedImageDimensions | null {
  let offset = 2;
  while (offset + 1 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.byteLength && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.byteLength) return null;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) return null;
    if (
      marker === 0x01 ||
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      continue;
    }
    if (offset + 1 >= bytes.byteLength) return null;
    const segmentLength = readUint16BigEndian(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      return null;
    }
    if (isStartOfFrame(marker)) {
      if (segmentLength < 7) return null;
      return validDimensions(
        readUint16BigEndian(bytes, offset + 5),
        readUint16BigEndian(bytes, offset + 3),
      );
    }
    offset += segmentLength;
  }
  return null;
}

function readWebpDimensions(
  bytes: Uint8Array,
): GeneratedImageDimensions | null {
  if (bytes.byteLength < 25) return null;
  const chunk = String.fromCharCode(
    bytes[12] ?? 0,
    bytes[13] ?? 0,
    bytes[14] ?? 0,
    bytes[15] ?? 0,
  );

  if (chunk === "VP8X") {
    if (bytes.byteLength < 30) return null;
    return validDimensions(
      1 + readUint24LittleEndian(bytes, 24),
      1 + readUint24LittleEndian(bytes, 27),
    );
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    return validDimensions(
      1 + (bytes[21] ?? 0) + (((bytes[22] ?? 0) & 0x3f) << 8),
      1 +
        (((bytes[22] ?? 0) & 0xc0) >> 6) +
        ((bytes[23] ?? 0) << 2) +
        (((bytes[24] ?? 0) & 0x0f) << 10),
    );
  }
  if (chunk === "VP8 ") {
    if (
      bytes.byteLength < 30 ||
      bytes[23] !== 0x9d ||
      bytes[24] !== 0x01 ||
      bytes[25] !== 0x2a
    ) {
      return null;
    }
    return validDimensions(
      readUint16LittleEndian(bytes, 26) & 0x3fff,
      readUint16LittleEndian(bytes, 28) & 0x3fff,
    );
  }
  return null;
}

function isStartOfFrame(marker: number): boolean {
  return (
    marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
  );
}

function validDimensions(
  width: number,
  height: number,
): GeneratedImageDimensions | null {
  return width > 0 && height > 0 ? { height, width } : null;
}

function readUint16BigEndian(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint16LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readUint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  );
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}
