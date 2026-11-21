import { describe, expect, it } from "vitest";
import { sniffImage, stripJpeg, stripPng, stripWebp } from "../src/server/image";

const seg = (marker: number, payload: number[]) => [0xff, marker, ((payload.length + 2) >> 8) & 255, (payload.length + 2) & 255, ...payload];
const txt = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("image type detection", () => {
  it("detects by bytes, not by name", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImage(new Uint8Array([...txt("RIFF"), 0, 0, 0, 0, ...txt("WEBP")]))).toBe("image/webp");
    expect(sniffImage(new Uint8Array(txt("<svg onload=alert(1)>")))).toBeNull();
    expect(sniffImage(new Uint8Array(txt("GIF89a")))).toBeNull();
  });
});

describe("metadata stripping", () => {
  it("JPEG: removes EXIF (APP1) and comments, keeps JFIF and image data", () => {
    const jfif = seg(0xe0, txt("JFIF\0"));
    const exif = seg(0xe1, txt("Exif\0\0GPS-LOCATION"));
    const com = seg(0xfe, txt("secret comment"));
    const dqt = seg(0xdb, [0, 1, 2, 3]);
    const scan = [0xff, 0xda, 0, 4, 1, 2, 9, 9, 9, 0xff, 0xd9];
    const input = new Uint8Array([0xff, 0xd8, ...jfif, ...exif, ...com, ...dqt, ...scan]);
    const out = stripJpeg(input);
    expect(Array.from(out)).toEqual([0xff, 0xd8, ...jfif, ...dqt, ...scan]);
    expect(new TextDecoder().decode(out)).not.toContain("GPS");
  });

  it("JPEG: rejects broken files", () => {
    expect(() => stripJpeg(new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0x00]))).toThrow();
  });

  it("PNG: removes text and eXIf chunks", () => {
    const chunk = (type: string, data: number[]) => {
      const len = data.length;
      return [(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...txt(type), ...data, 0, 0, 0, 0];
    };
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const ihdr = chunk("IHDR", new Array(13).fill(1));
    const text = chunk("tEXt", txt("Author\0Ali"));
    const exif = chunk("eXIf", txt("GPS"));
    const idat = chunk("IDAT", [1, 2, 3]);
    const iend = chunk("IEND", []);
    const out = stripPng(new Uint8Array([...sig, ...ihdr, ...text, ...exif, ...idat, ...iend]));
    expect(Array.from(out)).toEqual([...sig, ...ihdr, ...idat, ...iend]);
  });

  it("WebP: removes EXIF/XMP chunks, clears flags and fixes the RIFF size", () => {
    const chunk = (type: string, data: number[]) => {
      const len = data.length;
      return [...txt(type), len & 255, (len >> 8) & 255, (len >> 16) & 255, (len >>> 24) & 255, ...data, ...(len % 2 ? [0] : [])];
    };
    const vp8x = chunk("VP8X", [0x0c, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const img = chunk("VP8 ", [1, 2, 3, 4]);
    const exif = chunk("EXIF", txt("GPS!"));
    const body = [...vp8x, ...img, ...exif];
    const n = 4 + body.length;
    const input = new Uint8Array([...txt("RIFF"), n & 255, (n >> 8) & 255, 0, 0, ...txt("WEBP"), ...body]);
    const out = stripWebp(input);
    const dv = new DataView(out.buffer);
    expect(dv.getUint32(4, true)).toBe(out.length - 8);
    expect(out[20]).toBe(0); // VP8X flags cleared
    expect(new TextDecoder().decode(out)).not.toContain("GPS");
    expect(new TextDecoder().decode(out)).toContain("VP8 ");
  });
});
