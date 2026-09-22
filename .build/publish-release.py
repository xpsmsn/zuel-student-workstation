# -*- coding: utf-8 -*-
"""把「发布」目录里当前版本的三个包传到 GitHub Release。

版本号从 `app/src-tauri/tauri.conf.json` 读；Release 正文用 `.build/release-notes.md`；
附件用 ASCII 英文文件名（GitHub 不支持中文附件名，会被清成 `-.exe`）。

用法：
    python .build/publish-release.py                 # 建（或复用）当前版本的 Release 并传附件
    python .build/publish-release.py --drop-old v1.9 # 顺带删掉指定的旧 Release（含它的附件）
    python .build/publish-release.py --dry           # 只打印打算做什么
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

REPO = "xpsmsn/zuel-student-workstation"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

DRY = "--dry" in sys.argv


def opt(flag):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else None


def token():
    """优先用环境变量 GITHUB_TOKEN。

    ⚠️ `git credential fill` 在本机有时会卡住十几分钟（GCM 想刷新令牌时），
    所以能直接给令牌就别走它。
    """
    env = os.environ.get("GITHUB_TOKEN", "").strip()
    if env:
        return env
    out = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True,
        text=True,
        encoding="utf-8",
    ).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line[len("password="):].strip()
    sys.exit("找不到 GitHub token：先确认 git credential 里已登录 github.com")


def api(path, method="GET", data=None, headers=None, raw=False):
    req = urllib.request.Request(
        f"https://api.github.com{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "User-Agent": "zuel-release",
            **(headers or {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
            return json.loads(body) if not raw else body
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        print(f"  ❌ HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:300]}")
        raise


def main():
    global TOKEN
    ver = json.load(
        open(os.path.join(ROOT, "app", "src-tauri", "tauri.conf.json"), encoding="utf-8")
    )["version"]
    tag = f"v{ver}"
    notes = open(os.path.join(ROOT, ".build", "release-notes.md"), encoding="utf-8").read().strip()

    files = [
        (f"中南大学生工作台-{tag}-绿色版.exe", f"ZUEL-StudentWorkstation-{tag}-Portable.exe"),
        (f"中南大学生工作台-{tag}-安装程序.exe", f"ZUEL-StudentWorkstation-{tag}-Setup.exe"),
        (f"中南大学生工作台-{tag}-单位部署.msi", f"ZUEL-StudentWorkstation-{tag}-Deploy.msi"),
    ]
    for cn, _en in files:
        p = os.path.join(ROOT, "发布", cn)
        if not os.path.isfile(p):
            sys.exit(f"缺少文件：{p}（先跑 .build/pack-release.py）")

    print(f"版本：{tag}")
    if DRY:
        for cn, en in files:
            size = os.path.getsize(os.path.join(ROOT, "发布", cn))
            print(f"  将上传 {en}  ←  {cn}  ({size:,} bytes)")
        return

    TOKEN = token()

    # 1) 取（或建）当前版本的 Release
    rel = api(f"/repos/{REPO}/releases/tags/{tag}")
    if rel:
        print(f"复用已有 Release：{rel['html_url']}")
        rel = api(
            f"/repos/{REPO}/releases/{rel['id']}",
            "PATCH",
            json.dumps({"body": notes}, ensure_ascii=False).encode("utf-8"),
            {"Content-Type": "application/json; charset=utf-8"},
        )
    else:
        rel = api(
            f"/repos/{REPO}/releases",
            "POST",
            json.dumps(
                {"tag_name": tag, "name": tag, "body": notes, "draft": False, "prerelease": False},
                ensure_ascii=False,
            ).encode("utf-8"),
            {"Content-Type": "application/json; charset=utf-8"},
        )
        print(f"已创建 Release：{rel['html_url']}")

    # 2) 删掉同名旧资产（重传会 422）
    for a in rel.get("assets", []):
        if a["name"] in {en for _cn, en in files}:
            req = urllib.request.Request(
                f"https://api.github.com/repos/{REPO}/releases/assets/{a['id']}",
                method="DELETE",
                headers={"Authorization": f"Bearer {TOKEN}", "User-Agent": "zuel-release"},
            )
            urllib.request.urlopen(req, timeout=60)
            print(f"  已删除同名旧附件：{a['name']}")

    # 3) 上传（大附件偶尔中断，重试三次）
    upload = rel["upload_url"].split("{")[0]
    for cn, en in files:
        path = os.path.join(ROOT, "发布", cn)
        blob = open(path, "rb").read()
        for attempt in range(3):
            req = urllib.request.Request(
                f"{upload}?name={en}",
                data=blob,
                method="POST",
                headers={
                    "Authorization": f"Bearer {TOKEN}",
                    "Accept": "application/vnd.github+json",
                    "Content-Type": "application/octet-stream",
                    "User-Agent": "zuel-release",
                },
            )
            try:
                with urllib.request.urlopen(req, timeout=600) as r:
                    got = json.loads(r.read())
                print(f"  ✅ {got['name']}  {got['size']:,} bytes")
                break
            except Exception as e:  # noqa: BLE001
                print(f"  第 {attempt + 1} 次失败（{e}），重试…")
                time.sleep(3)
        else:
            print(f"  ❌ 上传失败：{en}")

    # 4) 可选：删掉指定的旧 Release（含其附件），避免老师下到有问题的版本
    old = opt("--drop-old")
    if old:
        rel_old = api(f"/repos/{REPO}/releases/tags/{old}")
        if rel_old:
            api(f"/repos/{REPO}/releases/{rel_old['id']}", "DELETE")
            print(f"已删除旧 Release：{old}")

    final = api(f"/repos/{REPO}/releases/tags/{tag}")
    print("\n最终附件：")
    for a in final.get("assets", []):
        print(f"  {a['name']}  {a['size']:,} bytes")
    print(f"\nRelease 页面：{final['html_url']}")


main()
