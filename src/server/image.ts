// Image checks without native libraries: detect the real type from the bytes and strip metadata
// (EXIF incl. GPS location, XMP, comments). The phone already re-encodes to JPEG; this is the server-side guard.

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

export function sniffImage(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp";
  return null;
}

function ascii(b: Uint8Array, at: number, len: number) {
  return String.fromCharCode(...b.subarray(at, at + len));
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** JPEG: keep APP0 (JFIF) and APP14 (Adobe colour info); drop APP1–APP13, APP15 and comments. */
export function stripJpeg(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error("bad_jpeg");
    const marker = b[i + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      parts.push(b.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) {
      parts.push(b.subarray(i)); // start of scan: copy the image data unchanged
      return concat(parts);
    }
    const len = (b[i + 2] << 8) | b[i + 3];
    const end = i + 2 + len;
    if (len < 2 || end > b.length) throw new Error("bad_jpeg");
    const isApp = marker >= 0xe0 && marker <= 0xef;
    const keep = !(isApp && marker !== 0xe0 && marker !== 0xee) && marker !== 0xfe;
    if (keep) parts.push(b.subarray(i, end));
    i = end;
  }
  throw new Error("bad_jpeg");
}

const PNG_DROP = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

export function stripPng(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [b.subarray(0, 8)];
  let i = 8;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (i + 12 <= b.length) {
    const len = dv.getUint32(i);
    const type = ascii(b, i + 4, 4);
    const end = i + 12 + len;
    if (end > b.length) throw new Error("bad_png");
    if (!PNG_DROP.has(type)) parts.push(b.subarray(i, end));
    i = end;
    if (type === "IEND") return concat(parts);
  }
  throw new Error("bad_png");
}

export function stripWebp(b: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let i = 12;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (i + 8 <= b.length) {
    const type = ascii(b, i, 4);
    const len = dv.getUint32(i + 4, true);
    const end = i + 8 + len + (len % 2);
    if (i + 8 + len > b.length) throw new Error("bad_webp");
    if (type !== "EXIF" && type !== "XMP ") {
      const chunk = b.slice(i, Math.min(end, b.length));
      if (type === "VP8X" && chunk.length > 8) chunk[8] &= ~(0x08 | 0x04); // clear EXIF + XMP flags
      parts.push(chunk);
    }
    i = end;
  }
  const body = concat(parts);
  const out = new Uint8Array(12 + body.length);
  out.set(b.subarray(0, 12));
  new DataView(out.buffer).setUint32(4, 4 + body.length, true);
  out.set(body, 12);
  return out;
}

export function stripMetadata(b: Uint8Array, type: ImageType): Uint8Array {
  if (type === "image/jpeg") return stripJpeg(b);
  if (type === "image/png") return stripPng(b);
  return stripWebp(b);
}
