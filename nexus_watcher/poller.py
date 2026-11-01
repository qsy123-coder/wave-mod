"""Nexus Mods 采集主逻辑（跑在首尔服务器，由 systemd 拉起）。

与其他来源的差别：
  - 只有一个接口：`latest_added` 固定返回最新 10 个 mod，直接与 seen_ids 差集
  - 没有网盘链接，站内直接下载，故不生成「链接汇总」txt
  - 首页 HTML 无预览图直链，用 API 的 picture_url，发现当下就下载到 images/

不丢数据的边界：间隔内新增超过 10 个 mod 时，滚出头部 10 条的会被漏掉。
鸣潮分区日均远低于 10，故按 30 分钟轮询足够安全。
"""

from __future__ import annotations

import configparser
import logging
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from kekehxl_watcher.gallery import download_images, rebuild_gallery
from kekehxl_watcher.notify import Notifier
from kekehxl_watcher.storage import Store

from .client import ApiError, LATEST_ADDED_LIMIT, NexusClient
from .columns import NEXUS_COLUMNS
from .parser import parse_all

log = logging.getLogger("nexus.poller")

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.nexus.ini"

# 供 HTML 表格使用的字段映射
# 不展示「分类」：鸣潮分区只有 Wuthering Waves / Miscellaneous 两个分类，
# 几乎每行都是 Miscellaneous，放在标签里只是噪音。
GALLERY_SPEC = {
    "link_col": "页面链接",
    "title_col": "名称",
    "tag_cols": ["日期", "作者", "版本", "下载量", "成人内容"],
    # 直接下载，没有网盘直链，故不生成链接汇总
    "netdisk_pairs": [],
    "thumb_size": (160, 160),
}


def load_config(path: Path | str = CONFIG_PATH) -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    if not Path(path).exists():
        raise SystemExit(f"缺少配置文件 {path}（可复制 config.nexus.example.ini）")
    cfg.read(path, encoding="utf-8")
    return cfg


def build(cfg: configparser.ConfigParser) -> tuple[NexusClient, Store, Notifier, dict[str, Any]]:
    site = cfg["site"]
    poll = cfg["poll"]
    source_name = site.get("source_name", "Nexus Mods").strip()

    api_key = site.get("api_key", "").strip()
    if not api_key:
        raise SystemExit(
            "config.nexus.ini 的 api_key 为空。\n"
            "去 https://www.nexusmods.com/users/myaccount?tab=api 免费生成一个，"
            "填进 [site] api_key 后重试。"
        )

    client = NexusClient(
        domain=site.get("domain", "wutheringwaves").strip(),
        api_key=api_key,
        timeout=poll.getint("http_timeout", 30),
        retry=poll.getint("retry", 3),
    )
    store = Store(
        out_dir=BASE_DIR / cfg["storage"].get("out_dir", "out") / source_name,
        state_file=BASE_DIR / cfg["storage"].get("state_file", "state.nexus.json"),
        encoding=cfg["storage"].get("csv_encoding", "utf-8-sig"),
        columns=NEXUS_COLUMNS,
        id_field="mod_id",
    )
    notifier = Notifier(
        key=cfg["notify"].get("serverchan_key", ""),
        token=cfg["notify"].get("pushplus_token", ""),
        enabled=cfg["notify"].getboolean("enabled", True),
    )
    meta = {
        "source_name": source_name,
        "domain": client.domain,
        "first_run_baseline": poll.getboolean("first_run_baseline", True),
        "interval_minutes": poll.getint("interval_minutes", 30),
    }
    return client, store, notifier, meta


def poll_once(
    client: NexusClient,
    store: Store,
    notifier: Notifier,
    meta: dict[str, Any],
    *,
    notify: bool = True,
) -> list[dict[str, str]]:
    """执行一次采集。返回本轮新入库的记录。"""
    is_first = not store.state.get("initialized", False)

    mods = client.latest_added()
    log.info("拉取到 %d 个 mod", len(mods))
    # 拉取成功即算「本轮跑通」，与是否入库无关，供健康巡检判断服务是否活着
    store.mark_polled()

    if not mods:
        log.info("接口返回空列表")
        store.save_state()
        return []

    if len(mods) >= LATEST_ADDED_LIMIT:
        log.debug("接口满额返回 %d 条（正常）", len(mods))

    cat_map = client.category_map()
    rows_all = parse_all(mods, cat_map, meta["source_name"], meta["domain"])
    all_ids = [r["mod_id"] for r in rows_all]

    seen = store.seen_ids
    fresh = [r for r in rows_all if r["mod_id"] not in seen]

    if is_first:
        # 首次：只归档当天，其余历史标为已见，但不计入「有新 mod」
        today = datetime.utcnow().strftime("%Y-%m-%d")
        kept = [r for r in fresh if r["日期"] == today]
        if len(kept) != len(fresh):
            log.info(
                "首次运行：仅保留当天（%s）数据，跳过 %d 条历史", today, len(fresh) - len(kept)
            )
        fresh = kept

    if not fresh:
        log.info("无新 mod")
        if is_first:
            # 基线：接口返回的全标为已见，免得下一轮又当成新的
            store.mark_seen(all_ids, new=False)
            store.state["initialized"] = True
        store.save_state()
        return []

    store.mark_seen(all_ids)

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for r in fresh:
        r["首次发现时间"] = now

    got = download_images(fresh, store.out_dir, id_field="mod_id", url_field="_img_url")
    if got:
        log.info("下载预览图 %d 张", got)

    store.archive(fresh)
    store.state["initialized"] = True
    store.save_state()

    try:
        rebuild_gallery(store.out_dir, meta["source_name"], **GALLERY_SPEC)
    except Exception as exc:  # noqa: BLE001 - 表格生成失败不应影响采集
        log.warning("HTML 表格生成失败：%s", exc)

    if notify:
        top = fresh[:15]
        body = "\n".join(
            f"- **{r['名称']}**（{r['作者']} · {r['分类']}）\n  {r['页面链接']}" for r in top
        )
        if len(fresh) > 15:
            body += f"\n\n… 另有 {len(fresh) - 15} 条，详见汇总 CSV。"
        label = "监测已启动 · 基线" if is_first else "更新 · 发现"
        notifier.send(f"{meta['source_name']} {label} {len(fresh)} 个", body)

    log.info("本轮入库 %d 条", len(fresh))
    return fresh


def run_once() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    try:
        client, store, notifier, meta = build(load_config())
        poll_once(client, store, notifier, meta)
        return 0
    except ApiError as exc:
        log.error("采集失败：%s", exc)
        try:
            _, _, notifier, _ = build(load_config())
            notifier.send_alert("Nexus Mods 采集失败", str(exc))
        except Exception:  # noqa: BLE001 - 告警本身失败不应再抛
            pass
        return 1
    except Exception as exc:  # noqa: BLE001
        log.exception("未预期错误：%s", exc)
        return 2


def run_forever() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    client, store, notifier, meta = build(load_config())
    interval = meta["interval_minutes"]
    log.info("Nexus Mods 常驻轮询启动，间隔 %d 分钟", interval)

    failures = 0
    while True:
        try:
            poll_once(client, store, notifier, meta)
            failures = 0
        except ApiError as exc:
            failures += 1
            log.error("采集失败（连续 %d 次）：%s", failures, exc)
            if failures in (1, 5, 20):  # 避免持续刷屏
                notifier.send_alert("Nexus Mods 采集失败", f"连续 {failures} 次：{exc}")
        except Exception as exc:  # noqa: BLE001
            log.exception("未预期错误：%s", exc)

        try:
            time.sleep(interval * 60)
        except KeyboardInterrupt:
            log.info("收到中断，退出")
            return 0


if __name__ == "__main__":
    sys.exit(run_forever())
