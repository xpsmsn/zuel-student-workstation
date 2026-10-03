/* ════════════════════════════════════════════════════════════════════════
   features/quick-find.js —— 全局快速查找学生
   ────────────────────────────────────────────────────────────────────────
   辅导员 2026-10-03 的原话，这是本模块存在的理由：

     「学生出了事，我要尽快的查询到学生所有的信息，比如家长、电话、宿舍、
       身份证、生源地等等等等。」

   ── 现有搜索为什么不够 ────────────────────────────────────────────────
   features/filter.js 的 searchList() 只匹配 5 个字段：姓名 / 学号 / 考生号 / 电话。
   而出事的时候要查的恰恰是它**没覆盖**的那些 —— 家长电话、宿舍、身份证、生源地。

   而且路径太长：先进列表页 → 在列表上方那个输入框里打字 → 再点开详情。
   「出了事」的时候，每多一步都是代价。

   ── 本模块做三件事 ────────────────────────────────────────────────────
   ① **全字段匹配**：任何一列里能搜到都算命中（按学号前缀 > 姓名 > 其他排序）
   ② **任何位置唤起**：⌘/Ctrl+K 或直接按 / —— 不管当前在哪个页面
   ③ **档案一屏全显**：回车即开档案卡，家长/电话/宿舍/证件/生源地全在一屏里，
      **不用再点进详情页翻**

   ⚠️ 边界：证件号也参与搜索，但**不在结果里明文显示**（只显示后 4 位）。
      理由：这是本机应用，但屏幕是会被别人看到的。
   ════════════════════════════════════════════════════════════════════════ */

/** 搜索时优先看哪些列 —— 决定结果的排序，也决定「搜什么最快」 */
const FIND_PRIORITY = ['学号', '姓名', '姓名1', '考生号', '证件号码', '身份证件号', '身份证号'];

/** 档案卡上要一屏显示的字段（辅导员出事时第一个要看的那几项） */
const FIND_CARD_FIELDS = [
  { label: '家长电话', cols: ['家长电话', '父亲电话', '母亲电话', '联系电话', '电话'] },
  { label: '宿舍',     cols: ['宿舍', '宿舍楼'] },
  { label: '证件号码', cols: ['证件号码', '身份证件号', '身份证号'], mask: true },
  { label: '生源地',   cols: ['生源地', '籍贯'] },
  { label: '家庭住址', cols: ['家庭住址', '户籍所在地'] },
  { label: '政治面貌', cols: ['政治面貌'] },
  { label: '班级',     cols: ['班级'] },
  { label: '专业',     cols: ['专业'] },
];

let _findTimer = null;

/**
 * 全字段搜索。
 * @param {string} q 关键词
 * @returns {{student:object, score:number, hitField:string}[]}
 */
function quickFind(q) {
  const kw = String(q == null ? '' : q).trim();
  if (!kw) return [];
  const lower = kw.toLowerCase();
  const out = [];

  (S.students || []).forEach(s => {
    let best = null;
    for (const k of Object.keys(s)) {
      const v = s[k];
      if (v == null || v === '') continue;
      const sv = String(v);
      const low = sv.toLowerCase();
      if (low.indexOf(lower) < 0) continue;

      /* 打分：命中优先级靠前的列、排头的，排在前面。
         学号前缀命中给最高分 —— 输个「2024」就应该是那批 2024 级在最上面。 */
      const pi = FIND_PRIORITY.indexOf(k);
      let score;
      if (pi === 1 || pi === 2) score = 1000;                 // 姓名
      else if (pi === 0) score = low.indexOf(lower) === 0 ? 1200 : 900;   // 学号
      else if (pi >= 0) score = 800 - pi * 10;
      else score = 500;
      if (!best || score > best.score) best = { score, hitField: k };
    }
    if (best) out.push({ student: s, score: best.score, hitField: best.hitField });
  });

  out.sort((a, b) => b.score - a.score || studentName(a.student).localeCompare(studentName(b.student), 'zh'));
  return out;
}

/* ── 面板 ────────────────────────────────────────────────────────────── */

function openQuickFind() {
  const students = (S.students || []).length;
  $('modalRoot').innerHTML = `
  <div class="mask" onclick="if(event.target===this)closeModal()">
    <div class="modal" style="max-width:600px" onclick="event.stopPropagation()">
      <div class="qf-head">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2.3" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
        <input id="qfInput" placeholder="姓名 / 学号 / 电话 / 家长 / 宿舍 / 生源地 / 证件号"
               autocomplete="off" spellcheck="false" oninput="quickFindInput(this.value)">
        <button class="qf-x" onclick="closeModal()" aria-label="关闭">×</button>
      </div>
      <div class="qf-body" id="qfBody">
        ${students ? '' : '<div class="qf-empty">还没有学生数据。先从顶栏「导入数据」导一份。</div>'}
      </div>
    </div>
  </div>`;
  const inp = $('qfInput');
  if (inp) { inp.focus(); inp.select(); }
  /* ⌘K / / 唤起后，任何后续按键都归这个框管 —— 尤其 Enter / 上下键 */
  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', quickFindKeys);
  }
}

function closeQuickFind() {
  if (typeof document !== 'undefined') document.removeEventListener('keydown', quickFindKeys);
}

/* 防抖 120ms：打「李」时可能匹配上百人，没必要每次都重画 */
function quickFindInput(v) {
  clearTimeout(_findTimer);
  _findTimer = setTimeout(() => renderQuickFind(v), 120);
}

function renderQuickFind(q) {
  const body = $('qfBody');
  if (!body) return;
  const hits = quickFind(q);

  if (!String(q || '').trim()) {
    body.innerHTML = '<div class="qf-empty">输入姓名、学号，或者任何你记得的信息 — 家长电话、宿舍、生源地、证件号都能搜</div>';
    return;
  }
  if (!hits.length) {
    body.innerHTML = `<div class="qf-empty">没找到「${esc(String(q))}」<br><span style="font-size:11.5px">本批 ${S.students.length} 人。可以试试只输姓，或者学号后几位。</span></div>`;
    return;
  }

  const show = hits.slice(0, 12);
  body.innerHTML = show.map((h, i) => quickFindRow(h, i === 0)).join('')
    + (hits.length > show.length
        ? `<div class="qf-more">还有 ${hits.length - show.length} 人没显示，继续打字缩小范围</div>` : '');
}

/** 一行结果。**把家长电话/宿舍/证件/生源地直接摊在这一行** ——
    出了事的时候，一屏之内就要看够，不用点进去。 */
function quickFindRow(h, active) {
  const s = h.student;
  const bits = FIND_CARD_FIELDS.map(f => {
    const col = f.cols.find(c => s[c] != null && String(s[c]).trim() !== '');
    if (!col) return '';
    const raw = String(s[col]).trim();
    const shown = f.mask ? maskId(raw) : raw;
    return `<span class="qf-tag"><i>${f.label}</i>${esc(shown)}</span>`;
  }).filter(Boolean).join('');

  return `<div class="qf-row${active ? ' active' : ''}" data-i="${h.sid || ''}"
      onclick="openStudentFromFind(${esc(String(s['学号'] == null ? '' : s['学号']))})"
      onmouseover="qfHover(this)">
    <div class="qf-name">${esc(studentName(s))}<span class="qf-sid">${esc(s['学号'] || '')}</span></div>
    <div class="qf-tags">${bits || '<span class="qf-tag qf-none">这一条只有很少的字段</span>'}</div>
  </div>`;
}

function qfHover(el) {
  const body = $('qfBody');
  if (!body) return;
  [...body.querySelectorAll('.qf-row')].forEach(r => r.classList.remove('active'));
  el.classList.add('active');
}

/** 证件号打码：只留后 4 位。屏幕会被别人看到。 */
function maskId(v) {
  const s = String(v);
  if (s.length <= 4) return s;
  return '****' + s.slice(-4);
}

/** 从搜索结果直接打开档案（不进列表页） */
function openStudentFromFind(sid) {
  closeQuickFind();
  if (!sid) return;
  const s = (S.students || []).find(x => String(x['学号'] == null ? '' : x['学号']).trim() === String(sid).trim());
  if (!s) { toast('这条已经不在当前批次里了'); return; }
  /* 详情页本来就按学号定位（openDetail(sid)），直接用它 —— 不用绕 S.view */
  openDetail(sid);
}

/* ── 键盘 ────────────────────────────────────────────────────────────── */

function quickFindKeys(e) {
  if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
  const body = $('qfBody');
  if (!body) return;
  const rows = [...body.querySelectorAll('.qf-row')];
  const cur = rows.findIndex(r => r.classList.contains('active'));
  if (e.key === 'ArrowDown') { e.preventDefault(); qfHover(rows[Math.min(cur + 1, rows.length - 1)] || rows[0]); return; }
  if (e.key === 'ArrowUp')   { e.preventDefault(); qfHover(rows[Math.max(cur - 1, 0)] || rows[0]); return; }
  if (e.key === 'Enter') {
    e.preventDefault();
    const el = rows[cur >= 0 ? cur : 0];
    if (el) el.click();
  }
}

/** ⌘/Ctrl+K 或 / —— 任何页面都能唤起。返回 true 表示已接管。 */
function handleFindShortcut(e) {
  if (!e || !e.key) return false;
  const t = e.target || {};
  const tag = String(t.tagName || '').toLowerCase();
  const typing = tag === 'input' || tag === 'textarea' || t.isContentEditable === true;

  if ((e.metaKey || e.ctrlKey) && String(e.key).toLowerCase() === 'k') {
    if (typing) return false;
    e.preventDefault();
    if ($('qfInput')) closeModal(); else openQuickFind();
    return true;
  }
  if (e.key === '/' && !typing && !topOpenModal()) {
    e.preventDefault();
    openQuickFind();
    return true;
  }
  return false;
}
