/* 生成 v1.9 的查寝打分表样本（真实走 buildDormCheckHtml）供无头截图核对 A4 横版版式 */
const fs = require('fs'), vm = require('vm');
const html = fs.readFileSync(process.argv[2], 'utf8');
function el(){ return { innerHTML:'', textContent:'', value:'', checked:false, files:null,
  style:{}, dataset:{}, classList:{ add(){}, remove(){}, contains(){ return false; }, toggle(){} },
  setAttribute(){}, getAttribute(){ return null; }, appendChild(){}, removeChild(){}, click(){}, focus(){}, select(){},
  querySelector(){ return null; }, querySelectorAll(){ return []; } }; }
const store = new Map(), cache = new Map();
const mk = id => { const e = el(); e.id = id; cache.set(id, e); return e; };
const sandbox = { console, setTimeout, clearTimeout,
  document:{ getElementById:id=>cache.has(id)?cache.get(id):mk(id), querySelector:()=>el(), querySelectorAll:()=>[],
    createElement:()=>el(), addEventListener(){}, execCommand:()=>true, body: mk('__body'),
    documentElement:{ setAttribute(){}, removeAttribute(){}, getAttribute(){ return null; } } },
  localStorage:{ getItem:k=>store.get(k)||null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) },
  location:{ reload(){} }, alert(){}, open(){},
  FileReader:function(){}, Blob:function(){}, URL:{ createObjectURL:()=>'' },
  matchMedia:()=>({ matches:false, addEventListener(){}, removeEventListener(){} }),
  ResizeObserver:function(){ this.observe=()=>{}; this.disconnect=()=>{}; },
  TextEncoder, Promise };
sandbox.window = sandbox;
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
const appSrc = blocks.filter(s=>s.includes('function doImport')).sort((a,b)=>b.length-a.length)[0];
vm.createContext(sandbox);
vm.runInContext(appSrc, sandbox, { filename:'app.js' });
const R = k => vm.runInContext(k, sandbox);

R(`S.profile = { name:'吴章凡', dept:'经济学院', phone:'', avatar:'' };`);

/* FULL=1：造一批「满员寝室」（4 人 / 6 人）专门压测「住宿人员」列的换行，
   确认不会因为 overflow:hidden 把名字裁掉。 */
if(process.env.FULL === '1'){
  const mk = (i, room, bed) => ({ 学号:`2026${String(i).padStart(5,'0')}`,
    姓名:['欧阳志远','司马海棠','上官云清','诸葛明轩','司徒雅涵','端木泽楷'][bed % 6],
    '宿舍楼':'100栋', '房间号':room, '床位号':bed, '班级':'金融2401', '专业':'金融学',
    '年级':'2024', '性别':'男', '状态':'在读', '政治面貌':'共青团员' });
  const arr = [];
  let n = 0;
  for(let k = 0; k < 12; k++){
    const cap = (k % 2 === 0) ? 4 : 6;                    // 交替 4 人 / 6 人寝
    const room = String(101 + k);
    for(let b = 1; b <= cap; b++){ arr.push(mk(++n, room, b)); }
  }
  R(`S.students = ${JSON.stringify(arr)};`);
  console.log('full-test students =', arr.length);
}

const opt = R(`dormCheckDefaults()`);
opt.title = '经济学院 2026 年 9 月宿舍卫生查寝打分表';
opt.scope = 'all';
opt.date  = '2026-09-22';
/* dormCheckOpt 是顶层 let（不挂到全局对象），必须在同一词法环境里赋值 */
R(`dormCheckOpt = ${JSON.stringify(opt)}`);
const out = R(`buildDormCheckHtml(dormCheckOpt)`);
const roomN = R(`dormRooms(S.students).filter(r=>r.key!=='').length`);
fs.writeFileSync(__dirname + '/dorm-check-sample.html', out);
console.log('rooms =', roomN, '| html', out.length, 'chars');
