// Generates the app icons (PNG) without image libraries: brand purple tile with a white "L".
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function icon(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * (size * 4 + 1));
  const pad = maskable ? 0.22 : 0.14; // maskable icons keep the mark inside the safe zone
  const inL = (x, y) => {
    const u = x / size, v = y / size;
    const stem = u >= 0.30 + pad / 2 && u <= 0.44 + pad / 2 && v >= pad + 0.12 && v <= 1 - pad - 0.12;
    const foot = u >= 0.30 + pad / 2 && u <= 0.72 - pad / 2 && v >= 1 - pad - 0.26 && v <= 1 - pad - 0.12;
    return stem || foot;
  };
  for (let y = 0; y < size; y++) {
    px[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const [r, g, b] = inL(x, y) ? [255, 255, 255] : [0x46, 0x00, 0x73];
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(px)), chunk("IEND", Buffer.alloc(0))]);
}

writeFileSync("public/icons/icon-192.png", icon(192));
writeFileSync("public/icons/icon-512.png", icon(512));
writeFileSync("public/icons/icon-maskable-512.png", icon(512, { maskable: true }));
writeFileSync("src/app/apple-icon.png", icon(180));
console.log("icons written");
