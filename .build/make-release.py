# -*- coding: utf-8 -*-
"""v1.9 发布：建 GitHub Release 并上传三个安装包。
token 从本机 Git 凭据管理器里取（不写死、不打印）。"""
import json, os, subprocess, urllib.parse, urllib.request

REPO = 'xpsmsn/zuel-student-workstation'
BASE = r'D:\Develop\辅导员工作台\发布'

# ① 取本机已授权的 GitHub token（GCM 存的）
p = subprocess.run(['git', 'credential', 'fill'],
                   input='protocol=https\nhost=github.com\n\n',
                   capture_output=True, text=True)
tok = [l for l in p.stdout.splitlines() if l.startswith('password=')]
if not tok:
    raise SystemExit('取不到 GitHub 凭据，请先完成浏览器授权')
TOKEN = tok[0].split('=', 1)[1].strip()


def req(url, data=None, method='POST', ctype='application/json'):
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header('Authorization', 'Bearer ' + TOKEN)
    r.add_header('Accept', 'application/vnd.github+json')
    r.add_header('User-Agent', 'xpsmsn')
    if data is not None:
        r.add_header('Content-Type', ctype)
    return r


NOTES = '''## v1.9 首发

面向高校辅导员的**本机学生工作台**：数据只存本机，全程不联网、不上传服务器。

### 本次更新
- **新手引导重做为"跟着点一遍就能完成"的分步实操向导**：6 步，每步都配可执行按钮
  （打开智慧学工 / 打开综合教务 / 直达导入框），带两份文件的进度清单
- **宿舍看板新增「查寝打分表」导出**：A4 横向、表头跨页自动重复、按楼栋房号排序、住宿人员姓名不被裁
- 修复「引导页入口被误删后找不到」：侧栏常驻入口 + 指引页/个人中心两处重看按钮
- 演示数据按性别编组为 25 间 2~4 人寝室，"室友"列不再全空

### 下载哪个？
| 文件 | 适合谁 |
| --- | --- |
| `中南大学生工作台-绿色版.exe` | 想直接用：复制到任意文件夹双击即可，不用安装 |
| `中南大学生工作台-安装程序.exe` | 日常使用：装到开始菜单/桌面，默认按当前用户安装，**不需要管理员权限** |
| `中南大学生工作台-单位部署.msi` | 学校统一部署用，通常需要管理员权限 |

### 运行环境
Windows 10/11 64 位，需要 Microsoft Edge WebView2 运行时（Win11 与多数 Win10 已有，
安装器内嵌引导程序，缺的机器会自动装）。不需要 Node.js / Rust / .NET。

详细用法见仓库内的 `中南大学生工作台-用户使用手册.docx`。

> 说明：仓库里不含安装包本体（二进制不入库），三个文件在本 Release 的 Assets 里。
> clone 后要先跑 `node .build/build-desktop.js` 再 `tauri build`。
'''

rel = json.load(urllib.request.urlopen(
    req(f'https://api.github.com/repos/{REPO}/releases',
        data=json.dumps({'tag_name': 'v1.9', 'name': 'v1.9',
                         'body': NOTES, 'draft': False,
                         'prerelease': False}).encode())))
rid = rel['id']
print('release id =', rid, '| html =', rel['html_url'])

for name in ['中南大学生工作台-绿色版.exe',
             '中南大学生工作台-安装程序.exe',
             '中南大学生工作台-单位部署.msi']:
    path = os.path.join(BASE, name)
    if not os.path.isfile(path):
        print('跳过（不存在）:', name)
        continue
    data = open(path, 'rb').read()
    url = (f'https://uploads.github.com/repos/{REPO}/releases/{rid}/assets'
           f'?name=' + urllib.parse.quote(name))
    a = json.load(urllib.request.urlopen(
        req(url, data=data, ctype='application/octet-stream')))
    print(f'已上传 {name}  {len(data)/1048576:.1f} MB  -> {a["browser_download_url"]}')

print('DONE ->', rel['html_url'])
