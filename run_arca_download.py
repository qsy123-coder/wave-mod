#!/usr/bin/env python3
"""arca.live 原图 + Mod 文件下载（由 Windows 任务计划 ArcaModDownload 调用）。

与 run_gb_download.py 同一套路：采集在服务器上跑，本机只负责按队列把图片和
Mod 文件落到 A_每日更新/W-YYYY.MM.DD/。队列持久化在 state.arca_downloads.json，
关机/失败后下一轮自动续传。

用法：
    python run_arca_download.py              # 正常跑
    python run_arca_download.py --plan-only  # 只解析帖子/列目录，不下载
    python run_arca_download.py --limit 1    # 只处理 1 个帖子（调试用）
"""

import argparse
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from arca_watcher.downloader import (  # noqa: E402
    enqueue_from_csv,
    find_csv,
    load_settings,
    process_queue,
)
from arca_watcher.poller import BASE_DIR, load_config  # noqa: E402
from gamebanana_watcher.proxy import resolve_proxy  # noqa: E402
from kekehxl_watcher.notify import Notifier  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="arca.live 图片 + Mod 文件下载")
    parser.add_argument("--plan-only", action="store_true", help="只规划，不下载")
    parser.add_argument("--limit", type=int, default=None, help="本轮最多处理几个帖子")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    log = logging.getLogger("arca.download")

    cfg = load_config()
    settings = load_settings(cfg)
    if not settings.enabled:
        log.info("config.arca.ini [download] enabled = false，跳过")
        return 0
    if not settings.dest_dir:
        log.error("config.arca.ini [download] dest_dir 未配置，无法下载")
        return 2

    net = cfg["net"] if cfg.has_section("net") else None
    settings.proxy = resolve_proxy(
        net.get("proxy", "auto") if net else "auto",
        autostart=net.getboolean("autostart", False) if net else False,
        app_path=(net.get("app_path", "").strip() or None) if net else None,
        wait_seconds=net.getint("autostart_wait", 40) if net else 40,
    )
    if settings.proxy:
        log.info("使用代理：%s", settings.proxy)
    else:
        log.warning("未检测到代理；arca.live 帖子页可能打不开（图片会失败，外链下载不受影响）")

    notifier = Notifier(
        key=cfg["notify"].get("serverchan_key", "") if cfg.has_section("notify") else "",
        token=cfg["notify"].get("pushplus_token", "") if cfg.has_section("notify") else "",
        enabled=cfg["notify"].getboolean("enabled", True) if cfg.has_section("notify") else False,
    )

    dest_root = Path(settings.dest_dir)
    source_name = cfg["site"].get("source_name", "arca.live").strip() or "arca.live"
    csv_path = find_csv(settings, source_name)
    state_path = BASE_DIR / settings.state_file

    added = enqueue_from_csv(csv_path, state_path, settings)
    if added:
        log.info("新入队 %d 个帖子", added)

    stats = process_queue(
        settings,
        state_path,
        dest_root,
        notifier,
        max_items=args.limit,
        plan_only=args.plan_only,
        source_name=source_name,
    )
    log.info("下载任务结束：%s", stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
