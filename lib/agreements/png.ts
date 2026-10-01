import { inflateSync } from "zlib";

// The drawn signature mark arrives as a canvas `toDataURL("image/png")` —
// an 8-bit non-interlaced RGBA PNG. The sealed PDF is hand-rolled (no deps),
// so this is the minimal decoder it needs: parse chunks, inflate IDAT,
// undo the per-scanline filters, composite alpha over white, hand back raw
// RGB for a /DeviceRGB image XObject. Anything unexpected → null, and the
// PDF falls back to the "mark is stored with this record" note.

export type DecodedPng = { width: number; height: number; rgb: Buffer };

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };

export function decodePngToRgb(dataUrlOrBase64: string): DecodedPng | null {
  try {
    const b64 = dataUrlOrBase64.startsWith("data:")
      ? dataUrlOrBase64.slice(dataUrlOrBase64.indexOf(",") + 1)
      : dataUrlOrBase64;
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;

    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlace = 0;
    const idat: Buffer[] = [];
    let off = 8;
    while (off + 12 <= buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString("latin1", off + 4, off + 8);
      const data = buf.subarray(off + 8, off + 8 + len);
      if (type === "IHDR") {
        width = data.readUInt32BE(0);
        height = data.readUInt32BE(4);
        bitDepth = data[8];
        colorType = data[9];
        interlace = data[12];
      } else if (type === "IDAT") idat.push(data);
      else if (type === "IEND") break;
      off += 12 + len;
    }
    const channels = CHANNELS[colorType];
    if (!width || !height || bitDepth !== 8 || interlace !== 0 || !channels || idat.length === 0) return null;

    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    if (raw.length < height * (stride + 1)) return null;

    // Undo PNG scanline filters (0 none, 1 sub, 2 up, 3 average, 4 paeth).
    const px = Buffer.alloc(height * stride);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      const rowIn = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
      const row = px.subarray(y * stride, (y + 1) * stride);
      const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? row[x - channels] : 0;
        const b = prev ? prev[x] : 0;
        const c = x >= channels && prev ? prev[x - channels] : 0;
        let v = rowIn[x];
        if (filter === 1) v = (v + a) & 0xff;
        else if (filter === 2) v = (v + b) & 0xff;
        else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
        else if (filter === 4) {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
        }
        row[x] = v;
      }
    }

    // Composite over white (the pad's clear areas are transparent) → RGB.
    const rgb = Buffer.alloc(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      const s = i * channels;
      let r: number;
      let g: number;
      let b: number;
      let a = 255;
      if (colorType === 0) r = g = b = px[s];
      else if (colorType === 4) {
        r = g = b = px[s];
        a = px[s + 1];
      } else if (colorType === 2) {
        r = px[s];
        g = px[s + 1];
        b = px[s + 2];
      } else {
        r = px[s];
        g = px[s + 1];
        b = px[s + 2];
        a = px[s + 3];
      }
      const d = i * 3;
      rgb[d] = Math.round((r * a + 255 * (255 - a)) / 255);
      rgb[d + 1] = Math.round((g * a + 255 * (255 - a)) / 255);
      rgb[d + 2] = Math.round((b * a + 255 * (255 - a)) / 255);
    }
    return { width, height, rgb };
  } catch {
    return null;
  }
}
