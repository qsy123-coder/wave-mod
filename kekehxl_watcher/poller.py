"""主轮询逻辑：拉取 → 差集 → 解析 → 归档 → 推送。"""

from __future__ import annotations

import configparser
import logging
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from .gallery import download_images, rebuild_gallery
from .kekehxl import AuthError, KekehxlClient, SiteChangedError
from .notify import Notifier
from .parser import parse_all
from .storage import Store

# 供 HTML 表格使用的字段映射
GALLERY_SPEC = {
    "link_col": "网站页面链接",
    "title_col": "mod名称",
    "tag_cols": ["日期", "分类", "角色标签", "提取码"],
    "pill_cols": ["夸克链接"],
    # (链接列, 提取码列) —— 用于生成"可整段复制去转存"的汇总
    "netdisk_pairs": [("夸克链接", "提取码")],
}

log = logging.getLogger("poller")

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.ini"


def load_config(path: Path | str = CONFIG_PATH) -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    if not Path(path).exists():
        raise SystemExit(
            f"缺少配置文件 {path}\n请复制 config.example.ini 为 config.ini 并填写。"
        )
    cfg.read(path, encoding="utf-8")
    return cfg


def build(cfg: configparser.ConfigParser) -> tuple[KekehxlClient, Store, Notifier, dict[str, Any]]:
    site = cfg["site"]
    poll = cfg["poll"]
    source_name = site.get("source_name", "未命名来源").strip()

    client = KekehxlClient(
        base_url=site["base_url"],
        password=site["password"],
        cookie_jar=BASE_DIR / site.get("cookie_jar", "cookies.json"),
        timeout=poll.getint("http_timeout", 30),
        retry=poll.getint("retry", 3),
    )
    # 每个来源一个独立子目录：out/<来源名>/
    store = Store(
        out_dir=BASE_DIR / cfg["storage"].get("out_dir", "out") / source_name,
        state_file=BASE_DIR / cfg["storage"].get("state_file", "state.json"),
        encoding=cfg["storage"].get("csv_encoding", "utf-8-sig"),
    )
    notifier = Notifier(
        key=cfg["notify"].get("serverchan_key", ""),
        token=cfg["notify"].get("pushplus_token", ""),
        enabled=cfg["notify"].getboolean("enabled", True),
    )
    meta = {
        "category_id": site.getint("category_id", 21),
        "category_name": site.get("category_name", "鸣潮Mod"),
        "first_run_baseline": poll.getboolean("first_run_baseline", True),
        "base_url": site["base_url"],
        "interval_minutes": poll.getint("interval_minutes", 10),
        "source_name": source_name,
    }
    return client, store, notifier, meta


def poll_once(
    client: KekehxlClient,
    store: Store,
    notifier: Notifier,
    meta: dict[str, Any],
    *,
    notify: bool = True,
) -> list[dict[str, str]]:
    """执行一次采集。返回本轮新入库的记录。"""
    client.ensure_login()

    # 回溯 2 天，避免重登空窗漏采；实际新内容靠 seen_ids 差集判定
    since = (datetime.now() - timedelta(days=2)).strftime("%Y-%m-%dT00:00:00")
    items = client.fetch_products(meta["category_id"], after=since, per_page=100)
    log.info("拉取到 %d 个商品", len(items))
    # 拉取成功即算「本轮跑通」，与是否入库无关，供健康巡检判断服务是否活着
    store.mark_polled()

    is_first = not store.state.get("initialized", False)
    seen = store.seen_ids

    fresh_items = [it for it in items if str(it.get("id")) not in seen]
    if not fresh_items:
        log.info("无新 mod")
        store.save_state()
        return []

    tag_map = client.fetch_tag_map()
    rows = parse_all(fresh_items, tag_map, meta["category_name"], meta["source_name"])

    # 首次运行严格限定为"当天"（站点日期为 UTC，与站点 date 字段口径一致）
    if is_first:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        kept = [r for r in rows if r["日期"] == today]
        if len(kept) != len(rows):
            log.info("首次运行：仅保留当天（%s）数据，跳过 %d 条历史", today, len(rows) - len(kept))
        rows = kept

    # 标记「所有拉取到的」ID 为已见：既包含本轮归档的，也包含首轮故意跳过的历史条目。
    # 否则历史条目每轮都会被重新判为"新 mod"，导致重复推送。
    # 站点发布时即带网盘链接，故无需担心"先发布后补链接"的情况。
    all_fetched_ids = [str(it["id"]) for it in items]

    if not rows:
        log.warning("发现 %d 个新商品，但均无夸克链接（已跳过）", len(fresh_items))
        store.mark_seen(all_fetched_ids)
        store.state["initialized"] = True
        store.save_state()
        return []

    # 先下载预览图（填入 预览图 列），再归档，最后据 CSV 重建 HTML 表格
    got = download_images(
        rows, store.out_dir,
        id_field="product_id", url_field="_img_url", session=client.session,
    )
    if got:
        log.info("下载预览图 %d 张", got)

    stats = store.archive(rows)
    store.mark_seen(all_fetched_ids)
    store.state["initialized"] = True
    store.save_state()

    try:
        rebuild_gallery(store.out_dir, meta["source_name"], **GALLERY_SPEC)
    except Exception as exc:  # noqa: BLE001 - 表格生成失败不应影响采集
        log.warning("HTML 表格生成失败：%s", exc)

    if notify:
        if is_first and meta["first_run_baseline"]:
            notifier.send(
                f"{meta['source_name']}监测已启动 · 基线 {len(rows)} 条",
                "首次运行，已把近期 mod 归档为基线。\n\n"
                + "\n".join(
                    f"- {r['mod名称']}（{r['日期']}）\n  {r['夸克链接']}" for r in rows[:15]
                ),
            )
        else:
            notifier.send_new_mods(rows, meta["source_name"], meta["base_url"])

    log.info("本轮入库 %d 条", stats["daily"])
    return rows


def run_once() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    try:
        client, store, notifier, meta = build(load_config())
        poll_once(client, store, notifier, meta)
        return 0
    except (AuthError, SiteChangedError) as exc:
        log.error("采集失败：%s", exc)
        try:
            _, _, notifier, _ = build(load_config())
            notifier.send_alert("采集失败", str(exc))
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
    log.info("常驻轮询启动，间隔 %d 分钟", interval)

    consecutive_failures = 0
    while True:
        try:
            poll_once(client, store, notifier, meta)
            consecutive_failures = 0
        except (AuthError, SiteChangedError) as exc:
            consecutive_failures += 1
            log.error("采集失败（连续 %d 次）：%s", consecutive_failures, exc)
            if consecutive_failures in (1, 5, 20):  # 避免持续刷屏
                notifier.send_alert("采集失败", f"连续 {consecutive_failures} 次失败：{exc}")
        except Exception as exc:  # noqa: BLE001
            log.exception("未预期错误：%s", exc)

        try:
            time.sleep(interval * 60)
        except KeyboardInterrupt:
            log.info("收到中断，退出")
            return 0


if __name__ == "__main__":
    sys.exit(run_forever())
