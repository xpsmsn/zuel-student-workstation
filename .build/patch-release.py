# -*- coding: utf-8 -*-
"""把 .build/release-notes.md 的内容 PATCH 到 GitHub Release v1.9 的说明里。"""
import json, os, subprocess, sys, urllib.request

REPO = "xpsmsn/zuel-student-workstation"
RELEASE_ID = 393857133

def token():
    out = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True, text=True, encoding="utf-8",
    ).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line[len("password="):].strip()
    sys.exit("找不到 GitHub token，先运行 git credential fill 确认已登录")

body = open(os.path.join(os.path.dirname(__file__), "release-notes.md"), encoding="utf-8").read().strip()
payload = json.dumps({"body": body}, ensure_ascii=False).encode("utf-8")

req = urllib.request.Request(
    f"https://api.github.com/repos/{REPO}/releases/{RELEASE_ID}",
    data=payload,
    method="PATCH",
    headers={
        "Authorization": f"Bearer {token()}",
        "Accept": "application/vnd.github+json",
        "Content-Type": "application/json; charset=utf-8",
        "User-Agent": "zuel-release-patch",
    },
)
with urllib.request.urlopen(req) as r:
    rel = json.load(r)

print("Release:", rel["html_url"])
print("body 字数:", len(rel["body"]))
print("附件:")
for a in rel["assets"]:
    print(f"  - {a['name']}  {a['size']} bytes  ⬇{a['download_count']}")
