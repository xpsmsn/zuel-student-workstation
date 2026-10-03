/* ══════════════════════════════════════════════════════════════════════
   宿舍解析（纯函数）
   ────────────────────────────────────────────────────────────────────────
   把一条学生记录里的住宿信息解析成「房间 key + 床位号」。
   零 DOM、零状态 —— 所以它住 domain 层，任何人都能在 node 里直接测。

   ── 为什么从 dorm.js 搬出来 ────────────────────────────────────────────
   它原先住在 modules/dorm.js，而页面注册表在**启动时**就要问一句
   「宿舍看板本批能不能用」（disabled() → dormRoomCount()）。
   于是形成一条跨越模块的加载期依赖：
       enterApp() → renderSidebar() → 注册表 disabled() → dormRoomCount()
                → dormParts() → _s（还在 TDZ 里）→ 整个应用起不来
   报错是 "Cannot access '_s' before initialization"。

   搬进 domain 后它在内核之后、页面之前就绪 —— 问题从根上消失，
   而不是靠调整拼接顺序碰运气。
   ══════════════════════════════════════════════════════════════════════ */

const _s = v => String(v == null ? '' : v).trim();
const _n = v => { const m = _s(v).match(/\d+/); return m ? Number(m[0]) : null; };

/* 把「楼栋+房号」挤在一起的写法（滨湖1栋634）归一成「楼栋-房号」（滨湖1栋-634）。
   目的：12 列模板（只有「住宿地址」）与 41 列模板（三列分开）算出的房间 key 必须一致，
   否则同一批数据会被拆成两套房间、空位统计全废。已是「楼-房」形态的原样返回。 */
function _normRoomKey(str){
  const k = _s(str);
  if(!k || k.indexOf('-') > 0) return k;              // 已是 楼-房
  const m = k.match(/^(.*[^\d])\s*(\d{1,4})$/);       // 末尾 1~4 位数字 = 房号
  return m ? (m[1].replace(/[-\s]+$/,'') + '-' + m[2]) : k;
}

/* 解析「房间 key + 床位号」。三种表结构都要吃下，这是本看板最容易做错的地方：
   · 新模板：宿舍楼=滨湖1栋 / 房间号=634 / 床位号=03   —— 三列分开，最干净
   · 旧表　：宿舍=100栋-101 / 床位=01床                —— 房号与床位各占一列
   · 兜底　：宿舍=滨湖1栋634-03                        —— 房号与床位挤在同一列
   ⚠ 若一律"按第一个 - 切开"，「滨湖1栋634-03」会被拆成
     楼栋「滨湖1栋634」+ 房间「03」→ 189 人变成 188 间房，空位统计全废。 */
function dormParts(s){
  if(!s) return { key:'', bed:null };
  const b = _s(s['宿舍楼']), r = _s(s['房间号']);
  // v2.2：新导入的「床位号」已归一到「床位」；仍读两个名字是为了**兼容归一之前已入库的旧批次**
  const bedCol = _n(s['床位号']) != null ? _n(s['床位号']) : _n(s['床位']);
  if(b && r) return { key: _normRoomKey(b + '-' + r), bed: bedCol };   // ① 三列分开
  const a = _s(s['宿舍']);
  if(!a) return { key:'', bed: bedCol };
  const seg = a.split('-').map(x=>x.trim()).filter(Boolean);
  if(seg.length >= 2){
    const last = _n(seg[seg.length - 1]);
    const prev = seg.slice(0, seg.length - 1).join('-');
    // 末段是"床位"而非"房间号"的三条判据：
    //   段数≥3 ／ 与床位列一致且是个小数字 ／ 无床位列但末段是床位号、前段以房号（3~4 位数字）结尾
    const isBed = seg.length >= 3
      || (bedCol != null && last != null && last === bedCol && last <= 12)
      || (bedCol == null && last != null && last >= 1 && last <= 12 && /\d{3,4}$/.test(prev));
    if(isBed) return { key: _normRoomKey(prev), bed: bedCol != null ? bedCol : last };
  }
  return { key: _normRoomKey(a), bed: bedCol };                        // ② 旧表：楼-房
}
function dormKey(s){ return dormParts(s).key; }
function bedNo(s){ return dormParts(s).bed; }
function dormBuilding(key){
  const i = String(key).indexOf('-');
  return i > 0 ? String(key).slice(0, i) : '';
}
