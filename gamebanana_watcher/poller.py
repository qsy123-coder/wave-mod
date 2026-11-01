"""GameBanana 采集主逻辑（本机运行）。

与服务器上的两个来源不同：
  - 纯 HTTP 直连（不经过代理），不需要浏览器
  - 输出**直接写本地**汇总目录，不需要 scp 回传
  - 关机不丢数据：靠 `_sSort=new` 翻页回溯，开机后自动补齐
"""

from __future__ import annotations

import configparser
import json
import logging
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from kekehxl_watcher.gallery import download_images, rebuild_gallery
from kekehxl_watcher.notify import Notifier
from kekehxl_watcher.storage import Store

from .client import ApiError, GameBananaClient
from .columns import GAMEBANANA_COLUMNS
from .downloader import enqueue_rows, load_settings
from .parser import parse_all
from .proxy import make_session, resolve_proxy

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


def _poll_once(
    client: GameBananaClient,
    store: Store,
    notifier: Notifier,
    meta: dict[str, Any],
    *,
    notify: bool = True,
) -> list[dict[str, str]]:
    is_first = not store.state.get("initialized", False)
    seen = store.seen_ids

    if is_first:
        # 首次：只抓头部若干页当基线，全部标记已见，避免把 6000+ 历史当新 mod
        records = client.warmup(meta["model_types"], pages=meta["first_run_pages"])
        log.info("首次运行：取头部 %d 条作为基线", len(records))
    else:
        records = client.collect_new(seen, meta["model_types"], max_pages=meta["max_pages"])
        log.info("翻页回溯到 %d 条新提交", len(records))

    if not records:
        log.info("无新提交")
        store.save_state()
        return []

    rows = parse_all(records, meta["source_name"])
    all_ids = [r["mod_id"] for r in rows]

    if is_first:
        today = datetime.utcnow().strftime("%Y-%m-%d")
        kept = [r for r in rows if r["日期"] == today]
        if len(kept) != len(rows):
            log.info("首次运行：仅归档当天（%s），跳过 %d 条历史", today, len(rows) - len(kept))
        rows = kept

    store.mark_seen(all_ids)
    store.state["initialized"] = True

    if not rows:
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
            queued = enqueue_rows(rows, meta["dl_state_path"])
            if queued:
                log.info("已加入下载队列 %d 个 Mod", queued)
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

    store.archive(rows)
    store.save_state()

    try:
        rebuild_gallery(store.out_dir, meta["source_name"], **GALLERY_SPEC)
    except Exception as exc:  # noqa: BLE001
        log.warning("HTML 表格生成失败：%s", exc)

    if notify and rows:
        top = rows[:15]
        body = "\n".join(
            f"- **{r['名称']}**（{r['作者']} · {r['分类']}）\n  {r['页面链接']}" for r in top
        )
        if len(rows) > 15:
            body += f"\n\n… 另有 {len(rows) - 15} 条，详见汇总 CSV。"
        label = "监测已启动 · 基线" if is_first else "更新 · 发现"
        notifier.send(f"{meta['source_name']} {label} {len(rows)} 个", body)
        if meta["toast"]:
            head = "、".join(r["名称"] for r in rows[:3])
            desktop_toast(
                f"GameBanana 更新 · {len(rows)} 个新 Mod",
                f"{head}{'…' if len(rows) > 3 else ''}",
            )

    log.info("本轮入库 %d 条", len(rows))
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
