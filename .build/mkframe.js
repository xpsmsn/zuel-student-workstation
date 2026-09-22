/* 生成 iframe 包裹页：Edge 无头最小窗口约 500px，用 iframe 才能拿到真实的 390/430/560 视口 */
const fs = require('fs'), path = require('path');
const [src, widthsArg, outPrefix, diag] = process.argv.slice(2);
const widths = (widthsArg || '390,430,560,768').split(',').map(Number);
const diagSnippet = diag === 'diag' ? fs.readFileSync(path.join(__dirname, 'diag-snippet.js'), 'utf8') : '';

widths.forEach(w => {
  const h = Number(process.env.H || 2600);
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#8b93a5;font:12px/1.5 Consolas,monospace}
  .wrap{display:flex;gap:14px;padding:14px;align-items:flex-start}
  .col{background:#fff}
  .cap{color:#fff;padding:2px 6px;font-weight:700}
  iframe{display:block;border:0;width:${w}px;height:${h}px;background:#fff}
  pre{background:#111;color:#7CFC9A;padding:10px;margin:0;white-space:pre-wrap;max-width:${w}px;font-size:11px}
  </style></head><body>
  <div class="wrap"><div class="col"><div class="cap">width = ${w}px</div>
  <iframe id="f" src="${path.basename(src)}"></iframe>
  ${diagSnippet ? '<pre id="out">(waiting)</pre>' : ''}
  </div></div>
  ${diagSnippet ? `<script>${diagSnippet}
  window.addEventListener('load', function(){
    setTimeout(function(){
      try{
        var doc = document.getElementById('f').contentDocument;
        var p = doc.getElementById('__diag__');
        document.getElementById('out').textContent = p ? p.textContent : 'NO __diag__ in iframe';
      }catch(e){ document.getElementById('out').textContent = 'ERR ' + e.message; }
    }, 900);
  });</script>` : ''}
  </body></html>`;
  fs.writeFileSync(path.join(__dirname, `${outPrefix}-${w}.html`), html);
});
console.log('frames written:', widths.join(','));
