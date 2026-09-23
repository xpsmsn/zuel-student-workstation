#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把「表单模板」文件内联进原型（base64），供「常用模板」页直接另存到下载。

为什么内联而不是放进 Tauri resources：
  · 绿色版现在是「一个 exe，拷到哪都能跑」—— 用 resources 就变成 exe + 附件文件夹，破坏了这个卖点；
  · 内联后浏览器版、Windows 版、macOS 版**都一样能用**；
  · 不受用户挪动/改名桌面文件夹影响（原先"登记本机路径"的方案有这个弱点）。
代价：原型体积增加（这 8 份合计 0.3 MB → base64 约 0.4 MB），对 1.8 MB 的单文件来说可接受。

用法:
  1) 改下面 SOURCES 里的清单（源文件路径 / 分组 / 显示名）
  2) python .build/embed-templates.py
  3) 脚本会把 中南大学生工作台.html 里
     /* @BUILTIN-TEMPLATES-START */ … /* @BUILTIN-TEMPLATES-END */
     之间的内容替换成新生成的 BUILTIN_TEMPLATES
  4) 再跑 node .build/build-desktop.js 刷新桌面壳（出包前本来就要跑）
"""
import base64
import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.path.join(ROOT, '中南大学生工作台.html')
BASE_DIR = os.path.join(os.path.expanduser('~'), 'Desktop', '常用模板')

# (相对 BASE_DIR 的路径, 分组, 显示名)
SOURCES = [
    ('3. 优秀共青团员作为党的培养对象推荐表.pdf', '证明 · 推荐', '优秀共青团员作为党的培养对象推荐表.pdf'),
    ('党员证明+学生干部证明（模板）.docx',        '证明 · 推荐', '党员证明+学生干部证明（模板）.docx'),
    ('在校表现证明(无犯罪 模板）.docx',           '证明 · 推荐', '在校表现证明（无犯罪记录·模板）.docx'),
    ('团组织关系介绍信.pdf',                      '介绍信',      '团组织关系介绍信.pdf'),
    ('学籍登记表(模板).docx',                     '登记表',      '学籍登记表（模板）.docx'),
    (os.path.join('报销', '报账签收表.xlsx'),              '报销', '报账签收表.xlsx'),
    (os.path.join('报销', '酬金发放明细表.xlsx'),          '报销', '酬金发放明细表.xlsx'),
    (os.path.join('报销', '附件：工作简餐申请审批表.docx'), '报销', '工作简餐申请审批表.docx'),
]

START = '/* @BUILTIN-TEMPLATES-START */'
END = '/* @BUILTIN-TEMPLATES-END */'


def main():
    html = io.open(TARGET, encoding='utf-8').read()
    if START not in html or END not in html:
        sys.exit(f'原型里找不到标记块：{START} … {END}')

    items, total = [], 0
    for rel, group, disp in SOURCES:
        p = os.path.join(BASE_DIR, rel)
        if not os.path.isfile(p):
            sys.exit(f'源文件不存在：{p}')
        raw = open(p, 'rb').read()
        total += len(raw)
        items.append({
            'group': group,
            'name': disp,
            'ext': os.path.splitext(disp)[1].lstrip('.').lower(),
            'size': len(raw),
            'b64': base64.b64encode(raw).decode('ascii'),
        })
        print(f'  {len(raw)/1024:7.1f} KB  [{group}] {disp}')

    lines = [START]
    lines.append('/* 由 .build/embed-templates.py 生成，请勿手改 —— 换模板请重跑那个脚本。')
    lines.append(f'   共 {len(items)} 份，源文件合计 {total/1048576:.2f} MB（base64 内联后约 {total*4/3/1048576:.2f} MB）。')
    lines.append('   为什么内联见脚本头部注释：保住"绿色版就一个 exe"，且三个平台都能用。 */')
    lines.append('const BUILTIN_TEMPLATES = [')
    for it in items:
        lines.append('  {')
        for k in ('group', 'name', 'ext'):
            lines.append(f"    {k}: {it[k]!r},".replace("'", '"'))
        lines.append(f"    size: {it['size']},")
        lines.append(f"    b64: '{it['b64']}'")
        lines.append('  },')
    lines.append('];')
    lines.append(END)
    block = '\n'.join(lines)

    i = html.index(START)
    j = html.index(END) + len(END)
    out = html[:i] + block + html[j:]
    io.open(TARGET, 'w', encoding='utf-8', newline='\n').write(out)

    print(f'\n已内联 {len(items)} 份（源 {total/1024:.0f} KB）')
    print(f'原型体积：{len(html)/1024:.0f} KB → {len(out)/1024:.0f} KB')
    print('下一步：node .build/build-desktop.js（出包前本来就要跑）')


if __name__ == '__main__':
    main()
