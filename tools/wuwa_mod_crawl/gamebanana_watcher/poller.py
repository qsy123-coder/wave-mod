"""GameBanana 采集主逻辑（本机运行）。

与服务器上的两个来源不同：
  - 纯 HTTP 直连（不经过代理），不需要浏览器
  - 输出**直接写本地**汇总目录，不需要 scp 回传
  - 关机不丢数据：靠 `_sSort=new` 翻页回溯，开机后自动补齐
"""

from __future__ import annotations

import configparser
import csv
import json
import logging
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from kekehxl_watcher.gallery import download_images, rebuild_gallery
from kekehxl_watcher.notify import Notifier
from kekehxl_watcher.storage import Store

from .client import ApiError, GameBananaClient
from .columns import GAMEBANANA_COLUMNS, GAMEBANANA_UPDATE_COLUMNS
from .downloader import (
    enqueue_rows,
    load_settings,
    load_state as load_dl_state,
    requeue_updates,
)
from .parser import parse_all, parse_record
from .proxy import make_session, prepare_proxy, resolve_proxy

log = logging.getLogger("gamebanana.poller")

BASE_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = BASE_DIR / "config.gb.ini"

# 供 HTML 表格使用的字段映射
GALLERY_SPEC = {
    "link_col": "页面链接",
    "title_col": "名称",
    "tag_cols": ["日期", "作者", "分类", "子分类", "版本", "浏览"],
    # GameBanana 是直接下载，没有网盘直链，故不生成链接汇总
    "netdisk_pairs": [],
    "thumb_size": (160, 160),
}


def load_config(path: Path | str = CONFIG_PATH) -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    if not Path(path).exists():
        raise SystemExit(f"缺少配置文件 {path}（可复制 config.gb.example.ini）")
    cfg.read(path, encoding="utf-8")
    return cfg


def build(cfg: configparser.ConfigParser) -> tuple[GameBananaClient, Store, Notifier, dict[str, Any]]:
    site = cfg["site"]
    poll = cfg["poll"]
    source_name = site.get("source_name", "GameBanana").strip()

    out_root = cfg["storage"].get("out_dir", "out")
    out_root_path = Path(out_root)
    if not out_root_path.is_absolute():
        out_root_path = BASE_DIR / out_root_path

    net = cfg["net"] if cfg.has_section("net") else None
    net_proxy = net.get("proxy", "auto") if net else "auto"
    proxy = resolve_proxy(
        net_proxy,
        autostart=net.getboolean("autostart", False) if net else False,
        app_path=(net.get("app_path", "").strip() or None) if net else None,
        wait_seconds=net.getint("autostart_wait", 40) if net else 40,
    )
    # 端口通 ≠ 节点可用：Clash 节点掉线时 TLS 握手会失败。这里实测一次，
    # 失败先自动切到能访问 GameBanana 的节点，再不行才退回直连。
    proxy = prepare_proxy(
        proxy,
        "https://gamebanana.com/",
        max_status=400,          # 403 = Cloudflare 拦截，换节点
        autoswitch=net.getboolean("auto_switch_node", True) if net else True,
    )
    if proxy:
        log.info("使用代理：%s", proxy)
    else:
        log.info("未检测到可用代理，走直连（下载会明显变慢）")

    client = GameBananaClient(
        game_id=site.getint("game_id", 20357),
        timeout=poll.getint("http_timeout", 30),
        retry=poll.getint("retry", 3),
        proxy=proxy,
    )
    store = Store(
        out_dir=out_root_path / source_name,
        state_file=BASE_DIR / cfg["storage"].get("state_file", "state.gb.json"),
        encoding=cfg["storage"].get("csv_encoding", "utf-8-sig"),
        columns=GAMEBANANA_COLUMNS,
        id_field="mod_id",
    )
    notifier = Notifier(
        key=cfg["notify"].get("serverchan_key", ""),
        token=cfg["notify"].get("pushplus_token", ""),
        enabled=cfg["notify"].getboolean("enabled", True),
    )
    download = load_settings(cfg)
    download.proxy = proxy
    dl_state_path = BASE_DIR / download.state_file

    meta = {
        "source_name": source_name,
        "proxy": proxy,
        "download": download,
        "dl_state_path": dl_state_path,
        "first_run_pages": poll.getint("first_run_pages", 5),
        "max_pages": poll.getint("max_backfill_pages", 20),
        "poll_pages": poll.getint("poll_pages", 4),
        "new_pages": poll.getint("new_pages", 3),
        "update_window_hours": poll.getint("update_window_hours", 72),
        "interval_minutes": poll.getint("interval_minutes", 15),
        "toast": poll.getboolean("desktop_toast", True),
        "model_types": {s.strip() for s in poll.get("model_types", "Mod").split(",") if s.strip()},
        "base_url": "https://gamebanana.com",
    }
    if cfg.has_section("report"):
        meta["report"] = {
            "enabled": cfg["report"].getboolean("enabled", False),
            "server": cfg["report"].get("server", ""),
            "ssh_key": cfg["report"].get("ssh_key", ""),
            "remote_dir": cfg["report"].get("remote_dir", ""),
            "timeout": cfg["report"].getint("timeout", 25),
        }
    return client, store, notifier, meta


def push_status(store: Store, meta: dict[str, Any]) -> None:
    """把本机状态推到服务器，供服务器端每日日报读取。

    目的：服务器 24/7 在跑，日报能覆盖 GameBanana；若本机长期没开机，
    状态文件时间戳会过期，日报就能据此报"本机可能没开机"。
    推送失败**不影响采集**。
    """
    rep = meta.get("report") or {}
    if not rep.get("enabled"):
        return

    rows_total, last_new = 0, ""
    total_csv = Path(store.out_dir) / "all_mods.csv"
    if total_csv.exists():
        try:
            with total_csv.open("r", encoding=store.encoding, newline="") as fh:
                import csv as _csv

                recs = list(_csv.DictReader(fh))
            rows_total = len(recs)
            stamps = [r.get("首次发现时间", "") for r in recs if r.get("首次发现时间")]
            last_new = max(stamps) if stamps else ""
        except Exception as exc:  # noqa: BLE001
            log.warning("读取总表失败：%s", exc)

    status = {
        "source": meta["source_name"],
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "total": rows_total,
        "last_new_at": last_new,
    }
    local_dir = BASE_DIR / "status"
    local_dir.mkdir(exist_ok=True)
    local_file = local_dir / "gb_status.json"
    local_file.write_text(json.dumps(status, ensure_ascii=False, indent=1), encoding="utf-8")

    server = rep.get("server")
    if not server:
        return
    key = str(rep.get("ssh_key", ""))
    key = str(Path(key).expanduser()) if key else ""
    cmd = [
        "scp", "-q", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=accept-new",
        "-o", f"ConnectTimeout={rep.get('timeout', 25)}",
    ]
    if key:
        cmd += ["-i", key]
    cmd += [str(local_file), f"{server}:{rep['remote_dir']}/"]
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=rep.get("timeout", 25) + 15)
        if r.returncode != 0:
            log.warning("状态推送失败（不影响采集）：%s", (r.stderr or "").strip()[:150])
    except Exception as exc:  # noqa: BLE001
        log.warning("状态推送异常（不影响采集）：%s", exc)


def desktop_toast(title: str, body: str, seconds: int = 12) -> None:
    """Windows 气泡通知（本机跑，所以能直接弹）。"""
    if sys.platform != "win32":
        return
    safe = lambda s: s.replace('"', "'").replace("\n", " ")[:400]  # noqa: E731
    script = (
        "Add-Type -AssemblyName System.Windows.Forms;"
        "Add-Type -AssemblyName System.Drawing;"
        "$n = New-Object System.Windows.Forms.NotifyIcon;"
        "$n.Icon = [System.Drawing.SystemIcons]::Information;"
        "$n.Visible = $true;"
        f'$n.ShowBalloonTip(10000, "{safe(title)}", "{safe(body)}", 1);'
        f"Start-Sleep -Seconds {seconds}; $n.Dispose()"
    )
    try:
        subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True, timeout=seconds + 20,
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("桌面通知失败：%s", exc)


DOWNLOAD_TASK = "GameBananaModDownload"


def trigger_download_task() -> None:
    """立刻跑一次下载计划任务（不等 30 分钟轮询）。

    下载任务 Settings.MultipleInstances = IgnoreNew，正在跑时再触发会被忽略，
    所以重复调用是安全的。失败只记日志，不影响采集。
    """
    if sys.platform != "win32":
        return
    try:
        r = subprocess.run(
            ["schtasks", "/run", "/tn", DOWNLOAD_TASK],
            capture_output=True, text=True, timeout=20,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        if r.returncode != 0:
            msg = (r.stdout or r.stderr or "").strip().replace("\r", " ")[:150]
            log.warning("触发下载任务失败：%s", msg)
        else:
            log.info("已触发下载任务 %s", DOWNLOAD_TASK)
    except Exception as exc:  # noqa: BLE001 - 触发失败不影响采集
        log.warning("触发下载任务异常：%s", exc)


def poll_once(
    client: GameBananaClient,
    store: Store,
    notifier: Notifier,
    meta: dict[str, Any],
    *,
    notify: bool = True,
) -> list[dict[str, str]]:
    """跑一轮，并**无论如何**都把状态推给服务器（含异常路径）。"""
    try:
        return _poll_once(client, store, notifier, meta, notify=notify)
    finally:
        push_status(store, meta)


def _ts(rec: dict[str, Any], key: str) -> int:
    try:
        return int(rec.get(key) or 0)
    except (TypeError, ValueError):
        return 0


def _iso(ts: int) -> str:
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, OSError):
        return ""


def _meta_map(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for rec in records:
        mid = str(rec.get("_idRow") or "")
        if mid:
            out[mid] = {
                "m": _ts(rec, "_tsDateModified"),
                "a": _ts(rec, "_tsDateAdded"),
                "v": str(rec.get("_sVersion") or ""),
            }
    return out


def merge_meta(store: Store, records: list[dict[str, Any]]) -> None:
    """记录本轮见到的 Mod 的 `_tsDateModified`，作为下一轮判断更新的基线。

    JASM 商店卡片时间用的是 `_tsDateModified`（不是 `_tsDateUpdated`：
    后者很多 Mod 是 0，只改页面的更新根本不会出现在 updated 排序里）。
    """
    meta = store.state.setdefault("mod_meta", {})
    for rec in records:
        mid = str(rec.get("_idRow") or "")
        if not mid:
            continue
        cur = meta.get(mid) or {}
        meta[mid] = {
            "m": max(int(cur.get("m") or 0), _ts(rec, "_tsDateModified")),
            "a": max(int(cur.get("a") or 0), _ts(rec, "_tsDateAdded")),
            "v": str(rec.get("_sVersion") or cur.get("v") or ""),
        }


def collect_changes(
    client: GameBananaClient,
    store: Store,
    meta: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """同时找「新增」和「更新」。

    - `default`：JASM 商店首页的排序（最近活动，含只改页面的更新）
    - `new`：兜底新提交（防止 default 排序把冷门新 Mod 压下去）
    - `updated`：按 `_tsDateUpdated`，覆盖文件更新

    新增 = id 不在 seen_ids；更新 = 已见但 `_tsDateModified` 比基线大。
    """
    seen = store.seen_ids
    mod_meta = store.state.get("mod_meta") or {}
    model_types = meta["model_types"]
    now = time.time()
    window = meta["update_window_hours"] * 3600

    new_records: list[dict[str, Any]] = []
    updated_records: list[dict[str, Any]] = []
    handled: set[str] = set()

    plans = (
        ("default", meta["poll_pages"], None),
        ("new", meta["new_pages"], "_tsDateAdded"),
        ("updated", meta["poll_pages"], "_tsDateUpdated"),
    )
    for sort, pages, stop_key in plans:
        for page in range(1, pages + 1):
            recs = client.subfeed(page, sort=sort).get("_aRecords") or []
            if not recs:
                break
            oldest = None
            for rec in recs:
                if not client._keep(rec, model_types):
                    continue
                mid = str(rec.get("_idRow") or "")
                if not mid or mid in handled:
                    continue
                modified = _ts(rec, "_tsDateModified")
                added = _ts(rec, "_tsDateAdded")
                newest = max(modified, added)
                if newest and (oldest is None or newest < oldest):
                    oldest = newest

                if mid not in seen:
                    new_records.append(rec)
                    handled.add(mid)
                    continue

                # 已收录但还没有基线的 Mod（升级后的首轮）先当基线，不报更新，
                # 否则会把它们当前的修改时间误当成「刚刚更新」。
                prev = mod_meta.get(mid)
                if prev is None:
                    continue
                if modified > int(prev.get("m") or 0):
                    updated_records.append(rec)
                    handled.add(mid)

            # new / updated 是按时间倒序的，翻到时间窗外就停；default 是活跃度
            # 排序，不保证时间单调，所以只按固定页数翻，不做时间早停。
            if stop_key and oldest and oldest < now - window:
                break
    return new_records, updated_records


def _first_seen_map(store: Store) -> dict[str, int]:
    """mod_id → 我们第一次收录它的时间戳（读 all_mods.csv）。"""
    path = Path(store.out_dir) / "all_mods.csv"
    out: dict[str, int] = {}
    if not path.exists():
        return out
    try:
        with path.open("r", encoding=store.encoding, newline="") as fh:
            for row in csv.DictReader(fh):
                mid = str(row.get("mod_id") or "")
                raw = str(row.get("首次发现时间") or "")
                if not mid or not raw:
                    continue
                try:
                    out[mid] = int(datetime.fromisoformat(raw).timestamp())
                except ValueError:
                    pass
    except OSError:
        pass
    return out


def prepare_updates(
    client: GameBananaClient,
    store: Store,
    meta: dict[str, Any],
    records: list[dict[str, Any]],
) -> tuple[list[dict[str, str]], list[str], list[dict[str, str]], set[str]]:
    """判断更新是「换了文件」还是「只改了页面」，并决定是否重新下载。

    返回 (更新记录行, 需要重新入队的 mod_id, 从未下载过、需要新入队的行,
    文件列表拉取失败的 mod_id)。最后一组不推进修改时间基线，下一轮会重试。
    """
    dl = meta.get("download")
    queue_items: dict[str, Any] = {}
    if dl and dl.enabled and meta.get("dl_state_path"):
        try:
            queue_items = load_dl_state(Path(meta["dl_state_path"])).get("items") or {}
        except Exception as exc:  # noqa: BLE001
            log.warning("读取下载队列失败（只记录不重下）：%s", exc)

    old_meta = store.state.get("mod_meta") or {}
    first_seen = _first_seen_map(store)
    rows: list[dict[str, str]] = []
    requeue: list[str] = []
    enqueue: list[dict[str, str]] = []
    deferred: set[str] = set()

    for rec in records:
        mid = str(rec.get("_idRow") or "")
        if not mid:
            continue
        parsed = parse_record(rec, meta["source_name"]) or {}
        prev_ver = str((old_meta.get(mid) or {}).get("v") or "")
        change = "页面更新"

        try:
            files = client.download_page(mid)
        except ApiError as exc:
            log.warning("Mod %s 文件列表拉取失败，下轮重试：%s", mid, exc)
            files = []
            change = "页面更新（文件列表获取失败）"
            deferred.add(mid)
        else:
            current = {
                str(f.get("_sDownloadUrl") or "")
                for f in files
                if f.get("_sDownloadUrl")
            }
            if current:
                entry = queue_items.get(mid)
                if entry:
                    stored = {
                        str(x.get("url") or "")
                        for x in (entry.get("files") or [])
                        if x.get("url")
                    }
                    if current - stored:
                        change = "文件更新"
                        # 已完成/失败/部分完成的条目才重新排队；已经在队列里的不用管
                        if entry.get("status") in ("done", "skipped", "failed", "partial"):
                            requeue.append(mid)
                else:
                    # 历史上没下载过（比如下载器上线前的 Mod）。只有文件是在我们
                    # 收录之后才上传的，才算真更新；否则多半只是改了页面。
                    newest_file = max(
                        (_ts(f, "_tsDateAdded") for f in files), default=0
                    )
                    recorded_at = first_seen.get(mid, 0)
                    if newest_file and recorded_at and newest_file > recorded_at + 300:
                        change = "文件更新"
                        if parsed:
                            enqueue.append(parsed)

        rows.append({
            "更新时间": _iso(_ts(rec, "_tsDateModified")),
            "名称": parsed.get("名称", ""),
            "作者": parsed.get("作者", ""),
            "版本": parsed.get("版本", ""),
            "旧版本": prev_ver,
            "变化": change,
            "页面链接": parsed.get("页面链接", ""),
            "mod_id": mid,
        })
        time.sleep(0.2)                      # 别把接口打太急

    return rows, requeue, enqueue, deferred


def write_update_log(store: Store, rows: list[dict[str, str]]) -> None:
    """更新记录单独一张表：同一个 mod_id 会反复出现，不能走每日表的 id 去重。"""
    if not rows:
        return
    path = Path(store.out_dir) / "更新记录.csv"
    existing: dict[tuple[str, str], dict[str, str]] = {}
    if path.exists():
        try:
            with path.open("r", encoding=store.encoding, newline="") as fh:
                for row in csv.DictReader(fh):
                    existing[(row.get("mod_id", ""), row.get("更新时间", ""))] = row
        except OSError:
            pass
    for row in rows:
        existing[(row["mod_id"], row["更新时间"])] = row
    ordered = sorted(
        existing.values(),
        key=lambda r: (r.get("更新时间", ""), r.get("mod_id", "")),
    )
    with path.open("w", encoding=store.encoding, newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=GAMEBANANA_UPDATE_COLUMNS, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(ordered)


def _poll_once(
    client: GameBananaClient,
    store: Store,
    notifier: Notifier,
    meta: dict[str, Any],
    *,
    notify: bool = True,
) -> list[dict[str, str]]:
    is_first = not store.state.get("initialized", False)

    if is_first:
        # 首次：只抓头部若干页当基线，全部标记已见，避免把 6000+ 历史当新 mod
        records = client.warmup(meta["model_types"], pages=meta["first_run_pages"])
        log.info("首次运行：取头部 %d 条作为基线", len(records))
        new_records = records
        updated_records: list[dict[str, Any]] = []
    else:
        # 老状态文件升级上来没有 mod_meta：先把当前头部当基线，避免一次刷出
        # 几百条「更新」。本周的补抓由 backfill_gb.py 单独跑。
        if "mod_meta" not in store.state:
            baseline = client.warmup(meta["model_types"], pages=meta["first_run_pages"])
            store.state["mod_meta"] = _meta_map(baseline)
            store.save_state()
            log.info("首次建立更新基线：%d 条（本轮不报历史更新）", len(baseline))
        new_records, updated_records = collect_changes(client, store, meta)
        log.info("本轮新增 %d 条，更新 %d 条", len(new_records), len(updated_records))

    # 更新要先于 merge_meta 计算：需要旧的版本号和旧文件列表做对比
    update_rows: list[dict[str, str]] = []
    requeue_ids: list[str] = []
    update_new_rows: list[dict[str, str]] = []
    deferred_ids: set[str] = set()
    if updated_records:
        update_rows, requeue_ids, update_new_rows, deferred_ids = prepare_updates(
            client, store, meta, updated_records
        )

    rows = parse_all(new_records, meta["source_name"])
    all_ids = [r["mod_id"] for r in rows]

    if is_first:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        kept = [r for r in rows if r["日期"] == today]
        if len(kept) != len(rows):
            log.info("首次运行：仅归档当天（%s），跳过 %d 条历史", today, len(rows) - len(kept))
        rows = kept

    # 只有真有新增时才刷新 last_new_at；纯更新轮不能谎报「刚刚有新 Mod」
    store.mark_seen(all_ids, new=bool(all_ids))
    store.state["initialized"] = True
    # 文件列表没拉到的先不推进基线，下一轮还会把它当更新重试
    merge_meta(
        store,
        [r for r in new_records + updated_records
         if str(r.get("_idRow")) not in deferred_ids],
    )

    if update_rows:
        write_update_log(store, update_rows)
        file_updates = sum(1 for r in update_rows if r["变化"].startswith("文件更新"))
        log.info("记录更新 %d 条（文件更新 %d 条）", len(update_rows), file_updates)

    if not rows and not update_rows:
        log.info("无新增、无更新")
        store.save_state()
        return []

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    for r in rows:
        r["首次发现时间"] = now

    # 原图/附件入下载队列。放在缩略图下载/归档之前：mark_seen 已经写过，
    # 万一后面进程被强杀，至少下载任务不会漏。真正的下载由独立计划任务
    # GameBananaModDownload 跑 —— 采集任务有 10 分钟执行上限，大附件会被强杀。
    dl = meta.get("download")
    if dl and dl.enabled:
        try:
            queued = enqueue_rows(rows, meta["dl_state_path"]) if rows else 0
            if queued:
                log.info("已加入下载队列 %d 个 Mod", queued)
            if update_new_rows:
                queued += enqueue_rows(update_new_rows, meta["dl_state_path"])
            if requeue_ids:
                redone = requeue_updates(requeue_ids, meta["dl_state_path"])
                if redone:
                    log.info("发现新文件的 Mod 重新入队 %d 个", len(redone))
            if queued or requeue_ids:
                # 立即触发下载任务：下载任务本身每 30 分钟一轮，等下一轮
                # 最长要拖半小时；这里入队即跑（任务设置 IgnoreNew，重复触发无副作用）
                trigger_download_task()
        except Exception as exc:  # noqa: BLE001 - 入队失败不应影响归档/通知
            log.warning("下载入队失败（不影响采集）：%s", exc)

    got = download_images(
        rows, store.out_dir,
        id_field="mod_id", url_field="_img_url",
        session=make_session(meta.get("proxy")),
    )
    if got:
        log.info("下载预览图 %d 张", got)

    if rows:
        store.archive(rows)
    store.save_state()

    try:
        rebuild_gallery(store.out_dir, meta["source_name"], **GALLERY_SPEC)
    except Exception as exc:  # noqa: BLE001
        log.warning("HTML 表格生成失败：%s", exc)

    if notify and (rows or update_rows):
        parts: list[str] = []
        if rows:
            top = rows[:15]
            parts.append("\n".join(
                f"- **{r['名称']}**（{r['作者']} · {r['分类']}）\n  {r['页面链接']}"
                for r in top
            ))
            if len(rows) > 15:
                parts.append(f"… 另有 {len(rows) - 15} 条新增，详见汇总 CSV。")
        if update_rows:
            top = update_rows[:10]
            parts.append("\n".join(
                f"- **{r['名称']}** v{r['旧版本'] or '?'} → v{r['版本'] or '?'}"
                f"（{r['变化']}）\n  {r['页面链接']}"
                for r in top
            ))
            if len(update_rows) > 10:
                parts.append(f"… 另有 {len(update_rows) - 10} 条更新，详见「更新记录.csv」。")
        label = "监测已启动 · 基线" if is_first else "更新 · 发现"
        title = f"{meta['source_name']} {label} 新增 {len(rows)} · 更新 {len(update_rows)}"
        notifier.send(title, "\n\n".join(parts))
        if meta["toast"]:
            head = "、".join([r["名称"] for r in rows[:2]] + [r["名称"] for r in update_rows[:1]])
            desktop_toast(
                f"GameBanana：新增 {len(rows)} · 更新 {len(update_rows)}",
                f"{head}{'…' if len(rows) + len(update_rows) > 3 else ''}",
            )

    log.info("本轮入库 %d 条新增、%d 条更新", len(rows), len(update_rows))
    return rows


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
            notifier.send_alert("GameBanana 采集失败", str(exc))
        except Exception:  # noqa: BLE001
            pass
        return 1
    except Exception as exc:  # noqa: BLE001
        log.exception("未预期错误：%s", exc)
        return 2


def run_forever() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    client, store, notifier, meta = build(load_config())
    interval = meta["interval_minutes"]
    log.info("GameBanana 常驻轮询启动，间隔 %d 分钟", interval)
    failures = 0
    while True:
        try:
            poll_once(client, store, notifier, meta)
            failures = 0
        except ApiError as exc:
            failures += 1
            log.error("采集失败（连续 %d 次）：%s", failures, exc)
            if failures in (1, 5, 20):
                notifier.send_alert("GameBanana 采集失败", f"连续 {failures} 次：{exc}")
        except Exception as exc:  # noqa: BLE001
            log.exception("未预期错误：%s", exc)
        try:
            time.sleep(interval * 60)
        except KeyboardInterrupt:
            return 0


if __name__ == "__main__":
    sys.exit(run_forever())
