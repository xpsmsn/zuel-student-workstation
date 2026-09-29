# -*- coding: utf-8 -*-
"""出包之后：把三个产物按统一命名规则放进「发布」目录，并顺手同步文档里的文件名。

## 命名规则（长期使用，别再改写法）

    中南大学生工作台-v<版本>-<用途>.<扩展名>

    <用途> 只有三个：绿色版 / 安装程序 / 单位部署
    例：中南大学生工作台-v1.9.2-绿色版.exe

GitHub Release 附件不支持中文名（会被清成 `-.exe`），所以那边用英文名：

    ZUEL-StudentWorkstation-v<版本>-Portable.exe
    ZUEL-StudentWorkstation-v<版本>-Setup.exe
    ZUEL-StudentWorkstation-v<版本>-Deploy.msi

版本号来源：`app/src-tauri/tauri.conf.json` 的 `version`，三处（文件名 / 安装说明 / README）
永远以它为准，不手写，避免对不上。

用法：
    python .build/pack-release.py            # 复制 + 改名 + 清理旧名 + 同步文档
    python .build/pack-release.py --dry      # 只看会做什么，不真动文件
    python .build/pack-release.py --selftest # 只验"同步文档"的正则（两处写法都认不认）
"""
import glob
import json
import os
import re
import shutil
import sys

# Windows 上 Python 的 stdout 默认是 GBK（代码页 936），而本脚本要打印 ✓ ✗ ⚠️ ❌ ——
# 不显式设成 UTF-8 就会 UnicodeEncodeError。后果不是"显示乱码"这么轻：
#   · `--selftest` 会**第一行就崩** → 那道"守住文档同步"的安全网形同虚设（它本来正是为
#     "静默漏改"设的，见 selftest 的文档字符串；结果自己先崩了，谁也没发现）
#   · `drop()` / `put()` 里的 ⚠️/❌ 告警分支一旦真被触发（安全软件占住刚写完的文件 ——
#     正是这两个函数注释里写的那两道坎），脚本会崩掉，而不是给出那句友好提示
try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONF = os.path.join(ROOT, "app", "src-tauri", "tauri.conf.json")
RELEASE_DIR = os.path.join(ROOT, "app", "src-tauri", "target", "release")
OUT_DIR = os.path.join(ROOT, "发布")

# 中文用途名 → (英文用途名, 扩展名, 产物查找 glob)
KINDS = [
    ("绿色版", "Portable", "exe", os.path.join(RELEASE_DIR, "zuel-student-workstation.exe")),
    ("安装程序", "Setup", "exe", os.path.join(RELEASE_DIR, "bundle", "nsis", "*.exe")),
    ("单位部署", "Deploy", "msi", os.path.join(RELEASE_DIR, "bundle", "msi", "*.msi")),
]

# 「只参与命名与文档同步、不参与本机复制」的产物。
# macOS 的 dmg 由 GitHub Actions 构建（Windows 编不出 Mac 程序），本机没有这个文件；
# 但**它的文件名同样要跟着版本走** —— 原先 KINDS 只有三个、正则也不认 .dmg，
# 于是每次发版，README / 安装说明 / Release 说明里的 dmg 名都停在旧版本，
# 而同一张表里的另外三个已经是新版本（方案说明 §6.14 那张表就长期是 1.9.5 与 2.1.0 混着）。
NAMING_ONLY = [
    ("macOS", "macOS", "dmg"),
]

# 需要跟着同步文件名的文档
DOCS = [
    os.path.join(OUT_DIR, "安装说明.txt"),
    os.path.join(ROOT, "README.md"),
    os.path.join(ROOT, ".build", "release-notes.md"),
    # §6.14 那张「用途 → 文件名」的命名表也必须跟着走：
    # 它原先不在名单里，于是长期停在 v1.9.5（而同一张表的 macOS 行是 v2.1.0，自相矛盾）。
    os.path.join(ROOT, "中南大学生工作台_方案说明.md"),
]

DRY = "--dry" in sys.argv


def read_version():
    with open(CONF, encoding="utf-8") as f:
        return json.load(f)["version"]


def newest(pattern):
    """glob 里取最新那份（同一目录可能留着历史版本的产物）。"""
    hits = [p for p in glob.glob(pattern) if os.path.isfile(p)]
    if not hits:
        return None
    return max(hits, key=os.path.getmtime)


def drop(path):
    """删除，带重试。

    ⚠️ 本机有两道坎：① 火绒会占住刚写完的文件；② Python 的 os.remove 会被安全删除
    机制拦下（报 "Some operations were aborted"）。所以删不掉时改成"挪到临时目录"，
    实在不行就只告警、不中断整件事。
    """
    import tempfile
    import time
    import uuid

    if not os.path.exists(path):
        return True
    for _i in range(3):
        try:
            os.remove(path)
            return True
        except OSError:
            try:
                tmp = os.path.join(
                    tempfile.gettempdir(), f"old-{uuid.uuid4().hex}-{os.path.basename(path)}"
                )
                shutil.move(path, tmp)
                return True
            except OSError:
                time.sleep(0.5)
    print(f"  ⚠️ 暂时删不掉（多半被安全软件占着）：{os.path.basename(path)}，稍后手动删")
    return False


def put(src, dst):
    """复制并覆盖。目标文件可能刚被写过、被安全软件占住 —— 覆盖失败就先挪走再来。"""
    import time

    for _i in range(4):
        try:
            shutil.copy2(src, dst)
            return True
        except OSError:
            drop(dst)
            time.sleep(0.5)
    print(f"  ❌ 复制失败：{os.path.basename(dst)}")
    return False


def build_names(ver):
    """按当前版本号生成中英文两套文件名（含只参与命名的 macOS dmg）。"""
    tag = f"v{ver}"
    cn_names, en_names = {}, {}
    for cn, en, ext, _pat in KINDS:
        cn_names[(cn, ext)] = f"中南大学生工作台-{tag}-{cn}.{ext}"
        en_names[(en, ext)] = f"ZUEL-StudentWorkstation-{tag}-{en}.{ext}"
    for cn, en, ext in NAMING_ONLY:
        cn_names[(cn, ext)] = f"中南大学生工作台-{tag}-{cn}.{ext}"
        en_names[(en, ext)] = f"ZUEL-StudentWorkstation-{tag}-{en}.{ext}"
    return cn_names, en_names


def rewrite(text, cn_names, en_names):
    """把文档里任何版本号的文件名一律换成当前版本的写法。"""
    def cn_repl(m):
        return cn_names[(m.group(1), m.group(2))]

    def en_repl(m):
        ext = m.group(2)
        kind = m.group(1) or ("Deploy" if ext == "msi" else "Portable")
        return en_names[(kind, ext)]

    new = re.sub(
        r"中南大学生工作台(?:-v[\d.]+)?-(绿色版|安装程序|单位部署)\.(exe|msi)", cn_repl, text
    )
    # 英文名有两种写法，都要认（曾经只认后者，导致 README 里的文件名一直没被同步）：
    #   现行  ZUEL-StudentWorkstation-v1.9.2-Portable.exe   ← 版本在用途前面
    #   早期  ZUEL-StudentWorkstation-Portable-v1.9.exe  /  ...-Portable.exe
    for pat in (
        r"ZUEL-StudentWorkstation-(?:v[\d.]+-)?(Portable|Setup|Deploy)\.(exe|msi)",
        r"ZUEL-StudentWorkstation-(Portable|Setup|Deploy)(?:-v[\d.]+)?\.(exe|msi)",
    ):
        new = re.sub(pat, en_repl, new)
    # macOS 的 dmg：用途名与扩展名都跟上面不同，得单独认（原先完全漏掉，长期没被同步）
    new = re.sub(r"中南大学生工作台(?:-v[\d.]+)?-macOS\.dmg",
                 lambda m: cn_names[("macOS", "dmg")], new)
    new = re.sub(r"ZUEL-StudentWorkstation-(?:v[\d.]+-)?macOS\.dmg",
                 lambda m: en_names[("macOS", "dmg")], new)
    return new


def sync_doc(path, cn_names, en_names):
    """把文档里旧版本号的文件名一律换成当前版本的写法。"""
    if not os.path.isfile(path):
        return False
    with open(path, encoding="utf-8") as f:
        text = f.read()
    new = rewrite(text, cn_names, en_names)
    if new == text:
        return False
    if not DRY:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(new)
    return True


def selftest(ver):
    """守住"同步文档"这一步：中英文两套、新老两种写法，都得认。

    ⚠️ 真出过事：英文名正则原先只认 `...-Portable-v1.9.exe`，认不出现行的
    `...-v1.9.2-Portable.exe`，于是 README 里的文件名连着几版都没被同步，
    而脚本一声不吭（`new == text` 就当"没什么要改"）。这类"静默漏改"必须自检兜住。
    """
    cn_names, en_names = build_names(ver)
    tag = f"v{ver}"
    cases = [
        # 中文名：带版本 / 不带版本
        (f"中南大学生工作台-{tag}-绿色版.exe", f"中南大学生工作台-{tag}-绿色版.exe"),
        ("中南大学生工作台-绿色版.exe", f"中南大学生工作台-{tag}-绿色版.exe"),
        ("中南大学生工作台-v1.0.0-安装程序.exe", f"中南大学生工作台-{tag}-安装程序.exe"),
        ("中南大学生工作台-单位部署.msi", f"中南大学生工作台-{tag}-单位部署.msi"),
        # 英文名：现行写法（版本在用途前）
        (f"ZUEL-StudentWorkstation-{tag}-Portable.exe", f"ZUEL-StudentWorkstation-{tag}-Portable.exe"),
        ("ZUEL-StudentWorkstation-v1.9.1-Portable.exe", f"ZUEL-StudentWorkstation-{tag}-Portable.exe"),
        ("ZUEL-StudentWorkstation-v1.9.1-Setup.exe", f"ZUEL-StudentWorkstation-{tag}-Setup.exe"),
        ("ZUEL-StudentWorkstation-v1.9.1-Deploy.msi", f"ZUEL-StudentWorkstation-{tag}-Deploy.msi"),
        # 英文名：早期写法（版本在用途后 / 没有版本）
        ("ZUEL-StudentWorkstation-Portable-v1.9.exe", f"ZUEL-StudentWorkstation-{tag}-Portable.exe"),
        ("ZUEL-StudentWorkstation-Portable.exe", f"ZUEL-StudentWorkstation-{tag}-Portable.exe"),
        ("ZUEL-StudentWorkstation-Deploy.msi", f"ZUEL-StudentWorkstation-{tag}-Deploy.msi"),
        # macOS dmg（脚本原先完全不认 .dmg，文档里的 dmg 名长期停在旧版本）
        (f"中南大学生工作台-{tag}-macOS.dmg", f"中南大学生工作台-{tag}-macOS.dmg"),
        ("中南大学生工作台-v1.9.5-macOS.dmg", f"中南大学生工作台-{tag}-macOS.dmg"),
        ("ZUEL-StudentWorkstation-v1.9.5-macOS.dmg", f"ZUEL-StudentWorkstation-{tag}-macOS.dmg"),
        ("ZUEL-StudentWorkstation-macOS.dmg", f"ZUEL-StudentWorkstation-{tag}-macOS.dmg"),
        # 不该被动的：产品名本身、其它文件
        ("中南大学生工作台.html", "中南大学生工作台.html"),
        ("ZUEL-StudentWorkstation-源码.zip", "ZUEL-StudentWorkstation-源码.zip"),
    ]
    bad = 0
    print(f"自检「同步文档」的正则（目标版本 {tag}）：")
    for src, want in cases:
        got = rewrite(src, cn_names, en_names)
        if got == want:
            print(f"  ✓ {src}")
        else:
            bad += 1
            print(f"  ✗ {src}  →  {got}（应为 {want}）")
    print("全部通过 ✅" if not bad else f"共 {bad} 项不通过")
    return bad


def main():
    ver = read_version()
    tag = f"v{ver}"
    print(f"当前版本：{ver}（取自 tauri.conf.json）")

    if "--selftest" in sys.argv:
        print()
        sys.exit(1 if selftest(ver) else 0)

    cn_names, en_names = build_names(ver)

    # 1) 复制 / 改名进「发布」
    for cn, en, ext, pattern in KINDS:
        src = pattern if os.path.isfile(pattern) else newest(pattern)
        if not src:
            print(f"  ⚠️ 找不到产物：{pattern}")
            continue
        dst = os.path.join(OUT_DIR, cn_names[(cn, ext)])
        if os.path.abspath(src) == os.path.abspath(dst):
            continue
        print(f"  {os.path.basename(src)}  →  {os.path.basename(dst)}")
        if not DRY:
            put(src, dst)

    # 2) 清掉「发布」里同用途但写法过时的旧文件（比如没带版本号的）
    stale = []
    for name in os.listdir(OUT_DIR):
        m = re.match(r"中南大学生工作台(?:-v[\d.]+)?-(绿色版|安装程序|单位部署)\.(exe|msi)$", name)
        if m and name != cn_names.get((m.group(1), m.group(2))):
            stale.append(name)
    for name in stale:
        print(f"  清理旧命名：{name}")
        if not DRY:
            drop(os.path.join(OUT_DIR, name))

    # 3) 同步文档里的文件名
    for doc in DOCS:
        changed = sync_doc(doc, cn_names, en_names)
        if changed:
            print(f"  已同步文件名：{os.path.relpath(doc, ROOT)}")

    print("\nGitHub Release 附件用这些英文名：")
    for cn, en, ext, _ in KINDS:
        print(f"  {en_names[(en, ext)]}   ←  {cn_names[(cn, ext)]}")
    for cn, en, ext in NAMING_ONLY:
        print(f"  {en_names[(en, ext)]}   ←  {cn_names[(cn, ext)]}（由 Actions 构建）")
    if DRY:
        print("\n（--dry 模式，没有真的改文件）")


main()
