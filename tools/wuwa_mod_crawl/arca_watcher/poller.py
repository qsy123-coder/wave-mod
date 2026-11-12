"""arca.live 轮询主逻辑：开浏览器 → 抓三个 Mod 分类 → 差集 → 归档 → 推送。

storage / notify 与可可站共用（见 kekehxl_watcher），仅列定义与去重键不同。
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

from .arca import CATEGORIES, fetch_category, fetch_post_links
from .browser import ChallengeTimeout, browser_page
from .columns import ARCA_COLUMNS

log = logging.getLogger("arca.poller")

# 供 HTML 表格使用的字段映射
GALLERY_SPEC = {
    "link_col": "帖子链接",
    "title_col": "标题",
    "tag_cols": ["日期", "分类", "作者", "浏览量"],
    # 该站列表缩略图是 100×100 正方形，用方形框避免留下大片空白
    "thumb_size": (150, 150),
    # 帖内正文里的下载链接（base64 解出来的）；无提取码列
    "netdisk_pairs": [("下载链接", None)],
    "links_label": "下载链接",
    "links_filename": "下载链接.txt",
}

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.arca.ini"


class BrowserError(RuntimeError):
    """浏览器侧不可恢复的问题（验证码过不去、站点结构变化等）。"""


def load_config(path: Path | str = CONFIG_PATH) -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    if not Path(path).exists():
        raise SystemExit(f"缺少配置文件 {path}（可复制 config.arca.example.ini）")
    cfg.read(path, encoding="utf-8")
    return cfg


def build(cfg: configparser.ConfigParser) -> tuple[Store, Notifier, dict[str, Any]]:
    site = cfg["site"]
    source_name = site.get("source_name", "arca.live").strip()
    store = Store(
        out_dir=BASE_DIR / cfg["storage"].get("out_dir", "out") / source_name,
        state_file=BASE_DIR / cfg["storage"].get("state_file", "state.arca.json"),
        encoding=cfg["storage"].get("csv_encoding", "utf-8-sig"),
        columns=ARCA_COLUMNS,
        id_field="article_id",
    )
    notifier = Notifier(
        key=cfg["notify"].get("serverchan_key", ""),
        token=cfg["notify"].get("pushplus_token", ""),
        enabled=cfg["notify"].getboolean("enabled", True),
    )
    slugs = [s.strip() for s in site.get("categories", "").split(",") if s.strip()]
    meta = {
        "source_name": source_name,
        "base_url": site.get("base_url", "https://arca.live").rstrip("/"),
        "board": site.get("board", "thingzyoa"),
        "categories": {s: CATEGORIES.get(s, s) for s in slugs} or dict(CATEGORIES),
        "first_run_baseline": cfg["poll"].getboolean("first_run_baseline", True),
        "interval_minutes": cfg["poll"].getint("interval_minutes", 15),
        "cf_wait": cfg["poll"].getint("cf_wait_seconds", 6),
    }
    return store, notifier, meta


def collect(
    meta: dict[str, Any],
    seen_ids: set[str],
    is_first: bool,
) -> list[dict[str, str]]:
    """开**一次**浏览器：抓所有分类，并对需要的新帖顺带取帖内下载链接。

    帖内链接只在同一个会话里抓，避免每轮多开一次浏览器（约多 5 秒）。
    """
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    try:
        with browser_page() as page:
            for slug, name in meta["categories"].items():
                try:
                    for row in fetch_category(page, meta["base_url"], meta["board"], slug, name):
                        if row["article_id"] in seen:
                            continue
                        seen.add(row["article_id"])
                        rows.append(row)
                except ChallengeTimeout as exc:
                    log.warning("[%s] 验证码未通过，跳过：%s", name, exc)

            # 只对「新增帖」进正文取下载链接：全量抓会白跑几十个页面
            targets = [r for r in rows if r["article_id"] not in seen_ids]
            if is_first:
                today = datetime.utcnow().strftime("%Y-%m-%d")
                targets = [r for r in targets if r["日期"] == today]
            if targets:
                log.info("对 %d 个新帖取帖内下载链接…", len(targets))
                for r in targets:
                    r["下载链接"] = fetch_post_links(page, meta["base_url"], r["article_id"])
    except Exception as exc:  # noqa: BLE001 - 浏览器启动等失败统一上抛
        raise BrowserError(str(exc)) from exc
    return rows


def poll_once(store: Store, notifier: Notifier, meta: dict[str, Any], *, notify: bool = True) -> list[dict[str, str]]:
    is_first = not store.state.get("initialized", False)
    fetched = collect(meta, store.seen_ids, is_first)
    if not fetched:
        log.warning("未抓到任何内容（可能整轮验证码未通过）")
        return []

    # 抓取成功即算「本轮跑通」，与是否入库无关，供健康巡检判断服务是否活着
    store.mark_polled()

    seen_ids = store.seen_ids
    fresh = [r for r in fetched if r["article_id"] not in seen_ids]

    if not fresh:
        log.info("无新帖")
        store.save_state()
        return []

    # 首次运行只保留当天，避免把历史帖子当"新"（与可可站口径一致）
    if is_first:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        kept = [r for r in fresh if r["日期"] == today]
        if len(kept) != len(fresh):
            log.info("首次运行：仅保留当天（%s），跳过 %d 条历史", today, len(fresh) - len(kept))
        fresh = kept

    # 标记「所有抓到的」为已见，防止历史帖子每轮重复推送
    all_ids = [r["article_id"] for r in fetched]

    if not fresh:
        store.mark_seen(all_ids)
        store.state["initialized"] = True
        store.save_state()
        return []

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for r in fresh:
        r["来源"] = meta["source_name"]
        r["首次发现时间"] = now

    # arca 的缩略图是带签名的临时 URL，必须趁现在下载下来，否则过后就失效了
    got = download_images(fresh, store.out_dir, id_field="article_id", url_field="_img_url")
    if got:
        log.info("下载预览图 %d 张", got)

    store.archive(fresh)
    store.mark_seen(all_ids)
    store.state["initialized"] = True
    store.save_state()

    try:
        rebuild_gallery(store.out_dir, meta["source_name"], **GALLERY_SPEC)
    except Exception as exc:  # noqa: BLE001
        log.warning("HTML 表格生成失败：%s", exc)

    if notify:
        if is_first and meta["first_run_baseline"]:
            notifier.send(
                f"{meta['source_name']} 监测已启动 · 基线 {len(fresh)} 条",
                "首次运行，已把当天帖子归档为基线。\n\n"
                + "\n".join(f"- {r['标题']}（{r['分类']}）\n  {r['帖子链接']}" for r in fresh[:15]),
            )
        else:
            top = fresh[:15]
            body = "\n".join(
                f"- **{r['标题']}**（{r['分类']}）\n  {r['帖子链接']}" for r in top
            )
            if len(fresh) > 15:
                body += f"\n\n… 另有 {len(fresh) - 15} 条，详见汇总 CSV。"
            notifier.send(f"{meta['source_name']} 更新 · 发现 {len(fresh)} 个新帖", body)

    log.info("本轮入库 %d 条", len(fresh))
    return fresh


def run_once() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    store, notifier, meta = build(load_config())
    try:
        poll_once(store, notifier, meta)
        return 0
    except BrowserError as exc:
        log.error("采集失败：%s", exc)
        notifier.send_alert("arca.live 采集失败", str(exc))
        return 1
    except Exception as exc:  # noqa: BLE001
        log.exception("未预期错误：%s", exc)
        return 2


def run_forever() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    store, notifier, meta = build(load_config())
    interval = meta["interval_minutes"]
    log.info("arca.live 常驻轮询启动，间隔 %d 分钟", interval)

    failures = 0
    while True:
        try:
            poll_once(store, notifier, meta)
            failures = 0
        except BrowserError as exc:
            failures += 1
            log.error("采集失败（连续 %d 次）：%s", failures, exc)
            if failures in (1, 5, 20):
                notifier.send_alert("arca.live 采集失败", f"连续 {failures} 次：{exc}")
        except Exception as exc:  # noqa: BLE001
            log.exception("未预期错误：%s", exc)

        try:
            time.sleep(interval * 60)
        except KeyboardInterrupt:
            log.info("收到中断，退出")
            return 0


if __name__ == "__main__":
    sys.exit(run_forever())
