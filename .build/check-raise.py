# -*- coding: utf-8 -*-
"""验证「单实例唤回」：把主窗口藏起来（模拟缩到托盘），再双击 exe，看它是否自己冒出来。

用法：
    python check-raise.py list                # 列出所有标题含关键字的窗口（含不可见）
    python check-raise.py hide                # 把主窗口 SW_HIDE（模拟缩到托盘）
    python check-raise.py state               # 主窗口当前是否可见 / 是否最小化 / 是否前台
"""
import ctypes
import sys
from ctypes import wintypes

u = ctypes.windll.user32
u.IsWindowVisible.argtypes = [wintypes.HWND]
u.IsIconic.argtypes = [wintypes.HWND]
u.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
u.SetForegroundWindow.argtypes = [wintypes.HWND]
u.GetWindowTextLengthW.argtypes = [wintypes.HWND]
u.GetForegroundWindow.restype = wintypes.HWND

EnumWindowsProc = ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
KW = "中南大学生工作台"


def is_main_window(t):
    """只认产品自己的窗口。

    ⚠️ 别只看"工作台"三个字 —— 资源管理器打开项目文件夹时标题是
    「D:\\...\\辅导员工作台 - 文件资源管理器」，也会被匹配上（踩过）。
    """
    if not t or KW not in t:
        return False
    return "文件资源管理器" not in t and "资源管理器" not in t


def title_of(h):
    n = u.GetWindowTextLengthW(h)
    if not n:
        return ""
    buf = ctypes.create_unicode_buffer(n + 1)
    u.GetWindowTextW(h, buf, n + 1)
    return buf.value


def find(visible_only=False):
    """返回 [(hwnd, 标题, 是否可见)]，按 hwnd 排序保证稳定。"""
    out = []

    def cb(h, _l):
        t = title_of(h)
        if is_main_window(t):
            vis = bool(u.IsWindowVisible(h))
            if (not visible_only) or vis:
                out.append((h, t, vis))
        return True

    u.EnumWindows(EnumWindowsProc(cb), 0)
    return sorted(out)


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "state"
    wins = find()
    if cmd == "list":
        if not wins:
            print("（没有找到标题含「工作台」的窗口）")
            return 1
        for h, t, vis in wins:
            print(f"hwnd={h}  可见={vis}  最小化={bool(u.IsIconic(h))}  标题={t}")
        return 0
    if not wins:
        print("❌ 没有找到主窗口")
        return 2
    h, t, vis = wins[0]
    if cmd == "hide":
        u.ShowWindow(h, 0)  # SW_HIDE，等价于缩到托盘
        print(f"已隐藏窗口（hwnd={h}）→ 现在应看不到界面，只在托盘")
        return 0
    if cmd == "state":
        fg = u.GetForegroundWindow()
        print(f"标题={t}")
        print(f"  可见         = {bool(u.IsWindowVisible(h))}")
        print(f"  最小化       = {bool(u.IsIconic(h))}")
        print(f"  是否前台     = {h == fg}")
        return 0
    print("未知命令")
    return 3


sys.exit(main())
