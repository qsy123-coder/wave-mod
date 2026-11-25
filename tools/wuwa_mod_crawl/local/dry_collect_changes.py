#!/usr/bin/env python3
"""只读预演：跑一遍 collect_changes，看修复后本轮会报多少「新增 / 更新」。

不会写任何状态文件（不调用 store.save_state）。
"""

from __future__ import annotations

import configparser
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from gamebanana_watcher import poller as P  # noqa: E402


def main() -> None:
    cfg = configparser.ConfigParser()
    cfg.read(ROOT / "config.gb.ini", encoding="utf-8")
    client, store, _notifier, meta = P.build(cfg)

    meta_before = store.state.setdefault("mod_meta", {})
    seen = set(map(str, store.seen_ids))
    missing = sorted(x for x in seen if x not in meta_before)
    print(f"seen={len(seen)} 有基线={len(meta_before)} 缺基线={len(missing)}")

    new, upd = P.collect_changes(client, store, meta)
    print(f"本轮判定：新增 {len(new)}，更新 {len(upd)}")
    for rec in new:
        print("  NEW", rec.get("_idRow"), rec.get("_sName"))
    for rec in upd:
        print("  UPD", rec.get("_idRow"), rec.get("_sName"))
    print("（未写盘）")


if __name__ == "__main__":
    main()
