/* 二维码可扫性验证：把图片解码成 payload，用来确认压缩后依然能扫
   用法: node .build/qr-check.js <png路径> [更多路径...] */
const fs = require('fs'), path = require('path');
const jsQR = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/jsqr/dist/jsQR.js');
const { PNG } = require('C:/Users/xpsms/.workbuddy/binaries/node/workspace/node_modules/pngjs');

let bad = 0;
for(const file of process.argv.slice(2)){
  let result = '(读取失败)';
  try{
    const png = PNG.sync.read(fs.readFileSync(file));
    const r = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
    result = r ? `${r.data}   [${png.width}x${png.height}, ${fs.statSync(file).size}B]` : '✗ 解码失败（扫不出来）';
    if(!r) bad++;
  }catch(e){ result = '✗ ' + e.message; bad++; }
  console.log(path.basename(file).padEnd(34), result);
}
process.exit(bad ? 1 : 0);
