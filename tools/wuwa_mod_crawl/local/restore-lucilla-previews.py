#!/usr/bin/env python3
"""按下载队列里记录的 URL 重新抓回某个 mod 的预览图。

2026-11-25：W-2026.11.25 里 Lucilla 的 8 张图在打包前丢了（目录里只剩 exe），
state.gb_downloads.json 里还留着原图 URL，直接重下并按站内编号命名
（封面无后缀，其余 -1 / -2 …），与 exe 同名。

用法：
    python -I local/restore-lucilla-previews.py --mod=726963 --base="洛瑟菈-灯光 摄影 开拍 v1.2" --dir="<目标目录>"

默认 dry-run；加 --apply 才真正下载。
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / "state.gb_downloads.json"
PROXY = "http://127.0.0.1:7897"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--mod", required=True, help="mod_id，如 726963")
    ap.add_argument("--base", required=True, help="目标基名（与 exe 同名，不含扩展名）")
    ap.add_argument("--dir", required=True, help="输出目录")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    state = json.loads(STATE.read_text(encoding="utf-8"))
    item = (state.get("items") or {}).get(str(args.mod))
    if not item:
        raise SystemExit(f"下载队列里没有 {args.mod}")
    images = [x for x in (item.get("images") or []) if x.get("url")]
    if not images:
        raise SystemExit("这条记录没有图片 URL")

    out_dir = Path(args.dir)
    sess = requests.Session()
    sess.trust_env = False
    sess.proxies = {"http": PROXY, "https": PROXY}
    sess.headers["User-Agent"] = UA

    index = 0
    for img in images:
        ext = Path(str(img.get("file") or "")).suffix or ".jpg"
        name = f"{args.base}{ext}" if index == 0 else f"{args.base}-{index}{ext}"
        dest = out_dir / name
        index += 1
        if dest.exists():
            print(f"跳过（已存在）：{name}")
            continue
        print(f"{img['url']}\n  -> {name}")
        if not args.apply:
            continue
        resp = sess.get(img["url"], timeout=120)
        resp.raise_for_status()
        dest.write_bytes(resp.content)
        print(f"  已保存 {dest.stat().st_size/1024:.0f} KB")
        time.sleep(0.5)

    print("DRY-RUN（未下载）。加 --apply 执行。" if not args.apply else "完成。")


if __name__ == "__main__":
    sys.exit(main())
