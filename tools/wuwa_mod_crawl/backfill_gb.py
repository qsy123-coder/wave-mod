#!/usr/bin/env python3
"""GameBanana 一次性补抓：按 JASM 商店口径回溯一段时间的新增 + 更新。

JASM 商店首页用的是 `_sSort=default`（最近活动），卡片时间取
`_tsDateModified`（不是 `_tsDateUpdated`，后者很多 Mod 是 0）。

用法：
    python backfill_gb.py --since 2026-11-03            # 本周
    python backfill_gb.py --since 2026-11-03 --dry-run  # 只盘点，不写文件

做三件事：
  1. 我们完全没有收录的 Mod（漏抓的新提交）→ 写每日 CSV + 入下载队列；
  2. 已收录、但本周改过页面/文件的 Mod → 写「更新记录.csv」；
  3. 只有文件真的变了才重新下载（对比下载队列里已存的文件链接；
     从没下载过的，看文件上传时间是否晚于我们的收录时间）。
"""

from __future__ import annotations

import argparse
import csv
import logging
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gamebanana_watcher.client import GameBananaClient
from gamebanana_watcher.downloader import enqueue_rows, requeue_updates
from gamebanana_watcher.parser import parse_all
from gamebanana_watcher.poller import (
    _ts,
    build,
    load_config,
    merge_meta,
    prepare_updates,
    push_status,
    trigger_download_task,
    write_update_log,
)
from gamebanana_watcher.proxy import make_session
from kekehxl_watcher.gallery import download_images

log = logging.getLogger("gamebanana.backfill")


def scan(client: GameBananaClient, model_types: set[str], cutoff: int) -> dict[str, dict[str, Any]]:
    """翻三路排序，收集 max(修改时间, 发布时间) >= cutoff 的 Mod。"""
    found: dict[str, dict[str, Any]] = {}
    # (排序, 最多翻页, 时间早停字段)；default 是活跃度排序，不保证时间单调，
    # 所以用「连续两页都没有窗口内条目」当停止条件。
    plans = (("default", 15, None), ("new", 10, "_tsDateAdded"), ("updated", 15, "_tsDateUpdated"))
    for sort, max_pages, stop_key in plans:
        quiet = 0
        for page in range(1, max_pages + 1):
            recs = client.subfeed(page, sort=sort).get("_aRecords") or []
            if not recs:
                break
            in_window = 0
            oldest: int | None = None
            for rec in recs:
                if not client._keep(rec, model_types):
                    continue
                modified = _ts(rec, "_tsDateModified")
                added = _ts(rec, "_tsDateAdded")
                newest = max(modified, added)
                if newest:
                    oldest = newest if oldest is None else min(oldest, newest)
                if newest >= cutoff:
                    in_window += 1
                    found.setdefault(str(rec.get("_idRow")), rec)
            log.info("%s 第 %d 页：窗口内 %d 条", sort, page, in_window)
            if stop_key and oldest and oldest < cutoff:
                break
            if not stop_key:
                quiet = quiet + 1 if in_window == 0 else 0
                if quiet >= 2:
                    break
    return found


def _archive_ids(store) -> tuple[set[str], dict[str, str]]:
    path = Path(store.out_dir) / "all_mods.csv"
    ids: set[str] = set()
    versions: dict[str, str] = {}
    if not path.exists():
        return ids, versions
    with path.open("r", encoding=store.encoding, newline="") as fh:
        for row in csv.DictReader(fh):
            mid = str(row.get("mod_id") or "")
            if mid:
                ids.add(mid)
                versions[mid] = str(row.get("版本") or "")
    return ids, versions


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--since", required=True, help="起始日期，如 2026-11-03（本地时间）")
    parser.add_argument("--dry-run", action="store_true", help="只盘点，不写文件/不入队")
    args = parser.parse_args()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    since = datetime.strptime(args.since, "%Y-%m-%d").timestamp()
    client, store, notifier, meta = build(load_config())
    source = meta["source_name"]

    log.info("回溯起点：%s（%s）", args.since, "试运行" if args.dry_run else "实际写入")
    found = scan(client, meta["model_types"], since)
    log.info("窗口内共 %d 个 Mod", len(found))

    known = store.seen_ids
    archived, archived_versions = _archive_ids(store)
    new_records: list[dict[str, Any]] = []
    update_records: list[dict[str, Any]] = []

    for mid, rec in found.items():
        modified = _ts(rec, "_tsDateModified")
        added = _ts(rec, "_tsDateAdded")
        if mid not in known and mid not in archived:
            new_records.append(rec)              # 完全漏掉的新提交
        elif added < since <= modified:
            update_records.append(rec)           # 老 Mod 本周有改动
        # added >= since 的已收录条目就是本周新增的那批，不重复报更新

    rows = [r for r in parse_all(new_records, source) if r["mod_id"] not in archived]

    update_rows: list[dict[str, str]] = []
    requeue: list[str] = []
    enqueue_more: list[dict[str, str]] = []
    deferred: set[str] = set()
    if update_records:
        update_rows, requeue, enqueue_more, deferred = prepare_updates(
            client, store, meta, update_records
        )
        for row in update_rows:
            if not row.get("旧版本"):
                row["旧版本"] = archived_versions.get(row["mod_id"], "")

    if args.dry_run:
        print("\n=== 漏抓的新提交（将补进每日 CSV 并下载）===")
        for r in rows:
            print(f"  {r['日期']}  {r['mod_id']:>7}  {r['名称']}")
        print(f"  小计 {len(rows)}")
        print("\n=== 本周更新（写更新记录）===")
        for r in update_rows:
            print(f"  {r['更新时间'][:10]}  {r['mod_id']:>7}  {r['变化']:<12} "
                  f"v{r['旧版本'] or '?'} → v{r['版本'] or '?'}  {r['名称']}")
        print(f"  小计 {len(update_rows)}；重新入队 {len(requeue)}，新入队 {len(enqueue_more)}")
        return 0

    # —— 实际写入 ——
    if update_rows:
        write_update_log(store, update_rows)
    merge_meta(
        store,
        [r for r in found.values() if str(r.get("_idRow")) not in deferred],
    )
    store.state["initialized"] = True
    if rows:
        store.mark_seen([r["mod_id"] for r in rows])
        got = download_images(
            rows, store.out_dir,
            id_field="mod_id", url_field="_img_url",
            session=make_session(meta.get("proxy")),
        )
        if got:
            log.info("下载预览图 %d 张", got)
        store.archive(rows)

    queued = enqueue_rows(rows, meta["dl_state_path"]) if rows else 0
    if enqueue_more:
        queued += enqueue_rows(enqueue_more, meta["dl_state_path"])
    redone = requeue_updates(requeue, meta["dl_state_path"]) if requeue else []
    store.save_state()
    push_status(store, meta)

    if queued or redone:
        trigger_download_task()

    log.info(
        "补抓完成：新增 %d 条，更新 %d 条，入队 %d 个，重新入队 %d 个",
        len(rows), len(update_rows), queued, len(redone),
    )
    if rows or update_rows:
        notifier.send(
            f"{source} 补抓 · 新增 {len(rows)} · 更新 {len(update_rows)}",
            f"回溯 {args.since} 至今\n"
            + "\n".join(f"- {r['名称']}（{r['变化']}）" for r in update_rows[:8]),
        )

    print(f"\n新增 {len(rows)} 条，更新 {len(update_rows)} 条，入队 {queued} 个，重新入队 {len(redone)} 个")
    for r in rows:
        print(f"  [新增] {r['日期']}  {r['mod_id']:>7}  {r['名称']}")
    for r in update_rows:
        print(f"  [更新] {r['更新时间'][:10]}  {r['mod_id']:>7}  {r['变化']:<8}  {r['名称']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
