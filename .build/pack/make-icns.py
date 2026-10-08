#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 PNG 源图生成 macOS 图标 icons/icon.icns。

为什么要自己写：`.icns` 只是「一堆 PNG 装进一个带标签的容器」，格式很简单，
用脚本生成比装一堆图标工具省事，而且**不会动到 Windows 那套 .ico / png 图标**
（`tauri icon` 会把整个 icons/ 目录重新生成一遍，没必要冒这个险）。

icns 的 ic07~ic14 这几类可以直接塞 PNG 数据，不需要老的 RGB/JPEG 编码。

用法: python .build/make-icns.py <源图.png> <输出.icns>
"""
import io
import struct
import sys

SRC_DEFAULT = "app/src-tauri/icons/icon.png"
OUT_DEFAULT = "app/src-tauri/icons/icon.icns"

# (icns 类型标签, 像素边长)  —— 覆盖 macOS 需要的所有档位
#   ic11/ic12 是 16@2x / 32@2x，ic13/ic14 是 128@2x / 256@2x，
#   ic07/ic08/ic09/ic10 依次 128/256/512/1024
SLOTS = [
    ("ic11", 32),    # 16pt @2x
    ("ic12", 64),    # 32pt @2x
    ("ic07", 128),   # 128pt @1x
    ("ic13", 256),   # 128pt @2x
    ("ic09", 512),   # 512pt @1x
    ("ic10", 1024),  # 512pt @2x（缩放到 1024）
]


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else SRC_DEFAULT
    out = sys.argv[2] if len(sys.argv) > 2 else OUT_DEFAULT

    try:
        from PIL import Image
    except ImportError:
        sys.exit("需要 Pillow：用 html-to-docx 的托管 venv 跑这个脚本")

    im = Image.open(src).convert("RGBA")
    print(f"源图 {src} = {im.width}×{im.height}")

    chunks = []
    for tag, size in SLOTS:
        # 放大时用 LANCZOS（比默认的最近邻好得多）；缩小同理
        r = im.resize((size, size), Image.LANCZOS) if im.size != (size, size) else im
        buf = io.BytesIO()
        r.save(buf, format="PNG", optimize=True)
        data = buf.getvalue()
        chunks.append((tag, data))
        note = "（放大自较小源图，会略软）" if size > im.width else ""
        print(f"  {tag}  {size:>4}×{size:<4} {len(data):>7,} B{note}")

    body = b"".join(tag.encode("ascii") + struct.pack(">I", len(data) + 8) + data
                    for tag, data in chunks)
    blob = b"icns" + struct.pack(">I", len(body) + 8) + body
    with open(out, "wb") as f:
        f.write(blob)
    print(f"已写出 {out}（{len(blob):,} 字节，{len(chunks)} 档）")


if __name__ == "__main__":
    main()
