#!/usr/bin/env python3
"""把 arca.live 列表页里「本站从没归档过」的历史帖标记为已见（不归档、不推送）。

为什么需要它：state.arca.json 丢失后，只按本地 all_mods.csv 重建 seen_ids 是不够的 ——
`모드 추천` 分类不是按时间排序，三个分类页合计有上百条从未入库的老帖，
空 state 起服会把它们全部当新帖归档并推一条「发现 105 条」。

用法（服务器上，仓库根目录）：

    xvfb-run -a python3 deploy/seed_arca_seen.py                    # 只看统计
    xvfb-run -a python3 deploy/seed_arca_seen.py --apply --keep-since 2026-10-24

`--keep-since` 之前的帖子标为已见；当天及以后的留着，让正常轮询去归档（补停机期间的新帖）。
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from arca_watcher.arca import fetch_category  # noqa: E402
from arca_watcher.browser import browser_page  # noqa: E402
from arca_watcher.poller import build, load_config  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="真正写入 state（默认只打印）")
    ap.add_argument("--keep-since", default="", help="该日期（含）之后的帖子不动，默认只保留今天")
    args = ap.parse_args()

    cfg = load_config()
    store, _notifier, meta = build(cfg)
    keep_since = args.keep_since or "9999-99-99"

    rows: dict[str, str] = {}
    with browser_page() as page:
        for slug, name in meta["categories"].items():
            for row in fetch_category(page, meta["base_url"], meta["board"], slug, name):
                rows.setdefault(row["article_id"], row["日期"])
            print(f"  {name}: 累计 {len(rows)} 条")

    seen = store.seen_ids
    unseen = {aid: d for aid, d in rows.items() if aid not in seen}
    print(f"列表页 {len(rows)} 条，其中未入库 {len(unseen)} 条")
    print("未入库按日期分布：", dict(sorted(Counter(unseen.values()).items(), reverse=True)))

    to_mark = {aid for aid, d in unseen.items() if d < keep_since}
    print(f"将标记为已见 {len(to_mark)} 条（保留 {len(unseen) - len(to_mark)} 条给轮询归档）")
    if not args.apply:
        print("（未加 --apply，仅预览）")
        return 0

    merged = seen | to_mark
    store.state["seen_ids"] = sorted(merged)
    store.state["initialized"] = True
    store.save_state()
    print(f"已写入 {store.state_file}，seen_ids 共 {len(merged)} 条")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
