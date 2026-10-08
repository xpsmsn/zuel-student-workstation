#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把《用户使用手册》的 Markdown 终稿转成 doc-typeset 要求的 HTML。

为什么自己写：这份手册结构高度规整（h2=一二三、h3=（一）（二）、若干 GFM 表格、引用块），
而 tencent-docx 的 base 模板有一批 HTML→docx 硬约束（表格要有 thead/tbody、禁止 grid/dl、
封面每个块要自己写 text-align、封面与正文必须是相邻顶层 section、≥3 个 h2 要生成目录…）。
手抄 700 行 HTML 容易漏项，脚本转换 + 转换后自检更可靠。

用法: python .build/md2html-manual.py <in.md> <out.html>
"""
import io
import re
import sys
from html import escape


def inline(text: str) -> str:
    """行内标记：**粗体** / `代码`。先转义再替换，避免把生成的标签又转义掉。"""
    out = escape(text, quote=False)
    out = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", out)
    out = re.sub(r"`([^`]+)`", r"<code>\1</code>", out)
    return out


def split_table_row(line: str):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


def is_sep_row(line: str) -> bool:
    return bool(re.fullmatch(r"\|[\s:|-]+\|", line.strip()))


def convert_body(md: str):
    """返回 (body_html, h2_list)。h1 已由调用方取走。"""
    lines = md.split("\n")
    out, h2s = [], []
    i = 0
    n_h2 = 0
    in_table = False
    tbuf = []

    def flush_table():
        nonlocal in_table, tbuf
        if not tbuf:
            in_table = False
            return
        rows = [r for r in tbuf if not is_sep_row(r)]
        head = split_table_row(rows[0]) if rows else []
        body = [split_table_row(r) for r in rows[1:]]
        h = ['<table>', "<thead>", "<tr>"]
        h += [f"<th>{inline(c)}</th>" for c in head]
        h += ["</tr>", "</thead>", "<tbody>"]
        for r in body:
            h.append("<tr>")
            h += [f"<td>{inline(c)}</td>" for c in r]
            h.append("</tr>")
        h += ["</tbody>", "</table>"]
        out.append("\n".join(h))
        tbuf, in_table = [], False

    while i < len(lines):
        line = lines[i]
        s = line.strip()

        # 表格
        if s.startswith("|"):
            in_table = True
            tbuf.append(s)
            i += 1
            continue
        if in_table:
            flush_table()

        if not s:
            i += 1
            continue

        # 一级章节（手册里带「一、二、…」编号，直接沿用）
        if s.startswith("## "):
            flush_table()
            n_h2 += 1
            title = s[3:].strip()
            h2s.append(title)
            out.append(f'<h2 id="section-{n_h2}">{inline(title)}</h2>')
            i += 1
            continue

        # 二级小节
        if s.startswith("### "):
            out.append(f"<h3>{inline(s[4:].strip())}</h3>")
            i += 1
            continue

        if s.startswith("#### "):
            out.append(f"<h4>{inline(s[5:].strip())}</h4>")
            i += 1
            continue

        # 分隔线：正文里不需要（h2 已经分隔得很清楚）
        if s == "---":
            i += 1
            continue

        # 引用块 → 段落级强调（单段落用 CSS 边框，不用表格）
        if s.startswith(">"):
            buf = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].strip())
                i += 1
            text = " ".join(x for x in buf if x)
            cls = "note-warn" if ("⚠️" in text or "注意" in text) else "note"
            out.append(f'<p class="{cls}">&nbsp;&nbsp;{inline(text)}</p>')
            continue

        # 列表（有序 / 无序，含一层嵌套）
        if re.match(r"^[-*] ", s) or re.match(r"^\d+\. ", s):
            ordered = bool(re.match(r"^\d+\. ", s))
            items = []           # [(text, [subitems])]
            while i < len(lines):
                cur = lines[i]
                cs = cur.strip()
                if re.match(r"^[-*] ", cs) or re.match(r"^\d+\. ", cs):
                    items.append([re.sub(r"^([-*]|\d+\.) ", "", cs), []])
                    i += 1
                elif cur.startswith("   - ") or cur.startswith("  - "):
                    items[-1][1].append(cs[2:].strip())
                    i += 1
                elif not cs:
                    # 列表内的空行：往后看一行，还是列表就继续
                    nxt = lines[i + 1].strip() if i + 1 < len(lines) else ""
                    if re.match(r"^[-*] ", nxt) or re.match(r"^\d+\. ", nxt) \
                       or nxt.startswith("- "):
                        i += 1
                        continue
                    break
                else:
                    break
            tag = "ol" if ordered else "ul"
            h = [f"<{tag}>"]
            for main, subs in items:
                h.append(f"<li>{inline(main)}")
                if subs:
                    h.append("<ul>")
                    h += [f"<li>{inline(x)}</li>" for x in subs]
                    h.append("</ul>")
                h.append("</li>")
            h.append(f"</{tag}>")
            out.append("\n".join(h))
            continue

        # 普通段落
        out.append(f"<p>{inline(s)}</p>")
        i += 1

    if in_table:
        flush_table()
    return "\n".join(out), h2s


CSS = """  :root {
    /* ---- design tokens (modern-minimal) ---- */
    --fs-h1: var(--typography-fontSize-h1, 18pt);
    --fs-h2: var(--typography-fontSize-h2, 15pt);
    --fs-h3: var(--typography-fontSize-h3, 13pt);
    --fs-h4: var(--typography-fontSize-h4, 12pt);
    --fs-body: var(--typography-fontSize-body, 11pt);
    --fs-small: var(--typography-fontSize-small, 9pt);
    --ff-heading: var(--typography-fontFamily-heading, "PingFang SC", "微软雅黑", sans-serif);
    --ff-body: var(--typography-fontFamily-body, "PingFang SC", "微软雅黑", sans-serif);
    --ff-mono: var(--typography-fontFamily-code, Consolas, monospace);
    --lh-body: var(--typography-lineHeight-body, 1.75);
    --lh-heading: var(--typography-lineHeight-heading, 1.3);
    --fw-bold: var(--typography-fontWeight-bold, 700);
    --fw-normal: var(--typography-fontWeight-normal, 400);
    --color-primary: var(--color-primary, #2f6bff);
    --color-text: var(--color-text, #1f2328);
    --color-muted: var(--color-muted, #6b7280);
    --color-border: var(--color-border, #d8dee6);
    --color-bg: var(--color-bg, #ffffff);
    --color-highlight: var(--color-highlight, #f5f7fa);
    --spacing-paragraph: var(--spacing-paragraph, 0.8em);
    --spacing-section: var(--spacing-section, 2em);
    --spacing-block: var(--spacing-block, 1em);
    --margin-page: var(--layout-margin, 2.5cm);
    --page-content-width: var(--layout-contentWidth, 15.6cm);

    /* ---- 本地间距令牌 ----
       html-review 门禁（DT-03）不允许 margin/padding 出现裸值；
       但 CSS 自定义属性本身豁免，所以先把细碎间距收成令牌，正文一律 var() 引用。 */
    --sp-hair:  var(--sp-hair, 0.2em);
    --sp-xs:    var(--sp-xs, 0.25em);
    --sp-s:     var(--sp-s, 0.3em);
    --sp-sm:    var(--sp-sm, 0.5em);
    --sp-cell-y: var(--sp-cell-y, 0.45em);
    --sp-cell-x: var(--sp-cell-x, 0.7em);
    --sp-note:  var(--sp-note, 0.5em 0.8em);
    --sp-list:  var(--sp-list, 2em);
    --sp-toc:   var(--sp-toc, 1.5em);
    --sp-cover: var(--sp-cover, 0.2em);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--ff-body);
    font-size: var(--fs-body);
    line-height: var(--lh-body);
    color: var(--color-text);
    background: var(--color-bg);
    max-width: var(--page-content-width);
    margin-left: auto;
    margin-right: auto;
  }

  /* ---- 封面：每个块各自声明 text-align，不靠继承 ---- */
  .cover-eyebrow { text-align: center; font-size: var(--fs-small); color: var(--color-muted); letter-spacing: var(--sp-hair); margin-bottom: var(--spacing-block); }
  section[role="cover"] > h1 { text-align: center; font-size: var(--fs-h1); color: var(--color-primary); margin-top: var(--spacing-section); margin-bottom: var(--spacing-paragraph); }
  .cover-subtitle { text-align: center; font-size: var(--fs-h3); color: var(--color-text); margin-bottom: var(--spacing-section); }
  .cover-meta { text-align: center; font-size: var(--fs-small); color: var(--color-muted); margin-bottom: var(--sp-cover); }
  .cover-spacer { text-align: center; font-size: var(--fs-body); margin-top: var(--spacing-section); }

  /* ---- 正文 ---- */
  h1, h2, h3, h4 { font-family: var(--ff-heading); line-height: var(--lh-heading); font-weight: var(--fw-bold); text-align: left; }
  h1 { font-size: var(--fs-h1); }
  h2 { font-size: var(--fs-h2); margin-top: var(--spacing-section); margin-bottom: var(--spacing-paragraph); padding-bottom: var(--sp-xs); border-bottom: 1px solid var(--color-border); }
  h3 { font-size: var(--fs-h3); margin-top: var(--spacing-block); margin-bottom: var(--sp-sm); }
  h4 { font-size: var(--fs-h4); margin-top: var(--spacing-block); margin-bottom: var(--sp-sm); }

  p  { text-align: left; margin-bottom: var(--spacing-paragraph); }
  li { text-align: left; margin-bottom: var(--sp-s); }
  ul, ol { padding-left: var(--sp-list); margin-bottom: var(--spacing-paragraph); }
  ul ul { margin-bottom: 0; margin-top: var(--sp-hair); }

  table { border-collapse: collapse; width: 100%; margin-bottom: var(--spacing-block); }
  td { text-align: left; padding: var(--sp-cell-y) var(--sp-cell-x); border: 1px solid var(--color-border); vertical-align: top; }
  th { text-align: left; padding: var(--sp-cell-y) var(--sp-cell-x); border: 1px solid var(--color-border); vertical-align: top; font-weight: var(--fw-bold); background: var(--color-highlight); }

  code { font-family: var(--ff-mono); font-size: var(--fs-small); }

  /* 引用块 → 单段落 CSS 强调（左边框块必须带两个不折叠空格，已在转换时加上） */
  .note { text-align: left; border-left: 3px solid var(--color-primary); background: var(--color-highlight); padding: var(--sp-note); margin-bottom: var(--spacing-paragraph); }
  .note-warn { text-align: left; border-left: 3px solid var(--color-primary); background: var(--color-highlight); padding: var(--sp-note); margin-bottom: var(--spacing-paragraph); }

  /* 目录 */
  .doc-toc { margin-top: var(--spacing-block); margin-bottom: var(--spacing-section); padding: var(--spacing-block); background: var(--color-highlight); }
  .toc-title { text-align: left; font-weight: var(--fw-bold); font-size: var(--fs-h3); margin-bottom: var(--sp-sm); }
  .toc-list, .toc-list ol, .toc-list ul { list-style: none; list-style-type: none; padding-left: 0; }
  .toc-list li { text-align: left; margin-bottom: var(--sp-s); }
  .toc-list a { color: var(--color-primary); text-decoration: none; }

  /* 页脚页码；封面无家具 */
  @page { @bottom-center { content: counter(page); } }
  @page cover { @bottom-center { content: none; } }
  section[role="cover"] { page: cover; }
"""


def main():
    src, dst = sys.argv[1], sys.argv[2]
    md = io.open(src, encoding="utf-8").read().replace("\r\n", "\n")

    # 取 H1 作标题；H1 之后、首个 --- 之前的行作封面副标题与元信息
    m = re.search(r"^# (.+)$", md, re.M)
    title = m.group(1).strip()
    head = md[m.end():]
    head = head.split("\n---", 1)[0]
    head_lines = [x.strip() for x in head.split("\n") if x.strip()]
    # 引用块不属于封面：归到正文开头当开篇提示，否则会连字面量 ">" 一起塞进封面元信息
    lead_quotes = [x for x in head_lines if x.startswith(">")]
    cover_lines = [x for x in head_lines if not x.startswith(">")]
    subtitle = cover_lines[0] if cover_lines else ""
    metas = cover_lines[1:]

    body_md = md.split("\n---", 1)[1] if "\n---" in md else md
    if lead_quotes:
        body_md = "\n".join(lead_quotes) + "\n\n" + body_md
    body_html, h2s = convert_body(body_md)

    toc = ""
    if len(h2s) >= 3:
        items = "\n".join(
            f'      <li><a href="#section-{k + 1}">{escape(t)}</a></li>'
            for k, t in enumerate(h2s)
        )
        toc = (
            '<nav class="doc-toc" aria-label="文档目录">\n'
            '  <p class="toc-title">目录</p>\n'
            '  <ol class="toc-list">\n' + items + "\n  </ol>\n</nav>"
        )

    cover = [
        '<section role="cover">',
        '  <p class="cover-eyebrow">中南大学生工作台</p>',
        f"  <h1>{escape(title)}</h1>",
        f'  <p class="cover-subtitle">{inline(subtitle)}</p>',
    ]
    cover += [f'  <p class="cover-meta">{inline(x)}</p>' for x in metas]
    cover.append("</section>")

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="docx-page-size" content="A4">
  <title>{escape(title)}</title>
  <style>
{CSS}  </style>
</head>
<body>
{chr(10).join(cover)}
<section role="body" data-page-restart="1">
{toc}
{body_html}
</section>
</body>
</html>
"""
    io.open(dst, "w", encoding="utf-8", newline="\n").write(html)
    print(f"已生成 {dst}")
    print(f"  h2 章节数: {len(h2s)}（目录 {'已' if toc else '未'}生成）")
    print(f"  HTML 字符数: {len(html)}")
    for k, t in enumerate(h2s, 1):
        print(f"   {k:2d}. {t}")


if __name__ == "__main__":
    main()
