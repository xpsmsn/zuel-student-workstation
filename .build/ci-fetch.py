#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""取 GitHub Actions 的运行日志 / 产物（Windows 上拉 Mac 版 dmg 用）。

坑：`/actions/jobs/{id}/logs` 与 `/actions/artifacts/{id}/zip` 都会 **302 到临时地址**，
而那个地址是预签名的 —— **再带上 Authorization 头就会 401**。
所以这里手动跟随重定向：第一跳带 token，第二跳不带。

用法:
  python .build/ci-fetch.py logs  <run_id>          # 打印构建日志
  python .build/ci-fetch.py artifact <run_id> <目的目录>   # 下载 dmg 产物 zip 并解到目的目录
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

REPO = "xpsmsn/zuel-student-workstation"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def token():
    env = os.environ.get("GITHUB_TOKEN", "").strip()
    if env:
        return env
    for line in open(os.path.join(os.path.expanduser("~"), ".git-credentials"),
                     encoding="utf-8", errors="ignore"):
        m = re.match(r"https?://([^:@/]*):([^@]*)@github\.com/?\s*$", line.strip())
        if m and m.group(2):
            return m.group(2)
    sys.exit("找不到 token")


TOK = token()


def api(path):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        headers={"Authorization": f"Bearer {TOK}", "User-Agent": "zuel-ci",
                 "Accept": "application/vnd.github+json"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read() or b"null")


def fetch_raw(path):
    """先带 token 拿 302，再不带 token 取真实内容。"""
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(
        "https://api.github.com" + path,
        headers={"Authorization": f"Bearer {TOK}", "User-Agent": "zuel-ci",
                 "Accept": "application/vnd.github+json"},
    )
    try:
        with opener.open(req, timeout=120) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        if e.code in (301, 302, 303, 307, 308):
            url = e.headers["Location"]
            # ⚠️ 这一跳绝不能带 Authorization
            with urllib.request.urlopen(urllib.request.Request(url), timeout=600) as r2:
                return r2.read()
        raise


def main():
    what, run_id = sys.argv[1], sys.argv[2]
    run = api(f"/repos/{REPO}/actions/runs/{run_id}")
    jobs = api(f"/repos/{REPO}/actions/runs/{run_id}/jobs")["jobs"]
    print(f"运行 #{run['run_number']}  {run['status']}/{run.get('conclusion')}  {run['html_url']}")

    if what == "logs":
        log = fetch_raw(f"/repos/{REPO}/actions/jobs/{jobs[0]['id']}/logs").decode("utf-8", "ignore")
        out = ".build/ci-macos.log"
        with open(out, "w", encoding="utf-8") as f:
            f.write(log)
        print(f"日志已存 {out}（{len(log.splitlines())} 行）")
    elif what == "artifact":
        dest = sys.argv[3]
        os.makedirs(dest, exist_ok=True)
        arts = api(f"/repos/{REPO}/actions/runs/{run_id}/artifacts")["artifacts"]
        if not arts:
            sys.exit("这次运行没有产物")
        for a in arts:
            print(f"  产物 {a['name']}  {a['size_in_bytes']:,} B  过期于 {a['expires_at']}")
            blob = fetch_raw(f"/repos/{REPO}/actions/artifacts/{a['id']}/zip")
            zp = os.path.join(dest, a["name"] + ".zip")
            with open(zp, "wb") as f:
                f.write(blob)
            print(f"  已下载 → {zp}（{len(blob):,} 字节）")


if __name__ == "__main__":
    main()
