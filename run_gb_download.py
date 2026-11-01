#!/usr/bin/env python3
"""GameBanana 原图 + 附件下载（由 Windows 任务计划 GameBananaModDownload 调用）。

采集任务（run_gb_once.py）只负责把新 Mod 写进队列；这里按队列慢慢下载，
避免大附件把 10 分钟上限的采集任务拖死。
"""

import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gamebanana_watcher.downloader import process_queue
from gamebanana_watcher.poller import build, load_config


def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    log = logging.getLogger("gamebanana.download")
    cfg = load_config()
    client, store, notifier, meta = build(cfg)
    dl = meta["download"]
    if not dl.enabled:
        log.info("config.gb.ini [download] enabled = false，跳过")
        return 0

    stats = process_queue(
        client,
        dl,
        meta["dl_state_path"],
        Path(store.out_dir),          # 来源目录（…/_Mod每日汇总/GameBanana）
        notifier,
    )
    log.info("下载任务结束：%s", stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
