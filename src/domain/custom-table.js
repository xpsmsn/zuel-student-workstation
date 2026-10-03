/* ════════════════════════════════════════════════════════════════════════
   domain/custom-table.js —— 无模板表格：认出结构（纯函数）
   ────────────────────────────────────────────────────────────────────────
   辅导员 2026-10-03 提出的核心痛点：

     「党团发展的表格、班委的信息表格，或者一些其他非常个性化的表格，
       但是所有这些表格其实没有一个规范的模板。」

   现有三种表（学生表 / 成绩表 / 政治面貌名册）都有固定列名，靠列名就能认。
   但上面这些表**每学年、每个学院都不一样**，列名可能是「入党时间」
   「担任职务」「团费收缴情况」…… 没有共同特征，**靠列名认不出来**。

   ── 那怎么办：换个认法 ────────────────────────────────────────────────
   唯一稳定的东西是**有一列能对上人**。所以本模块不问「这是什么表」，
   而是回答三个更基础的问题：

     ① 哪一列能当身份（学号？考生号？身份证？姓名+唯一组合？）
     ② 剩下这些列叫什么（原样保留，不改名 —— 原始列是铁律）
     ③ 有几行真的能对上人（对不上的是否点名？）

   「能对上人」这一步是关键：它让任意表格都能安全地并进现有数据，
   而不是新建一个平行名单 —— 后者会变成第二份真相，那是最坏的结果。

   ⚠️ 纯函数、零 DOM。可在 node 里直接测。
   ════════════════════════════════════════════════════════════════════════ */

/* ── 身份列的候选（按可靠度排序）──
   顺序有讲究：学号是唯一主键，身份证唯一但不该在界面展示，
   姓名几乎必然重复（重名），只能当「辅助确认」不能当主键。 */
const ID_COL_CANDIDATES = [
  { col: '学号',       kind: 'sid',  reliable: true  },
  { col: '学号/职工号', kind: 'sid', reliable: true  },
  { col: '考生号',     kind: 'exam', reliable: true  },
  { col: '身份证件号', kind: 'id',  reliable: true  },
  { col: '身份证号',   kind: 'id',  reliable: true  },
  { col: '学籍号',     kind: 'sid', reliable: true  },
  { col: '姓名',       kind: 'name', reliable: false },   // 重名很多，只能配班级用
];

/* 常见「附在自定义表里」但属于学生档案的列 ——
   这些列出现时，要按档案字段合并，而不是留在自定义表里。
   理由：同一个信息存两处，两处会不一致。 */
const PROFILE_COLS = [
  '政治面貌', '民族', '籍贯', '生源地', '家庭住址', '父亲电话', '母亲电话',
  '家长电话', '父亲姓名', '母亲姓名', '宿舍', '宿舍楼', '房间号', '床位',
  '床位号', '班级', '专业', '院系', '邮箱', '电子信箱', '备注（保密）', '备注',
];

/**
 * 猜一猜这张表能靠哪一列认人。
 * @param {string[]} cols 已归一化的列名
 * @returns 猜出的身份列描述；猜不出返回 null。
 *          withClass=true 表示这一列单独不够，得配合班级才唯一
 */
function guessIdCol(cols) {
  const list = cols || [];
  for (const cand of ID_COL_CANDIDATES) {
    if (list.indexOf(cand.col) >= 0) {
      /* 「姓名」重名多，只有同时有班级列才算可靠 */
      const withClass = cand.kind === 'name' && list.indexOf('班级') >= 0;
      return {
        col: cand.col,
        kind: cand.kind,
        reliable: cand.reliable || withClass,
        withClass,
      };
    }
  }
  return null;
}

/**
 * 猜出表头行在哪一行。
 *
 * 为什么不直接用第 1 行：这些个性化表往往第一行是标题
 *（如「XX学院2026届学生党团发展情况表」），第二行才是列名。
 *
 * 判据：得分最高的一行 —— 有几个单元格是「短文本且互不相同」
 * 的？那才像列名。标题行通常一整行合并成一个长单元格。
 */
function guessHeaderRow(arr) {
  const limit = Math.min((arr || []).length, 12);
  let best = { idx: 0, score: -1 };

  for (let i = 0; i < limit; i++) {
    const row = (arr[i] || []).map(c => String(c == null ? '' : c).trim());
    const filled = row.filter(c => c !== '');
    if (filled.length < 2) continue;

    /* 标题行特征：整行只有一两个长文本（是标题），不像列名 */
    const longs = filled.filter(c => c.length > 12).length;
    if (filled.length <= 2 && longs >= 1) continue;

    /* 得分：非空单元格越多越好，但要惩罚「长文本占比高」 */
    const uniq = new Set(filled).size;
    const avgLen = filled.reduce((s, c) => s + c.length, 0) / filled.length;
    const score = filled.length + uniq * 0.5 - (avgLen > 10 ? 3 : 0) - longs * 2;

    if (score > best.score) best = { idx: i, score };
  }
  return best.idx;
}

/**
 * 解析一张无模板表格。
 *
 * @param {any[][]} arr    整表的二维数组
 * @param {number}  headerIdx 表头在第几行（0-based），由 guessHeaderRow 给出
 * @param {string[]} rawCols 表头行原样取的列名（未归一）
 * @param {string[]} normCols 归一后的列名
 * @param {object}  idCol   guessIdCol 的结果
 */
function parseCustomTable(arr, headerIdx, rawCols, normCols, idCol) {
  const rows = [], skipped = [];
  const dataStart = (headerIdx == null ? 0 : headerIdx) + 1;   // 表头之后才是数据
  const nameCol = normCols.indexOf('姓名');
  const classCol = normCols.indexOf('班级');

  for (let i = dataStart; i < (arr || []).length; i++) {
    const r = arr[i] || [];
    if (!r.some(c => c != null && String(c).trim() !== '')) continue;   // 空行

    const o = {};
    rawCols.forEach((h, j) => {
      if (h) o[h] = (r[j] == null ? '' : r[j]);
    });

    const key = String(o[idCol.col] == null ? '' : o[idCol.col]).trim();
    if (!key) {
      /* 没有身份值 → 不敢认作数据行。
         典型是表尾的「合计」「统计日期」这类。**点名**而不是悄悄丢掉。 */
      const text = rawCols.map(h => o[h]).filter(v => v !== '').slice(0, 3).join(' / ');
      skipped.push({ row: i + 1, text: text || '（空行）', why: '没有' + idCol.col });
      continue;
    }

    /* 表尾的「合计」「小计」「总计」行：第一格写着字，不是学号。
       真实数据里这类行后面还挂着「162人」「2欠缴」这类统计 ——
       留着会被当成一个学生，而「合计」永远匹配不上任何人，只会让
       「对不上」的名单里凭空多一行噪音。
       但仍要**点名**丢掉（铁律④：可回溯，不静默删除）。 */
    if (/^(合计|小计|总计|统计|备注|说明|填表人|填表日期)$/.test(key)) {
      const text = rawCols.map(h => o[h]).filter(v => v !== '').slice(0, 4).join(' / ');
      skipped.push({ row: i + 1, text, why: '表尾汇总行' });
      continue;
    }

    /* 姓名 + 班级的组合要一起带出去（重名时靠它区分） */
    if (idCol.withClass && classCol >= 0) {
      o['__班级'] = String(o['班级'] == null ? '' : o['班级']).trim();
    }
    if (nameCol >= 0) o['__姓名'] = String(o['姓名'] == null ? '' : o['姓名']).trim();

    rows.push(o);
  }

  /* 哪些列属于「学生档案」（要合并进去），哪些是真正的自定义列（另存） */
  const profileCols = rawCols.filter(h => PROFILE_COLS.indexOf(normalizeKey(h)) >= 0);
  const customCols = rawCols.filter(h => profileCols.indexOf(h) < 0);

  return { rows, skipped, profileCols, customCols };
}

/**
 * 干跑一遍匹配：这些人能对上现有数据吗？
 *
 * ⚠️ 这一步必须在写入前给用户看 —— 因为「对不上」有两种截然不同的含义：
 *   · 这些人本来就不在你的学生库里（新生转专业、外聘教师）→ 可以不管
 *   · 他们本来在，但你这份表学号写法不一样（多了空格、Excel 存成数字变科学计数）→ 会丢数据
 * 分不清这两种就导入，是最容易出事的地方。
 */function matchAgainstStudents(customRows, students, idCol) {
  const keyOf = s => {
    const v = {
      sid:  s['学号'],
      exam: s['考生号'],
      id:   s['证件号码'] || s['身份证件号'] || s['身份证号'],
      name: s['姓名'] || s['姓名1'],
    }[idCol.kind];
    return String(v == null ? '' : v).trim();
  };
  const studentsByKey = new Map();
  (students || []).forEach(s => {
    const k = keyOf(s);
    if (k) studentsByKey.set(k, s);
    /* 重名的按「姓名+班级」建第二次索引 */
    if (idCol.kind === 'name') {
      const k2 = k + '|' + String(s['班级'] == null ? '' : s['班级']).trim();
      if (k) studentsByKey.set(k2, s);
    }
  });

  const rowKey = r => {
    const base = String(r[idCol.col] == null ? '' : r[idCol.col]).trim();
    if (idCol.kind === 'name' && r['__班级']) return base + '|' + String(r['__班级']).trim();
    return base;
  };

  const matched = [], orphans = [];
  customRows.forEach(r => {
    const s = studentsByKey.get(rowKey(r));
    if (s) matched.push({ row: r, student: s });
    else orphans.push(r);
  });

  /* 形态相似的键：提示「可能是写法不同，不是真的没有这个人」。
     例如 Excel 把学号 2023011234 存成了 2.02301E+09。 */
  const suspicious = orphans.filter(o => {
    const k = String(o[idCol.col] == null ? '' : o[idCol.col]).trim();
    if (!k) return false;
    const digits = k.replace(/\D/g, '');
    if (digits.length < 6) return false;
    for (const sk of studentsByKey.keys()) {
      if (sk.replace(/\D/g, '') === digits) return true;
    }
    return false;
  });

  return {
    matched, orphans, suspicious,
    total: customRows.length,
    hitRate: customRows.length ? matched.length / customRows.length : 0,
  };
}
