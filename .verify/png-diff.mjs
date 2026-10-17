/* 逐像素比较两张同尺寸 PNG，输出差异像素数与包围盒。
   ｜为什么要这个：两张截图字节不同不代表改了样式，可能只是页面上轮播的金句不同。
   ｜用法：node .verify/png-diff.mjs a.png b.png [--write-diff out.png] */
import fs from 'node:fs';
import zlib from 'node:zlib';

function decode(file){
  const buf = fs.readFileSync(file);
  if(buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not png: ' + file);
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let palette = null;
  while(pos < buf.length){
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if(type === 'IHDR'){
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if(type === 'IDAT'){ idat.push(data); }
    else if(type === 'PLTE'){ palette = Buffer.from(data); }
    else if(type === 'IEND'){ break; }
    pos += 12 + len;
  }
  if(bitDepth !== 8) throw new Error('only 8-bit png supported');
  if(interlace !== 0) throw new Error('interlaced png not supported');
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if(!ch) throw new Error('unsupported color type ' + colorType);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for(let y = 0; y < h; y++){
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = Buffer.from(line);
    for(let x = 0; x < stride; x++){
      const a = x >= ch ? cur[x - ch] : 0;
      const b = prev[x];
      const c = x >= ch ? prev[x - ch] : 0;
      switch(filter){
        case 0: break;
        case 1: cur[x] = (cur[x] + a) & 255; break;
        case 2: cur[x] = (cur[x] + b) & 255; break;
        case 3: cur[x] = (cur[x] + ((a + b) >> 1)) & 255; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          cur[x] = (cur[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
          break;
        }
        default: throw new Error('bad filter ' + filter + ' at row ' + y);
      }
    }
    cur.copy(out, y * stride);
    prev = cur;
  }
  return { w, h, ch, colorType, palette, pixels: out };
}

const [fa, fb] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const A = decode(fa), B = decode(fb);
if(A.w !== B.w || A.h !== B.h || A.ch !== B.ch) {
  console.log(JSON.stringify({ error: 'size/channel mismatch', a: [A.w, A.h, A.ch], b: [B.w, B.h, B.ch] }));
  process.exit(0);
}
const ch = A.ch;
let count = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
const rowHits = new Map();
for(let y = 0; y < A.h; y++){
  for(let x = 0; x < A.w; x++){
    const i = (y * A.w + x) * ch;
    let diff = false;
    for(let k = 0; k < ch; k++){ if(A.pixels[i + k] !== B.pixels[i + k]){ diff = true; break; } }
    if(diff){
      count++;
      if(x < minX) minX = x; if(x > maxX) maxX = x;
      if(y < minY) minY = y; if(y > maxY) maxY = y;
      rowHits.set(y, (rowHits.get(y) || 0) + 1);
    }
  }
}
const bands = [];
for(const [y, n] of [...rowHits.entries()].sort((p, q) => p[0] - q[0])){
  const last = bands[bands.length - 1];
  if(last && y - last.y1 <= 2){ last.y1 = y; last.px += n; }
  else bands.push({ y0: y, y1: y, px: n });
}
console.log(JSON.stringify({
  size: [A.w, A.h], total: A.w * A.h,
  diffPixels: count,
  ratio: +(count / (A.w * A.h) * 100).toFixed(4),
  bbox: count ? { x0: minX, y0: minY, x1: maxX, y1: maxY } : null,
  bands: bands.map(b => ({ y0: b.y0, y1: b.y1, px: b.px })),
}, null, 2));
