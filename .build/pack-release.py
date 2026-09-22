# -*- coding: utf-8 -*-
"""出包之后：把三个产物按统一命名规则放进「发布」目录，并顺手同步文档里的文件名。

## 命名规则（长期使用，别再改写法）

    中南大学生工作台-v<版本>-<用途>.<扩展名>

    <用途> 只有三个：绿色版 / 安装程序 / 单位部署
    例：中南大学生工作台-v1.9.1-绿色版.exe

GitHub Release 附件不支持中文名（会被清成 `-.exe`），所以那边用英文名：

    ZUEL-StudentWorkstation-v<版本>-Portable.exe
    ZUEL-StudentWorkstation-v<版本>-Setup.exe
    ZUEL-StudentWorkstation-v<版本>-Deploy.msi

版本号来源：`app/src-tauri/tauri.conf.json` 的 `version`，三处（文件名 / 安装说明 / README）
永远以它为准，不手写，避免对不上。

用法：
    python .build/pack-release.py            # 复制 + 改名 + 清理旧名 + 同步文档
    python .build/pack-release.py --dry      # 只看会做什么，不真动文件
"""
import glob
import json
import os
import re
import shutil
import sys

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

# 需要跟着同步文件名的文档
DOCS = [
    os.path.join(OUT_DIR, "安装说明.txt"),
    os.path.join(ROOT, "README.md"),
    os.path.join(ROOT, ".build", "release-notes.md"),
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


def sync_doc(path, cn_names, en_names):
    """把文档里旧版本号的文件名一律换成当前版本的写法。"""
    if not os.path.isfile(path):
        return False
    with open(path, encoding="utf-8") as f:
        text = f.read()

    def cn_repl(m):
        return cn_names[(m.group(1), m.group(2))]

    def en_repl(m):
        ext = m.group(2)
        kind = m.group(1) or ("Deploy" if ext == "msi" else "Portable")
        return en_names[(kind, ext)]

    new = re.sub(
        r"中南大学生工作台(?:-v[\d.]+)?-(绿色版|安装程序|单位部署)\.(exe|msi)", cn_repl, text
    )
    # 兼容历史写法：`...-Portable-v1.9.exe`（版本在末尾）与 `...-v1.9.1-Portable.exe`（现行）
    new = re.sub(
        r"ZUEL-StudentWorkstation(?:-(Portable|Setup|Deploy))?(?:-v[\d.]+)?\.(exe|msi)",
        en_repl,
        new,
    )
    if new == text:
        return False
    if not DRY:
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(new)
    return True


def main():
    ver = read_version()
    tag = f"v{ver}"
    print(f"当前版本：{ver}（取自 tauri.conf.json）")

    cn_names, en_names = {}, {}
    for cn, en, ext, _pat in KINDS:
        cn_names[(cn, ext)] = f"中南大学生工作台-{tag}-{cn}.{ext}"
        en_names[(en, ext)] = f"ZUEL-StudentWorkstation-{tag}-{en}.{ext}"

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

    print("\nGitHub Release 附件用这三个英文名：")
    for cn, en, ext, _ in KINDS:
        print(f"  {en_names[(en, ext)]}   ←  {cn_names[(cn, ext)]}")
    if DRY:
        print("\n（--dry 模式，没有真的改文件）")


main()
