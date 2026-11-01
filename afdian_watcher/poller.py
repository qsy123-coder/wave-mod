"""爱发电采集主逻辑（跑在首尔服务器，由 systemd 拉起）。

结构基本照搬 `patreon_watcher/poller.py` —— 两者是同一类来源（按作者监测）：

  - **多作者，每个作者一套独立产出**：作者列表写在 `[creators]`，
    产出按作者分目录 `out/爱发电/<slug>/`（各自一份每日 CSV / `all_mods.csv` /
    `images/` / `index.html`）。实现上就是**每个作者一个 `Store` + 一个 state 文件**
    （`state.afdian.<slug>.json`），复用 `Store` 一行没改。
    ⚠️ 首轮判定必须是**作者级**的，理由同 Patreon：共用一个 Store 的话，
    第一个作者跑完就置 `initialized=True`，后面全被当成"非首轮"、拿不到完整历史。
  - **通知合并成一条**：作者一多各推一条会把微信刷爆，见 `_send_digest`
  - **发现源**：付费帖匿名拿不到正文和配图（见 client.py），故不生成网盘链接汇总
  - **首轮全量建档**：第一次运行归档该作者的全部历史，但**不推送通知**

与其他来源的差别：
  - **不需要任何凭据** —— 爱发电这三个接口是匿名可用的，没有 session / api key
  - **不需要浏览器** —— 纯 HTTP。浏览器只在**开发期**用来定位接口（见 README）

注意事项：
  - 站点是纯 SPA，纯 HTTP 抓页面拿不到东西，只能走 `/api/*` 接口
  - `source_name` 不能含空格（本机 `sync.ps1` 的老坑，见 README）
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

from .client import AfdianClient, ApiError
from .columns import AFDIAN_COLUMNS
from .parser import parse_post

log = logging.getLogger("afdian.poller")

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.afdian.ini"

# 供 HTML 表格使用的字段映射
GALLERY_SPEC = {
    "link_col": "页面链接",
    "title_col": "名称",
    "tag_cols": ["日期", "作者", "价格", "点赞", "评论"],
    "netdisk_pairs": [],          # 拿不到下载直链，故不生成网盘链接汇总
    "thumb_size": (160, 160),
}


def load_config(path: Path | str = CONFIG_PATH) -> configparser.ConfigParser:
    # 这两个 kwargs 都是踩过的坑，与 patreon_watcher.poller.load_config 同理：
    #   - `optionxform=str` 必须在 **read() 之前**设。configparser 是在读取时就把
    #     键名小写化存下来的，读完之后再设改不回来。`[creators]` 的键是作者 slug，
    #     它同时用作**目录名**和 **state 文件名**，被小写了目录名就跟着变形。
    #   - `inline_comment_prefixes`：默认不认行内注释，给作者写 `; 说明` 时
    #     user_id 会连着注释一起被吃进去，接口自然查不到，且报错很难懂。
    cfg = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
    cfg.optionxform = str  # type: ignore[assignment]
    if not Path(path).exists():
        raise SystemExit(f"缺少配置文件 {path}（可复制 config.afdian.example.ini）")
    cfg.read(path, encoding="utf-8")
    return cfg


def _load_creators(cfg: configparser.ConfigParser) -> list[dict[str, str]]:
    """`[creators]` 段 → [{slug, user_id}]。

    写法（每行一个作者）：
        辉映星辰允如光 = 4517xx      ; 键是 slug（afdian.com/a/<slug> 那截）
        someone      =               ; user_id 留空则自动按 slug 解析并缓存
    """
    if not cfg.has_section("creators"):
        return []
    out: list[dict[str, str]] = []
    for slug, uid in cfg["creators"].items():
        slug = slug.strip()
        if not slug or slug.startswith(("#", ";")):
            continue
        out.append({"slug": slug, "user_id": (uid or "").strip()})
    return out


def build(
    cfg: configparser.ConfigParser,
) -> tuple[AfdianClient, dict[str, Store], Notifier, dict[str, Any]]:
    """组装运行时依赖。返回的第二个值是**每个作者一个 Store**（key = slug）。"""
    site = cfg["site"]
    poll = cfg["poll"]
    source_name = site.get("source_name", "爱发电").strip()

    creators = _load_creators(cfg)
    if not creators:
        raise SystemExit("config 里 [creators] 为空 —— 至少要配一个作者（slug = user_id）")

    out_root = Path(cfg["storage"].get("out_dir", "out"))
    if not out_root.is_absolute():
        out_root = BASE_DIR / out_root

    client = AfdianClient(
        timeout=poll.getint("http_timeout", 30),
        retry=poll.getint("retry", 3),
    )

    state_template = Path(cfg["storage"].get("state_file", "state.afdian.json"))
    encoding = cfg["storage"].get("csv_encoding", "utf-8-sig")
    stores: dict[str, Store] = {}
    for spec in creators:
        slug = spec["slug"]
        # state.afdian.json → state.afdian.<slug>.json
        state_file = BASE_DIR / f"{state_template.stem}.{slug}{state_template.suffix}"
        stores[slug] = Store(
            out_dir=out_root / source_name / slug,
            state_file=state_file,
            encoding=encoding,
            columns=AFDIAN_COLUMNS,
            id_field="mod_id",
        )

    notifier = Notifier(
        key=cfg["notify"].get("serverchan_key", ""),
        token=cfg["notify"].get("pushplus_token", ""),
        enabled=cfg["notify"].getboolean("enabled", True),
    )
    meta = {
        "source_name": source_name,
        "creators": creators,
        "interval_minutes": poll.getint("interval_minutes", 60),
        "first_run_max_pages": poll.getint("first_run_max_pages", 40),
        "max_backfill_pages": poll.getint("max_backfill_pages", 5),
    }
    return client, stores, notifier, meta


def _fetch_creator(
    client: AfdianClient,
    store: Store,
    meta: dict[str, Any],
    spec: dict[str, str],
    is_first: bool,
) -> tuple[list[dict[str, Any]], str, bool]:
    """抓一个作者，返回 (帖子列表, 作者显示名, 是否成功)。失败返回 ([], 名字, False)。"""
    slug = spec["slug"]
    creators_cache: dict[str, Any] = store.state.setdefault("creators", {})
    cached = creators_cache.get(slug) or {}
    uid = spec["user_id"] or str(cached.get("user_id") or "")
    name = str(cached.get("name") or "")

    # user_id：配置优先，其次缓存，最后按 slug 问接口
    if not uid:
        try:
            info = client.resolve_creator(slug)
        except ApiError as exc:
            log.error("解析作者 %s 失败：%s", slug, exc)
            return [], slug, False
        if not info:
            log.error("找不到作者 %s —— slug 是否写错？", slug)
            return [], slug, False
        uid, name = info["user_id"], info["name"]

    # 作者显示名：缓存里没有才查一次
    if not name:
        try:
            info = client.resolve_creator(slug)
            name = (info or {}).get("name") or slug
        except ApiError as exc:
            log.warning("取 %s 的作者名失败（用 slug 顶上）：%s", slug, exc)
            name = slug

    creators_cache[slug] = {"user_id": uid, "name": name}

    try:
        if is_first:
            posts = client.warmup(uid, max_pages=meta["first_run_max_pages"])
            log.info("首次运行：%s 取到 %d 条历史帖子", name, len(posts))
        else:
            posts = client.collect_new(uid, store.seen_ids, max_pages=meta["max_backfill_pages"])
            log.info("%s 回溯到 %d 条新帖", name, len(posts))
    except ApiError as exc:
        log.error("%s 抓取失败：%s", name, exc)
        return [], name, False
    return posts, name, True


def _poll_creator(
    client: AfdianClient,
    store: Store,
    meta: dict[str, Any],
    spec: dict[str, str],
) -> tuple[list[dict[str, str]], str, bool]:
    """抓一个作者并完成归档 / 重建表格。返回 (入库行, 作者名, 是否首轮)。"""
    is_first = not store.state.get("initialized", False)
    posts, name, good = _fetch_creator(client, store, meta, spec, is_first)
    if not good:
        store.save_state()
        return [], name, is_first

    # 只要有作者拉取成功就算「本轮跑通」，与是否入库无关（同 Patreon / 可可站的道理）
    store.mark_polled()

    # 按 post_id 保序去重
    unique: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for post in posts:
        pid = str(post.get("post_id") or "")
        if not pid or pid in seen_ids:
            continue
        seen_ids.add(pid)
        unique.append(post)

    rows: list[dict[str, str]] = []
    for post in unique:
        row = parse_post(post, meta["source_name"], name)
        if row:
            rows.append(row)

    # ⚠️ 抓到的 id **全部**记为已见（本项目的老坑：漏了会让每轮重复翻页、白打接口）
    store.mark_seen(sorted(seen_ids), new=bool(rows))
    store.state["initialized"] = True

    if rows:
        rows.sort(key=lambda r: (r["发布时间"], r["mod_id"]), reverse=True)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for r in rows:
            r["首次发现时间"] = now

        # 付费帖没有图，_img_url 为空 → download_images 会自动跳过（它已判空）
        got = download_images(rows, store.out_dir, id_field="mod_id", url_field="_img_url")
        if got:
            log.info("%s：下载预览图 %d 张", name, got)

        store.archive(rows)
        try:
            rebuild_gallery(store.out_dir, f"{meta['source_name']} · {name}", **GALLERY_SPEC)
        except Exception as exc:  # noqa: BLE001 - 表格失败不应影响归档
            log.warning("%s：HTML 表格生成失败：%s", name, exc)

    store.save_state()
    if is_first:
        log.info("%s：首次运行已归档 %d 条历史帖子（不推送通知）", name, len(rows))
    elif rows:
        log.info("%s：本轮入库 %d 条", name, len(rows))
    else:
        log.debug("%s：无新帖子", name)
    return rows, name, is_first


def _send_digest(
    notifier: Notifier, source_name: str, pushed: list[tuple[str, list[dict[str, str]]]]
) -> None:
    """把多个作者的新帖合并成**一条**推送（作者一多各推一条会把微信刷爆）。"""
    total = sum(len(rows) for _, rows in pushed)
    parts: list[str] = []
    for name, rows in pushed:
        parts.append(f"**【{name}】** {len(rows)} 个")
        for r in rows[:5]:
            price = f"￥{r['价格']}" if r.get("价格") else "免费"
            parts.append(f"- {r['名称'] or '(无标题)'}（{price}）\n  {r['页面链接']}")
        if len(rows) > 5:
            parts.append(f"- …另有 {len(rows) - 5} 条，详见汇总 CSV")
    notifier.send(f"{source_name} 更新 · {len(pushed)} 位作者共 {total} 个", "\n".join(parts))


def poll_once(
    client: AfdianClient,
    stores: dict[str, Store],
    notifier: Notifier,
    meta: dict[str, Any],
    *,
    notify: bool = True,
) -> list[dict[str, str]]:
    all_rows: list[dict[str, str]] = []
    pushed: list[tuple[str, list[dict[str, str]]]] = []
    for spec in meta["creators"]:
        slug = spec["slug"]
        store = stores.get(slug)
        if store is None:
            continue
        try:
            rows, name, is_first = _poll_creator(client, store, meta, spec)
        except Exception as exc:  # noqa: BLE001
            # ⚠️ 单个作者出错**不能**中断其它作者
            log.exception("作者 %s 处理失败，跳过：%s", slug, exc)
            continue
        all_rows.extend(rows)
        if rows and not is_first and notify:
            pushed.append((name, rows))

    if pushed:
        _send_digest(notifier, meta["source_name"], pushed)
    elif not all_rows:
        log.info("本轮所有作者均无新帖")
    return all_rows


def run_once() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    try:
        client, stores, notifier, meta = build(load_config())
        poll_once(client, stores, notifier, meta)
        return 0
    except ApiError as exc:
        log.error("采集失败：%s", exc)
        try:
            _, _, notifier, _ = build(load_config())
            notifier.send_alert("爱发电采集失败", str(exc))
        except Exception:  # noqa: BLE001 - 告警本身失败不应再抛
            pass
        return 1
    except Exception as exc:  # noqa: BLE001
        log.exception("未预期错误：%s", exc)
        return 2


def run_forever() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    client, stores, notifier, meta = build(load_config())
    interval = meta["interval_minutes"]
    log.info(
        "爱发电常驻轮询启动，间隔 %d 分钟，监测 %d 个作者",
        interval, len(meta["creators"]),
    )

    failures = 0
    while True:
        try:
            poll_once(client, stores, notifier, meta)
            failures = 0
        except ApiError as exc:
            failures += 1
            log.error("采集失败（连续 %d 次）：%s", failures, exc)
            if failures in (1, 5, 20):  # 避免持续刷屏
                notifier.send_alert("爱发电采集失败", f"连续 {failures} 次：{exc}")
        except Exception as exc:  # noqa: BLE001
            log.exception("未预期错误：%s", exc)

        try:
            time.sleep(interval * 60)
        except KeyboardInterrupt:
            log.info("收到中断，退出")
            return 0


if __name__ == "__main__":
    sys.exit(run_forever())
