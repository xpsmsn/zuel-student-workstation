/* 裁一块并放大（最近邻）另存为 PNG，用来目视确认 2px 焦点环这种小细节。
   用法：node .verify/png-crop.mjs in.png out.png x y w h [scale] */
import fs from 'node:fs';
import zlib from 'node:zlib';

function decode(file){
  const buf = fs.readFileSync(file);
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while(pos < buf.length){
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if(type === 'IHDR'){ w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; interlace = data[12]; }
    else if(type === 'IDAT') idat.push(data);
    else if(type === 'IEND') break;
    pos += 12 + len;
  }
  if(bitDepth !== 8 || interlace !== 0) throw new Error('unsupported png');
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if(!ch) throw new Error('unsupported color type ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for(let y = 0; y < h; y++){
    const filter = raw[y * (stride + 1)];
    const cur = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for(let x = 0; x < stride; x++){
      const a = x >= ch ? cur[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if(filter === 1) cur[x] = (cur[x] + a) & 255;
      else if(filter === 2) cur[x] = (cur[x] + b) & 255;
      else if(filter === 3) cur[x] = (cur[x] + ((a + b) >> 1)) & 255;
      else if(filter === 4){
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    cur.copy(out, y * stride); prev = cur;
  }
  return { w, h, ch, pixels: out };
}

const table = (() => {
  const t = new Int32Array(256);
  for(let n = 0; n < 256; n++){
    let c = n;
    for(let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf){
  let c = -1;
  for(let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encode(w, h, rgb){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rows = Buffer.alloc(h * (w * 3 + 1));
  for(let y = 0; y < h; y++){
    rows[y * (w * 3 + 1)] = 0;
    rgb.copy(rows, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const [inp, outp, xs, ys, ws, hs, ss] = process.argv.slice(2);
const src = decode(inp);
const x0 = Math.max(0, +xs), y0 = Math.max(0, +ys);
const w = Math.min(+ws, src.w - x0), h = Math.min(+hs, src.h - y0);
const scale = Math.max(1, +(ss || 1));
const W = w * scale, H = h * scale;
const rgb = Buffer.alloc(W * H * 3);
for(let y = 0; y < H; y++){
  const sy = y0 + Math.floor(y / scale);
  for(let x = 0; x < W; x++){
    const sx = x0 + Math.floor(x / scale);
    const si = (sy * src.w + sx) * src.ch, di = (y * W + x) * 3;
    rgb[di] = src.pixels[si]; rgb[di + 1] = src.pixels[si + 1]; rgb[di + 2] = src.pixels[si + 2];
  }
}
fs.writeFileSync(outp, encode(W, H, rgb));
console.log(JSON.stringify({ out: outp, from: [x0, y0, w, h], zoom: scale, size: [W, H] }));
