# -*- coding: utf-8 -*-
"""
生成 Tauri 桌面应用所需的图标集。

用法：
    python .build/make-icons.py <校徽源图.png> <输出目录>

输出（Tauri 的 bundle.icon 会引用前四个）：
    32x32.png / 128x128.png / 128x128@2x.png(256) / icon.ico(多尺寸) / icon.png(512)

换校徽时只要重跑本脚本，不用手工切图。
"""
import os
import sys

from PIL import Image


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)

    im = Image.open(src).convert("RGBA")

    # 裁掉透明留白再补成正方形：不留白图标才占得满，糊得也少
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    w, h = im.size
    side = max(w, h)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - w) // 2, (side - h) // 2))
    im = canvas

    def rs(n: int) -> Image.Image:
        return im.resize((n, n), Image.LANCZOS)

    rs(32).save(os.path.join(out, "32x32.png"))
    rs(128).save(os.path.join(out, "128x128.png"))
    rs(256).save(os.path.join(out, "128x128@2x.png"))
    rs(512).save(os.path.join(out, "icon.png"))
    rs(256).save(
        os.path.join(out, "icon.ico"),
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )

    print("源图尺寸:", Image.open(src).size, "-> 输出:", os.path.abspath(out))
    for f in sorted(os.listdir(out)):
        p = os.path.join(out, f)
        print(f"  {f:16s} {os.path.getsize(p):>7d} B")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
