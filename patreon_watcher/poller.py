"""Patreon 采集主逻辑（跑在首尔服务器，由 systemd 拉起）。

与其他来源的差别：
  - **多作者，且每个作者一套独立产出**：作者列表写在 config 的 `[creators]` 段，
    加作者只改一行配置。产出**按作者分目录** —— `out/Patreon/<vanity>/` 下各有
    一份每日 CSV / `all_mods.csv` / `images/` / `index.html`，
    对应本机的 `_Mod每日汇总/Patreon/<vanity>/`。
    实现上就是**每个作者一个 `Store` + 一个 state 文件**
    （`state.patreon.<vanity>.json`），复用 `Store` 一行没改。
  - **通知合并成一条**：作者一多，每人各推一条会把微信刷爆，见 `_send_digest`
  - **发现源**：拿不到下载直链（见 __init__.py），故不生成网盘链接汇总
  - **首轮全量建档**：第一次运行把作者的全部历史帖子归档进 CSV，
    但**不推送通知** —— 上百条历史刷屏没有意义。之后每轮只推新帖。
    ⚠️ 首轮判定是**作者级**的（见 `_poll_creator` 的说明），共用一个 Store 会废掉它

注意事项：
  - 本机（中国家宽）连 patreon.com 直接超时，**这个来源只能在服务器跑**
  - 作者显示名缓存在各自 state 的 `campaigns` 里，避免每轮多打一次接口
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

from .client import ApiError, PatreonClient, display_name
from .columns import PATREON_COLUMNS
from .parser import image_is_blurred, parse_post

log = logging.getLogger("patreon.poller")

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.patreon.ini"

# 供 HTML 表格使用的字段映射
GALLERY_SPEC = {
    "link_col": "页面链接",
    "title_col": "名称",
    "tag_cols": ["日期", "作者", "类型", "点赞", "评论"],
    "netdisk_pairs": [],          # 拿不到下载直链，故不生成网盘链接汇总
    "thumb_size": (160, 160),
}


def load_config(path: Path | str = CONFIG_PATH) -> configparser.ConfigParser:
    # `inline_comment_prefixes`：configparser **默认不认行内注释**，`; 说明` 会被
    # 当成值的一部分。`[creators]` 里给每个作者写一行说明时，campaign id 就会变成
    # `14019274   ; EnteleJiang ...`，拿去请求自然查不到东西 —— 而且报错很难懂。
    cfg = configparser.ConfigParser(inline_comment_prefixes=(";", "#"))
    # ⚠️ `optionxform` 必须在 **read() 之前**设：configparser 是在**读取时**就把
    # 键名小写化并存下来的，读完之后再设只是影响后续操作，已有键改不回来。
    # （2026-10-15 踩到：`Puddingow` 被存成 `puddingow`，`NoMention` → `nomention`。
    #   之前只配了全小写的 shaojiang，所以一直没暴露。）
    # `[creators]` 的键是 Patreon vanity，大小写是作者名的一部分，不该被篡改 ——
    # 它同时用作**归档目录名**和**state 文件名**，小写了目录名就跟着变形。
    cfg.optionxform = str  # type: ignore[assignment]
    if not Path(path).exists():
        raise SystemExit(f"缺少配置文件 {path}（可复制 config.patreon.example.ini）")
    cfg.read(path, encoding="utf-8")
    return cfg


def _load_creators(cfg: configparser.ConfigParser) -> list[dict[str, str]]:
    """`[creators]` 段 → [{vanity, campaign_id}]。

    写法（每行一个作者）：
        shaojiang = 14019274      ; campaign id 可留空，程序自动解析并缓存
        somecreator =             ; 留空即自动解析
    """
    if not cfg.has_section("creators"):
        return []
    out: list[dict[str, str]] = []
    for vanity, cid in cfg["creators"].items():
        vanity = vanity.strip()
        if not vanity or vanity.startswith(("#", ";")):
            continue
        out.append({"vanity": vanity, "campaign_id": (cid or "").strip()})
    return out


def build(
    cfg: configparser.ConfigParser,
) -> tuple[PatreonClient, dict[str, Store], Notifier, dict[str, Any]]:
    """组装运行时依赖。返回的第二个值是 **每个作者一个 Store**（key = vanity）。

    ⚠️ 为什么不是一个大 Store：用户要求产出**按作者分目录**
    （`out/Patreon/<vanity>/` 各一套 CSV / images / index.html）。
    于是每个作者相当于一个独立的「子来源」—— 各自一个 out_dir、各自一个
    state 文件（`state.patreon.<vanity>.json`）。

    这样做的代价是状态文件从 1 个变成 N 个，`healthcheck.py` 需要跨文件
    聚合（见那里的 `_patreon_state`）。好处是复用 `Store` 一行没改，
    且某个作者出错不会污染其它作者的归档。
    """
    site = cfg["site"]
    poll = cfg["poll"]
    source_name = site.get("source_name", "Patreon").strip()

    creators = _load_creators(cfg)
    if not creators:
        raise SystemExit("config 里 [creators] 为空 —— 至少要配一个作者（vanity = campaign_id）")

    out_root = Path(cfg["storage"].get("out_dir", "out"))
    if not out_root.is_absolute():
        out_root = BASE_DIR / out_root

    # 凭据文件：只写路径，值单独放（config 会流转，密钥不跟着走）
    session_file = ""
    if cfg.has_section("auth"):
        session_file = cfg["auth"].get("session_file", "").strip()
    if session_file and not Path(session_file).is_absolute():
        session_file = BASE_DIR / session_file

    client = PatreonClient(
        timeout=poll.getint("http_timeout", 30),
        retry=poll.getint("retry", 3),
        session_file=session_file or None,
    )

    state_template = Path(cfg["storage"].get("state_file", "state.patreon.json"))
    encoding = cfg["storage"].get("csv_encoding", "utf-8-sig")
    stores: dict[str, Store] = {}
    for spec in creators:
        vanity = spec["vanity"]
        # state.patreon.json → state.patreon.<vanity>.json
        state_file = BASE_DIR / f"{state_template.stem}.{vanity}{state_template.suffix}"
        stores[vanity] = Store(
            out_dir=out_root / source_name / vanity,
            state_file=state_file,
            encoding=encoding,
            columns=PATREON_COLUMNS,
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
        "page_size": poll.getint("page_size", 100),
        "first_run_max_pages": poll.getint("first_run_max_pages", 40),
        "max_backfill_pages": poll.getint("max_backfill_pages", 5),
        # 留空 = 不过滤；可填 image_file,text_only 等（post_type）
        "post_types": {
            s.strip() for s in poll.get("post_types", "").split(",") if s.strip()
        },
    }
    return client, stores, notifier, meta


def _fetch_creator(
    client: PatreonClient,
    store: Store,
    meta: dict[str, Any],
    spec: dict[str, str],
    is_first: bool,
    seen: set[str],
) -> tuple[list[dict[str, Any]], str, bool]:
    """抓一个作者，返回 (帖子列表, 作者显示名, 是否成功)。失败返回 ([], 名字, False)。"""
    vanity = spec["vanity"]
    campaigns: dict[str, Any] = store.state.setdefault("campaigns", {})
    cached = campaigns.get(vanity) or {}
    cid = spec["campaign_id"] or str(cached.get("id") or "")
    name = str(cached.get("name") or "")

    # campaign id：配置优先，其次缓存，最后按 vanity 问接口
    if not cid:
        try:
            info = client.resolve_campaign(vanity)
        except ApiError as exc:
            log.error("解析作者 %s 的 campaign 失败：%s", vanity, exc)
            return [], vanity, False
        if not info:
            log.error("找不到作者 %s —— vanity 是否写错？", vanity)
            return [], vanity, False
        cid, name = info["id"], info["name"]

    # 作者显示名：缓存里没有才查一次
    if not name:
        try:
            name = display_name(client.campaign_attrs(cid), vanity)
        except ApiError as exc:
            log.warning("取 %s 的作者名失败（用 vanity 顶上）：%s", vanity, exc)
            name = vanity

    campaigns[vanity] = {"id": cid, "name": name}

    try:
        if is_first:
            posts = client.warmup(
                cid, max_pages=meta["first_run_max_pages"], count=meta["page_size"]
            )
            log.info("首次运行：%s 取到 %d 条历史帖子", name, len(posts))
        else:
            posts = client.collect_new(
                cid, seen, max_pages=meta["max_backfill_pages"], count=meta["page_size"]
            )
            log.info("%s 回溯到 %d 条新帖", name, len(posts))
    except ApiError as exc:
        log.error("%s 抓取失败：%s", name, exc)
        return [], name, False
    return posts, name, True


def _download_previews(
    client: PatreonClient, store: Store, rows: list[dict[str, str]]
) -> tuple[int, int]:
    """下载预览图，**拒绝落盘模糊图**。返回 (下载数, 被判模糊跳过的数)。

    ⚠️ 为什么不照常下：`gallery.download_images()` 对已存在的 `<id>.*` **永久跳过**
    （见 kekehxl_watcher/gallery.py 的 glob 分支）。一旦把模糊图落盘，之后即使
    session 修好也永远不会重下 —— 坏数据被 glob 钉死。所以设两道闸：

      1. 本轮登录态不是 ok → 整批跳过，一张都不落
      2. 单张 URL 仍带模糊参数 `b` → 该张跳过，预览图留空

    取舍是「宁可留空，不可落坏图」。降级期间留下的空图，
    靠 patreon_refresh_previews.py 在 session 修好后回填。
    """
    state = store.state.get("auth_state")
    if state != "ok":
        log.warning("登录态非 ok（%s），跳过本轮全部预览图下载", state)
        return 0, len(rows)

    sharp = [r for r in rows if not image_is_blurred(r.get("_img_url", ""))]
    blurred = len(rows) - len(sharp)
    if blurred:
        # 少数帖子可能是付费限定（current_user_can_view=False），属正常
        log.warning("%d 张预览图的 URL 仍带模糊参数，已跳过（这些行预览图留空）", blurred)
    if not sharp:
        return 0, blurred

    # 图片走 CDN，cookie 不一定需要，但带上无副作用（且签名链同源）
    got = download_images(
        sharp, store.out_dir, id_field="mod_id", url_field="_img_url", session=client.session
    )
    return got, blurred


def _probe_auth(client: PatreonClient) -> tuple[str, str]:
    """探测登录态，返回 `(auth_state, user_id)`。

    ⚠️ 网络故障记 `check_failed` 而**不是** `expired` —— 一次抖动就误报
    「凭据过期」，会让人白折腾一遍 cookie。调用方据此决定要不要告警。
    """
    if not client.session_configured:
        return "unconfigured", ""
    try:
        user = client.current_user()
    except ApiError as exc:
        log.warning("登录态探测失败（网络原因，非凭据问题）：%s", exc)
        return "check_failed", ""
    return ("ok", str(user.get("id") or "")) if user else ("expired", "")


def _poll_creator(
    client: PatreonClient,
    store: Store,
    meta: dict[str, Any],
    spec: dict[str, str],
) -> tuple[list[dict[str, str]], str, bool]:
    """抓一个作者并完成归档 / 重建表格。返回 (入库行, 作者名, 是否首轮)。

    ⚠️ 每个作者一个 Store，所以**首轮判定和 seen_ids 都是作者级的**。
    这点是关键：若多个作者共用一个大 Store，第一个作者跑完就把
    `initialized` 置 True，剩下 12 个会被当成「非首轮」，只回溯
    `max_backfill_pages` 页、拿不到完整历史 —— 首轮全量建档的意图就废了。
    """
    is_first = not store.state.get("initialized", False)
    posts, name, good = _fetch_creator(client, store, meta, spec, is_first, store.seen_ids)
    if not good:
        store.save_state()
        return [], name, is_first

    # 只要有作者拉取成功就算「本轮跑通」，与是否入库无关：健康巡检靠 last_poll
    # 判断服务是否还活着，漏了这步会把「站点安静」误报成「服务停摆」
    # （2026-10-12 可可站踩过，见 storage.mark_polled 的注释）。
    store.mark_polled()

    # 按帖子 id 保序去重（作者被配了两遍、或接口重复返回时会撞）
    unique: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for post in posts:
        pid = str(post.get("id") or "")
        if not pid or pid in seen_ids:
            continue
        seen_ids.add(pid)
        unique.append(post)

    rows: list[dict[str, str]] = []
    for post in unique:
        row = parse_post(post, meta["source_name"], name)
        if not row:
            continue
        if meta["post_types"] and row["类型"] not in meta["post_types"]:
            continue
        rows.append(row)

    # ⚠️ 抓到的 id **全部**记为已见，无论是否被 post_types 过滤掉。
    # 否则被过滤的帖子永远进不了 seen_ids，每轮都会重复翻页、白打接口
    # （GameBanana 踩过同样的坑，见其 poller 注释）。
    store.mark_seen(sorted(seen_ids), new=bool(rows))
    store.state["initialized"] = True

    if rows:
        rows.sort(key=lambda r: (r["发布时间"], r["mod_id"]), reverse=True)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for r in rows:
            r["首次发现时间"] = now

        got, skipped = _download_previews(client, store, rows)
        if got:
            log.info("%s：下载预览图 %d 张", name, got)
        if skipped:
            log.warning("%s：%d 张预览图被跳过（未落盘）", name, skipped)

        store.archive(rows)
        # 标题带上作者名 —— 每个作者各有各的 index.html，光写 "Patreon" 分不清
        try:
            rebuild_gallery(store.out_dir, f"{meta['source_name']} · {name}", **GALLERY_SPEC)
        except Exception as exc:  # noqa: BLE001 - 表格失败不应影响归档
            log.warning("%s：HTML 表格生成失败：%s", name, exc)

    store.save_state()
    if is_first:
        # 首轮是全量建档：上百条历史会把推送刷屏，按用户要求**不推送**
        log.info("%s：首次运行已归档 %d 条历史帖子（不推送通知）", name, len(rows))
    elif rows:
        log.info("%s：本轮入库 %d 条", name, len(rows))
    else:
        log.debug("%s：无新帖子", name)
    return rows, name, is_first


def _send_digest(
    notifier: Notifier, source_name: str, pushed: list[tuple[str, list[dict[str, str]]]]
) -> None:
    """把多个作者的新帖合并成**一条**推送。

    作者一多各推一条会把微信刷爆；合并后一条里按作者分组，每人最多列 5 条。
    """
    total = sum(len(rows) for _, rows in pushed)
    parts: list[str] = []
    for name, rows in pushed:
        parts.append(f"**【{name}】** {len(rows)} 个")
        for r in rows[:5]:
            parts.append(f"- {r['名称'] or '(无标题)'}\n  {r['页面链接']}")
        if len(rows) > 5:
            parts.append(f"- …另有 {len(rows) - 5} 条，详见汇总 CSV")
    notifier.send(f"{source_name} 更新 · {len(pushed)} 位作者共 {total} 个", "\n".join(parts))


def poll_once(
    client: PatreonClient,
    stores: dict[str, Store],
    notifier: Notifier,
    meta: dict[str, Any],
    *,
    notify: bool = True,
) -> list[dict[str, str]]:
    # ---- 登录态探测：Patreon 最阴的失败模式 ----
    # session 过期后接口**不报错**，只是悄悄把 image.url 从 {"w":620} 换成
    # {"b":70,"w":620}。日志、last_poll、文件完整性全都正常，只有主动探测能发现。
    # 全局只打**一次**接口，结果分发给每个作者的 state（回填脚本与巡检都读它）。
    auth_state, auth_user = _probe_auth(client)
    if auth_state == "expired":
        log.error("Patreon 登录态已失效 —— 预览图会退化为模糊，本轮不下载图片")
    checked_at = datetime.now().isoformat(timespec="seconds")
    for store in stores.values():
        store.state["auth_state"] = auth_state
        store.state["auth_user"] = auth_user
        store.state["auth_checked_at"] = checked_at

    all_rows: list[dict[str, str]] = []
    pushed: list[tuple[str, list[dict[str, str]]]] = []
    for spec in meta["creators"]:
        vanity = spec["vanity"]
        store = stores.get(vanity)
        if store is None:
            continue
        try:
            rows, name, is_first = _poll_creator(client, store, meta, spec)
        except Exception as exc:  # noqa: BLE001
            # ⚠️ 单个作者出错**不能**中断其它作者 —— 作者一多，其中一个改名/删号/
            # 返回怪结构，不该让整轮白跑
            log.exception("作者 %s 处理失败，跳过：%s", vanity, exc)
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
            notifier.send_alert("Patreon 采集失败", str(exc))
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
    # 每个作者一个 Store，取任意一个读全局性的字段（登录态是所有作者共用的）
    any_store = next(iter(stores.values()))
    log.info(
        "Patreon 常驻轮询启动，间隔 %d 分钟，监测 %d 个作者",
        interval, len(meta["creators"]),
    )

    if not client.session_configured:
        log.warning(
            "未配置 session（config 的 [auth] session_file）—— 按匿名模式跑，预览图会是模糊的"
        )

    failures = 0
    auth_failures = 0
    while True:
        try:
            poll_once(client, stores, notifier, meta)
            failures = 0
            # 登录态失效单独计数：它是「凭据过期」不是「采集故障」，
            # 混在一起会让日志里的「连续 N 次失败」含义变模糊
            if any_store.state.get("auth_state") == "expired":
                auth_failures += 1
                if auth_failures in (1, 5, 20):  # 沿用采集失败的防刷屏节奏
                    notifier.send_alert(
                        "Patreon 登录态失效",
                        "session 已过期 —— 预览图已停止下载（降级为留空，不落模糊图）。\n"
                        "请更新服务器上的 patreon_session.txt 后重启 patreon-watcher，"
                        "并重跑 patreon_refresh_previews.py 回填这段时间的空图。",
                    )
            else:
                auth_failures = 0
        except ApiError as exc:
            failures += 1
            log.error("采集失败（连续 %d 次）：%s", failures, exc)
            if failures in (1, 5, 20):  # 避免持续刷屏
                notifier.send_alert("Patreon 采集失败", f"连续 {failures} 次：{exc}")
        except Exception as exc:  # noqa: BLE001
            log.exception("未预期错误：%s", exc)

        try:
            time.sleep(interval * 60)
        except KeyboardInterrupt:
            log.info("收到中断，退出")
            return 0


if __name__ == "__main__":
    sys.exit(run_forever())
