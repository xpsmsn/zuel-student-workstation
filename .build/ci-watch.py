#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""盯 GitHub Actions 的 Mac 构建：等它跑完 → 报结论 → 失败就抓日志。

用法: python .build/ci-watch.py [run_id]
不传 run_id 就取最近一次 build-macos 运行。
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

REPO = "xpsmsn/zuel-student-workstation"
WORKFLOW = "build-macos.yml"


def token():
    env = os.environ.get("GITHUB_TOKEN", "").strip()
    if env:
        return env
    p = os.path.join(os.path.expanduser("~"), ".git-credentials")
    for line in open(p, encoding="utf-8", errors="ignore"):
        m = re.match(r"https?://([^:@/]*):([^@]*)@github\.com/?\s*$", line.strip())
        if m and m.group(2):
            return m.group(2)
    sys.exit("找不到 token")


TOK = token()


def api(path, raw=False, method="GET"):
    req = urllib.request.Request(
        "https://api.github.com" + path,
        method=method,
        headers={"Authorization": f"Bearer {TOK}", "User-Agent": "zuel-ci",
                 "Accept": "application/vnd.github+json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            b = r.read()
            return (b.decode("utf-8", "ignore") if raw else json.loads(b or b"null"))
    except urllib.error.HTTPError as e:
        return None if e.code == 404 else f"HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}"


def latest_run():
    d = api(f"/repos/{REPO}/actions/workflows/{WORKFLOW}/runs?per_page=1")
    runs = (d or {}).get("workflow_runs") or []
    return runs[0] if runs else None


def main():
    rid = sys.argv[1] if len(sys.argv) > 1 else None
    run = api(f"/repos/{REPO}/actions/runs/{rid}") if rid else latest_run()
    if not run:
        sys.exit("没找到运行记录")
    rid = run["id"]
    print(f"运行 #{run['run_number']}  {run['html_url']}")

    t0 = time.time()
    last = None
    while True:
        run = api(f"/repos/{REPO}/actions/runs/{rid}")
        st, concl = run["status"], run.get("conclusion")
        if st != last:
            print(f"  [{int(time.time()-t0):>4}s] status={st} conclusion={concl}")
            last = st
        if st == "completed":
            break
        if time.time() - t0 > 40 * 60:
            print("超时 40 分钟仍未结束，先不等了")
            return
        time.sleep(20)

    print(f"\n结论：{concl}")
    jobs = api(f"/repos/{REPO}/actions/runs/{rid}/jobs") or {}
    for j in jobs.get("jobs", []):
        print(f"\n任务「{j['name']}」  {j['status']}/{j.get('conclusion')}")
        for s in j.get("steps", []):
            mark = {"success": "✓", "failure": "✗", "skipped": "-"}.get(s.get("conclusion"), "·")
            print(f"   {mark} {s['name']}  ({s.get('conclusion')})")

        bad = [s for s in j.get("steps", []) if s.get("conclusion") == "failure"]
        if bad:
            log = api(f"/repos/{REPO}/actions/jobs/{j['id']}/logs", raw=True)
            if isinstance(log, str):
                lines = log.splitlines()
                print(f"\n----- 失败步骤日志尾部（共 {len(lines)} 行，取最后 60 行）-----")
                for ln in lines[-60:]:
                    print("   " + ln[:200])
            else:
                print("   （取日志失败）")


if __name__ == "__main__":
    main()
