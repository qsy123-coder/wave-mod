#!/usr/bin/env python3
"""本地 Mod 下载看板（纯标准库，无第三方 Web 框架）。

用法：
    python web_status.py                # http://127.0.0.1:8765/，自动打开浏览器
    python web_status.py --no-browser   # 不自动开浏览器
    python web_status.py --host 0.0.0.0 --port 9000   # 局域网可访问（注意隐私）

数据来源（只读，不修改任何队列）：
    state.arca_downloads.json     arca.live 图片 + Mod 下载队列
    state.gb_downloads.json       GameBanana 原图 + 附件下载队列
    A_每日更新/W-*/              当天产物与 .part 实时进度
    A_每日更新/_Mod每日汇总/*/    各采集源累计统计
    arca_download.log / gamebanana_download.log  最近日志

页面每 5 秒拉一次 /api/status，展示：
  - 总览卡片（完成 / 排队 / 下载中 / 需手动 / 失败 / 已下载大小 / 磁盘剩余）
  - 正在下载的 .part（实时字节数）
  - 每条队列的进度、大小、失败原因，点「详情」看每个文件
  - 无法自动下载的链接（点开即去原页面）
  - 各采集源的累计条数、最近发现时间
  - 两个下载日志的尾部
"""

from __future__ import annotations

import argparse
import configparser
import csv
import json
import logging
import os
import shutil
import socket
import threading
import time
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_PORT = 8765
GB = 1024 ** 3

log = logging.getLogger("web_status")


# ---------------------------------------------------------------- 配置 / 路径


def _read_config(name: str) -> configparser.ConfigParser:
    cfg = configparser.ConfigParser()
    path = BASE_DIR / name
    if path.exists():
        try:
            cfg.read(path, encoding="utf-8")
        except (configparser.Error, OSError) as exc:
            log.warning("读取 %s 失败：%s", name, exc)
    return cfg


def _download_cfg(cfg: configparser.ConfigParser) -> tuple[Path | None, str, str]:
    if not cfg.has_section("download"):
        return None, "W-", ""
    sec = cfg["download"]
    dest = sec.get("dest_dir", "").strip()
    return (Path(dest) if dest else None), (sec.get("folder_prefix", "W-").strip() or "W-"), \
        sec.get("state_file", "").strip()


def _day_folder(day: str, prefix: str = "W-") -> str:
    try:
        y, m, d = (int(x) for x in str(day).split("-"))
        return f"{prefix}{y}.{m:02d}.{d:02d}"
    except ValueError:
        return prefix + str(day).replace("-", ".")


class Paths:
    def __init__(self) -> None:
        self.gb_cfg = _read_config("config.gb.ini")
        self.arca_cfg = _read_config("config.arca.ini")
        gb_dest, gb_prefix, gb_state = _download_cfg(self.gb_cfg)
        arca_dest, arca_prefix, arca_state = _download_cfg(self.arca_cfg)
        self.dest_root = gb_dest or arca_dest or (BASE_DIR / "A_每日更新")
        self.gb_dest = gb_dest or self.dest_root
        self.arca_dest = arca_dest or self.dest_root
        self.gb_prefix = gb_prefix
        self.arca_prefix = arca_prefix
        self.gb_state = BASE_DIR / (gb_state or "state.gb_downloads.json")
        self.arca_state = BASE_DIR / (arca_state or "state.arca_downloads.json")


# ---------------------------------------------------------------- 工具


def _load_json(path: Path) -> dict[str, Any] | None:
    for _ in range(3):
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except FileNotFoundError:
            return None
        except (json.JSONDecodeError, OSError):
            time.sleep(0.15)          # 写入用 os.replace，正常不会读到半截
    log.warning("状态文件读取失败：%s", path)
    return None


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes

        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)
        if not handle:
            return False
        ctypes.windll.kernel32.CloseHandle(handle)
        return True
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _safe_size(path: Path) -> int:
    try:
        return path.stat().st_size
    except OSError:
        return 0


def _parse_day(value: str) -> str:
    return str(value or "")[:10]


STATUS_LABELS = {
    "queued": "排队中",
    "pending": "待下载",
    "partial": "续传中",
    "done": "已完成",
    "manual": "需手动",
    "failed": "失败",
    "skipped": "已跳过",
}

STATUS_RANK = {
    "partial": 0,
    "pending": 1,
    "queued": 2,
    "manual": 3,
    "failed": 4,
    "done": 5,
    "skipped": 6,
}


def _status(value: str) -> str:
    return str(value or "queued").strip().lower() or "queued"


def _resolve_file(base_dir: Path | None, source: str, name: str) -> Path | None:
    """新布局 <day>/<来源>/<name>；兼容旧的 <day>/<name> 平铺布局。"""
    if not base_dir or not name:
        return None
    new = base_dir / source / name
    if not new.exists() and (base_dir / name).exists():
        return base_dir / name
    return new


def _file_info(base_dir: Path | None, source: str, name: str) -> tuple[int, bool]:
    path = _resolve_file(base_dir, source, name)
    if path is None:
        return 0, False
    return _safe_size(path), path.exists()


# ---------------------------------------------------------------- 队列归一化


def _collect_arca(state: dict[str, Any], paths: Paths, part_map: dict[tuple[str, str], dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key, entry in (state.get("items") or {}).items():
        day = _parse_day(str(entry.get("day") or ""))
        status = _status(entry.get("status"))
        title = str(entry.get("title") or entry.get("name") or key)
        day_base = paths.arca_dest / _day_folder(day, paths.arca_prefix) if day else None

        items: list[dict[str, Any]] = []
        for img in entry.get("images") or []:
            name = str(img.get("file") or "")
            actual, on_disk = _file_info(day_base, "arca.live", name)
            items.append({
                "type": "image",
                "name": name,
                "status": _status(img.get("status")),
                "size": actual,
                "planned": 0,
                "on_disk": on_disk,
                "error": str(img.get("error") or ""),
                "part": part_map.get((day, name)),
            })
        for plan in entry.get("mods") or []:
            kind = str(plan.get("type") or "")
            if kind == "kio":
                for f in plan.get("files") or []:
                    name = str(f.get("file") or "")
                    actual, on_disk = _file_info(day_base, "arca.live", name)
                    items.append({
                        "type": "file",
                        "kind": "kio",
                        "name": name,
                        "status": _status(f.get("status")),
                        "size": actual,
                        "planned": int(f.get("size") or 0),
                        "on_disk": on_disk,
                        "error": str(f.get("error") or ""),
                        "part": part_map.get((day, name)),
                    })
            elif kind == "nahida":
                for coll in plan.get("collections") or []:
                    for f in coll.get("files") or []:
                        name = str(f.get("file") or "")
                        actual, on_disk = _file_info(day_base, "arca.live", name)
                        items.append({
                            "type": "file",
                            "kind": "nahida",
                            "collection": str(coll.get("name") or ""),
                            "name": name,
                            "status": _status(f.get("status")),
                            "size": actual,
                            "planned": int(f.get("size") or 0),
                            "on_disk": on_disk,
                            "error": str(f.get("error") or ""),
                            "part": part_map.get((day, name)),
                        })
        out.append(_entry_record(
            source="arca.live", key=str(key), title=title,
            day=day, publish_date=_parse_day(str(entry.get("date") or "")),
            status=status, attempts=int(entry.get("attempts") or 0),
            last_error=str(entry.get("last_error") or ""),
            page_url=str(entry.get("page_url") or ""),
            items=items, manual=list(entry.get("manual") or []),
            kind=_arca_kind(entry),
        ))
    return out


def _arca_kind(entry: dict[str, Any]) -> str:
    kinds = [str(p.get("type") or "") for p in entry.get("mods") or []]
    if "nahida" in kinds and "kio" in kinds:
        return "kio+nahida"
    if kinds:
        return kinds[0]
    if entry.get("manual"):
        return "manual"
    return "images"


def _collect_gb(state: dict[str, Any], paths: Paths, part_map: dict[tuple[str, str], dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for key, entry in (state.get("items") or {}).items():
        day = _parse_day(str(entry.get("day") or ""))
        status = _status(entry.get("status"))
        title = str(entry.get("name") or entry.get("mod_id") or key)
        day_base = paths.gb_dest / _day_folder(day, paths.gb_prefix) if day else None
        items: list[dict[str, Any]] = []
        for img in entry.get("images") or []:
            name = str(img.get("file") or "")
            actual, on_disk = _file_info(day_base, "GameBanana", name)
            items.append({
                "type": "image", "name": name, "status": _status(img.get("status")),
                "size": actual, "planned": 0,
                "on_disk": on_disk,
                "error": str(img.get("error") or ""),
                "part": part_map.get((day, name)),
            })
        for f in entry.get("files") or []:
            name = str(f.get("file") or "")
            actual, on_disk = _file_info(day_base, "GameBanana", name)
            items.append({
                "type": "file", "kind": "gamebanana", "name": name,
                "status": _status(f.get("status")), "size": actual,
                "planned": int(f.get("size") or 0),
                "on_disk": on_disk,
                "error": str(f.get("error") or ""),
                "part": part_map.get((day, name)),
            })
        out.append(_entry_record(
            source="GameBanana", key=str(key), title=title, day=day,
            publish_date=_parse_day(str(entry.get("date") or "")),
            status=status, attempts=int(entry.get("attempts") or 0),
            last_error=str(entry.get("last_error") or ""),
            page_url=str(entry.get("page_url") or ""),
            items=items, manual=[], kind="gamebanana",
        ))
    return out


def _entry_record(
    *,
    source: str,
    key: str,
    title: str,
    day: str,
    publish_date: str,
    status: str,
    attempts: int,
    last_error: str,
    page_url: str,
    items: list[dict[str, Any]],
    manual: list[dict[str, Any]],
    kind: str,
) -> dict[str, Any]:
    images = [x for x in items if x["type"] == "image"]
    files = [x for x in items if x["type"] == "file"]
    done = sum(1 for x in items if x["status"] == "done")
    on_disk = sum(1 for x in items if x.get("on_disk"))
    images_on_disk = sum(1 for x in images if x.get("on_disk"))
    files_on_disk = sum(1 for x in files if x.get("on_disk"))
    part_bytes = sum(int((x.get("part") or {}).get("size") or 0) for x in items)
    bytes_done = sum(int(x["size"] or 0) for x in items) + part_bytes
    bytes_total = sum(
        int(x["size"] or 0) or int(x.get("planned") or 0) for x in items
    )
    parts = [x["part"] for x in items if x.get("part")]
    part = max(parts, key=lambda p: int(p.get("size") or 0)) if parts else None
    return {
        "source": source,
        "key": key,
        "title": title,
        "day": day,
        "publish_date": publish_date,
        "status": status,
        "status_label": STATUS_LABELS.get(status, status),
        "attempts": attempts,
        "last_error": last_error,
        "page_url": page_url,
        "kind": kind,
        "images": {"done": sum(1 for x in images if x["status"] == "done"),
                   "on_disk": images_on_disk, "total": len(images)},
        "files": {"done": sum(1 for x in files if x["status"] == "done"),
                  "on_disk": files_on_disk, "total": len(files)},
        "done": done,
        "on_disk": on_disk,
        "total": len(items),
        "bytes_done": bytes_done,
        "bytes_total": bytes_total,
        "manual": [
            {"link": str(m.get("link") or ""), "reason": str(m.get("reason") or "")}
            for m in manual
        ],
        "part": part,
        "items": items,
    }


def _scan_parts(
    dest_root: Path, prefix: str, days: set[str], source_name: str
) -> dict[tuple[str, str], dict[str, Any]]:
    """扫描 .part：新布局 <day>/<来源>/ 优先，旧的 <day>/ 平铺布局兜底。"""
    found: dict[tuple[str, str], dict[str, Any]] = {}
    for day in days:
        if not day:
            continue
        folder = dest_root / _day_folder(day, prefix)
        if not folder.exists():
            continue
        # 先扫旧根目录（跳过来源子目录），再扫来源子目录；同名时新布局覆盖旧布局
        for root, is_source in ((folder, False), (folder / source_name, True)):
            if not root.exists():
                continue
            try:
                parts = list(root.rglob("*.part"))
            except OSError:
                continue
            for part in parts:
                try:
                    st = part.stat()
                except OSError:
                    continue
                rel_path = part.relative_to(root)
                if not is_source and rel_path.parts and rel_path.parts[0] == source_name:
                    continue
                rel = str(rel_path).replace("\\", "/")
                name = rel[:-5] if rel.endswith(".part") else rel
                found[(day, name)] = {
                    "name": rel,
                    "size": st.st_size,
                    "mtime": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds"),
                }
    return found


# ---------------------------------------------------------------- 采集源统计


def _sources(summary_root: Path) -> list[dict[str, Any]]:
    if not summary_root.exists():
        return []
    rows: list[dict[str, Any]] = []

    def one(label: str, folder: Path) -> None:
        csv_path = folder / "all_mods.csv"
        if not csv_path.exists():
            return
        total = 0
        last_new = ""
        last_date = ""
        try:
            with csv_path.open("r", encoding="utf-8-sig", newline="") as fh:
                for rec in csv.DictReader(fh):
                    total += 1
                    stamp = rec.get("首次发现时间") or ""
                    if stamp > last_new:
                        last_new = stamp
                    d = rec.get("日期") or rec.get("发布时间") or ""
                    if d[:10] > last_date:
                        last_date = d[:10]
        except (OSError, UnicodeDecodeError):
            return
        try:
            tables = len(list(folder.glob("W-*.csv")))
            images = len(list((folder / "images").glob("*"))) if (folder / "images").exists() else 0
        except OSError:
            tables = images = 0
        rows.append({
            "name": label,
            "total": total,
            "last_new": last_new,
            "last_date": last_date,
            "tables": tables,
            "images": images,
        })

    for child in sorted(summary_root.iterdir(), key=lambda p: p.name.lower()):
        if not child.is_dir():
            continue
        if (child / "all_mods.csv").exists():
            one(child.name, child)
            continue
        for sub in sorted(child.iterdir(), key=lambda p: p.name.lower()):
            if sub.is_dir() and (sub / "all_mods.csv").exists():
                one(f"{child.name}/{sub.name}", sub)
    return rows


# ---------------------------------------------------------------- 日志


def _log_tail(path: Path, lines: int = 200) -> list[str]:
    if not path.exists():
        return []
    try:
        with path.open("rb") as fh:
            fh.seek(0, os.SEEK_END)
            size = fh.tell()
            fh.seek(max(0, size - 256 * 1024))
            raw = fh.read()
    except OSError:
        return []
    for enc in ("utf-8", "gbk", "cp936"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", errors="replace")
    return text.splitlines()[-lines:]


# ---------------------------------------------------------------- 快照


class Snapshot:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.cache: dict[str, Any] | None = None
        self.cache_at = 0.0
        self.ttl = 2.0

    def get(self, paths: Paths) -> dict[str, Any]:
        with self.lock:
            now = time.time()
            if self.cache is not None and now - self.cache_at < self.ttl:
                return self.cache
            data = self._build(paths)
            self.cache = data
            self.cache_at = now
            return data

    def _build(self, paths: Paths) -> dict[str, Any]:
        arca_state = _load_json(paths.arca_state) or {}
        gb_state = _load_json(paths.gb_state) or {}

        days: set[str] = set()
        for state in (arca_state, gb_state):
            for entry in (state.get("items") or {}).values():
                d = _parse_day(str(entry.get("day") or ""))
                if d:
                    days.add(d)

        arca_parts = _scan_parts(paths.arca_dest, paths.arca_prefix, days, "arca.live")
        gb_parts = _scan_parts(paths.gb_dest, paths.gb_prefix, days, "GameBanana")

        entries = _collect_arca(arca_state, paths, arca_parts)
        entries += _collect_gb(gb_state, paths, gb_parts)
        entries.sort(key=lambda e: (STATUS_RANK.get(e["status"], 9), e["day"] or "0", e["title"]))

        manual: list[dict[str, Any]] = []
        for e in entries:
            for m in e.get("manual") or []:
                if "跳过重复下载" in m["reason"]:
                    continue                 # 同一模组的重复帖，不是待办
                manual.append({
                    "source": e["source"], "title": e["title"], "day": e["day"],
                    "link": m["link"], "reason": m["reason"],
                })

        parts = []
        seen_parts = set()
        for e in entries:
            p = e.get("part")
            if not p:
                continue
            key = (e["source"], e.get("key"), p.get("name"))
            if key in seen_parts:
                continue
            seen_parts.add(key)
            parts.append({
                "source": e["source"], "title": e["title"], "day": e["day"],
                "name": p.get("name"), "size": p.get("size"), "mtime": p.get("mtime"),
                "entry_status": e["status"], "entry_total": e["total"],
                "entry_done": e["done"],
            })

        counts = {"total": len(entries), "done": 0, "active": 0, "queued": 0,
                  "manual": 0, "failed": 0, "skipped": 0}
        for e in entries:
            s = e["status"]
            if s == "done":
                counts["done"] += 1
            elif s in ("partial", "pending"):
                counts["active"] += 1
            elif s == "queued":
                counts["queued"] += 1
            elif s == "manual":
                counts["manual"] += 1
            elif s == "failed":
                counts["failed"] += 1
            else:
                counts["skipped"] += 1

        bytes_done = sum(int(e["bytes_done"] or 0) for e in entries)
        bytes_total = sum(int(e["bytes_total"] or 0) for e in entries)

        try:
            usage = shutil.disk_usage(str(paths.dest_root))
            disk = {"free_gb": round(usage.free / GB, 1),
                    "total_gb": round(usage.total / GB, 1)}
        except OSError:
            disk = {"free_gb": 0.0, "total_gb": 0.0}

        # 下载进程：arca 有 run.lock；GB 没有，用日志时间判断
        run_lock = paths.arca_state.with_suffix(paths.arca_state.suffix + ".run.lock")
        running = {"arca": False, "pid": 0}
        try:
            raw = run_lock.read_text(encoding="ascii", errors="ignore").strip()
            pid = int(raw) if raw.isdigit() else 0
            running = {"arca": _pid_alive(pid), "pid": pid}
        except (OSError, ValueError):
            pass

        log_paths = {
            "arca": BASE_DIR / "arca_download.log",
            "gb": BASE_DIR / "gamebanana_download.log",
        }
        logs = {k: _log_tail(p, 200) for k, p in log_paths.items()}
        log_mtimes = {}
        for k, p in log_paths.items():
            try:
                log_mtimes[k] = datetime.fromtimestamp(p.stat().st_mtime).isoformat(timespec="seconds")
            except OSError:
                log_mtimes[k] = ""

        sources = _sources(paths.dest_root / "_Mod每日汇总")

        return {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "dest_root": str(paths.dest_root),
            "disk": disk,
            "process": {**running, "log_mtimes": log_mtimes},
            "summary": {**counts, "bytes_done": bytes_done, "bytes_total": bytes_total},
            "entries": entries,
            "parts": parts,
            "manual": manual,
            "sources": sources,
            "logs": logs,
        }


SNAPSHOT = Snapshot()


# ---------------------------------------------------------------- HTTP


class Handler(BaseHTTPRequestHandler):
    server_version = "ModStatus/1.0"

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        path = urlsplit(self.path).path
        if path in ("/", "/index.html"):
            body = HTML.encode("utf-8")
            self._send(200, body, "text/html; charset=utf-8")
        elif path == "/api/status":
            try:
                data = SNAPSHOT.get(PATHS)
                body = json.dumps(data, ensure_ascii=False).encode("utf-8")
                self._send(200, body, "application/json; charset=utf-8")
            except Exception as exc:  # noqa: BLE001 - 看板自身不能因单次异常挂掉
                log.exception("生成状态失败：%s", exc)
                self._send(500, json.dumps({"error": str(exc)}).encode("utf-8"),
                           "application/json; charset=utf-8")
        elif path == "/favicon.ico":
            self._send(204, b"", "image/x-icon")
        else:
            self._send(404, b"not found", "text/plain; charset=utf-8")

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        try:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, fmt: str, *args: Any) -> None:
        log.info("%s - %s", self.address_string(), fmt % args)


HTML = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mod 下载看板</title>
<style>
:root{
  --bg:#f4f6fa; --panel:#ffffff; --panel-2:#f8fafc; --text:#16202e; --muted:#667085;
  --line:#e3e8ef; --accent:#2563eb; --accent-soft:#e8f0ff;
  --green:#0f9d58; --green-soft:#e7f6ee; --amber:#b45309; --amber-soft:#fff4e5;
  --red:#dc2626; --red-soft:#fdecec; --gray:#6b7280; --gray-soft:#eef1f5;
  --shadow:0 1px 2px rgba(16,24,40,.05), 0 4px 16px rgba(16,24,40,.04);
  --radius:14px; --mono:ui-monospace,SFMono-Regular,Consolas,"Liberation Mono",monospace;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0b0f16; --panel:#131923; --panel-2:#0f151e; --text:#e6ebf2; --muted:#93a0b4;
    --line:#25303f; --accent:#5b9bff; --accent-soft:#16243c;
    --green:#3ddc97; --green-soft:#102a20; --amber:#f5b94c; --amber-soft:#2b2110;
    --red:#ff6b6b; --red-soft:#2c1517; --gray:#a2adbd; --gray-soft:#1a2230;
    --shadow:0 1px 2px rgba(0,0,0,.25), 0 8px 24px rgba(0,0,0,.22);
  }
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  background:var(--bg); color:var(--text); font:14px/1.55 -apple-system,BlinkMacSystemFont,
  "Segoe UI","Microsoft YaHei","PingFang SC",sans-serif; padding:22px 22px 48px;
}
a{color:var(--accent); text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:1480px;margin:0 auto}
header.top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
h1{font-size:22px;letter-spacing:.2px;margin:0}
.sub{color:var(--muted);font-size:12.5px;margin-top:4px}
.controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.card{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px}
.stat{padding:14px 16px}
.stat .k{font-size:12px;color:var(--muted);letter-spacing:.2px}
.stat .v{font-size:22px;font-weight:650;margin-top:4px;font-variant-numeric:tabular-nums}
.stat .h{font-size:11.5px;color:var(--muted);margin-top:2px}
.stat.done .v{color:var(--green)} .stat.active .v{color:var(--accent)}
.stat.manual .v{color:var(--amber)} .stat.failed .v{color:var(--red)}
section{margin:16px 0}
section h2{font-size:15px;margin:0 0 10px;display:flex;align-items:center;gap:8px}
section h2 .count{font-size:12px;color:var(--muted);font-weight:500}
.badge{display:inline-flex;align-items:center;gap:6px;padding:2px 9px;border-radius:999px;font-size:12px;line-height:20px;border:1px solid transparent;white-space:nowrap}
.dot{width:7px;height:7px;border-radius:50%;background:currentColor;display:inline-block}
.b-done{background:var(--green-soft);color:var(--green);border-color:color-mix(in srgb,var(--green) 25%,transparent)}
.b-active{background:var(--accent-soft);color:var(--accent);border-color:color-mix(in srgb,var(--accent) 25%,transparent)}
.b-queued{background:var(--gray-soft);color:var(--gray);border-color:color-mix(in srgb,var(--gray) 22%,transparent)}
.b-manual{background:var(--amber-soft);color:var(--amber);border-color:color-mix(in srgb,var(--amber) 25%,transparent)}
.b-failed{background:var(--red-soft);color:var(--red);border-color:color-mix(in srgb,var(--red) 25%,transparent)}
.src{font-size:11.5px;color:var(--muted);background:var(--panel-2);border:1px solid var(--line);border-radius:8px;padding:1px 7px;white-space:nowrap}
.toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--line)}
.toolbar input[type=search]{flex:1 1 240px;min-width:180px;background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:8px 11px;outline:none}
.toolbar input[type=search]:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.toolbar select{background:var(--panel-2);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:8px 10px}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{border:1px solid var(--line);background:var(--panel-2);color:var(--muted);border-radius:999px;padding:5px 11px;font-size:12.5px;cursor:pointer;user-select:none}
.chip.on{background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 35%,transparent);color:var(--accent);font-weight:600}
.toggle{display:inline-flex;align-items:center;gap:7px;color:var(--muted);font-size:12.5px;user-select:none}
.btn{background:var(--panel);border:1px solid var(--line);color:var(--text);border-radius:10px;padding:7px 12px;cursor:pointer;font-size:13px}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn.primary:hover{filter:brightness(1.05);color:#fff}
.tablewrap{overflow:auto;border-radius:0 0 var(--radius) var(--radius)}
table{width:100%;border-collapse:separate;border-spacing:0;min-width:1080px}
th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{position:sticky;top:0;background:var(--panel-2);color:var(--muted);font-weight:600;font-size:12px;letter-spacing:.2px;z-index:1}
tbody tr:hover{background:var(--panel-2)}
td.title{max-width:430px}
.tt{font-weight:600;word-break:break-word}
.ts{font-size:11.5px;color:var(--muted);word-break:break-all;margin-top:2px}
.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.err{max-width:280px;font-size:12px;color:var(--red);word-break:break-word}
.prog{display:flex;flex-direction:column;gap:5px;min-width:150px}
.bar{height:6px;border-radius:999px;background:var(--gray-soft);overflow:hidden}
.bar > i{display:block;height:100%;background:var(--accent);border-radius:999px;transition:width .35s ease}
.bar.done > i{background:var(--green)} .bar.failed > i{background:var(--red)}
.ptext{font-size:11.5px;color:var(--muted);white-space:nowrap}
.actions{display:flex;gap:8px;align-items:center;white-space:nowrap}
.linkbtn{font-size:12px}
.empty{padding:26px 16px;text-align:center;color:var(--muted)}
.parts{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.part{padding:14px 16px}
.part .pt{font-weight:600;word-break:break-word}
.part .pm{font-size:12px;color:var(--muted);margin-top:3px}
.part .pbar{height:7px;border-radius:999px;background:var(--gray-soft);overflow:hidden;margin-top:10px;position:relative}
.part .pbar::after{content:"";position:absolute;inset:0;width:40%;background:linear-gradient(90deg,transparent,var(--accent),transparent);animation:sweep 1.4s infinite}
@keyframes sweep{0%{transform:translateX(-120%)}100%{transform:translateX(320%)}}
.part .pv{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:6px;font-variant-numeric:tabular-nums}
.manual-list{display:flex;flex-direction:column}
.manual-row{display:flex;gap:12px;align-items:flex-start;padding:11px 14px;border-bottom:1px solid var(--line)}
.manual-row:last-child{border-bottom:0}
.manual-row .mt{font-weight:600;min-width:220px;max-width:420px;word-break:break-word}
.manual-row .ml{flex:1;min-width:200px;word-break:break-all;font-size:12.5px}
.manual-row .mr{color:var(--muted);font-size:12px;min-width:200px;max-width:340px}
details.panel > summary{cursor:pointer;list-style:none;padding:12px 14px;font-weight:600;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:center}
details.panel > summary::-webkit-details-marker{display:none}
details.panel > summary::before{content:"▸";color:var(--muted);transition:transform .15s ease;display:inline-block}
details.panel[open] > summary::before{transform:rotate(90deg)}
details.panel > .body{padding:12px 14px}
details.panel{border:1px solid var(--line);border-radius:var(--radius);background:var(--panel);box-shadow:var(--shadow)}
pre.log{max-height:380px;overflow:auto;background:#0d1117;color:#d6deeb;border-radius:10px;padding:12px;font:12px/1.55 var(--mono);white-space:pre-wrap;word-break:break-all;margin:0}
.tabs{display:flex;gap:8px;margin-bottom:10px}
.src-table td,.src-table th{padding:9px 12px}
.banner{display:none;background:var(--red-soft);border:1px solid color-mix(in srgb,var(--red) 30%,transparent);color:var(--red);padding:10px 14px;border-radius:12px;margin-bottom:14px;font-size:13px}
.banner.show{display:block}
.footer{color:var(--muted);font-size:11.5px;margin-top:22px;text-align:center}
.legend{display:flex;gap:14px;flex-wrap:wrap;color:var(--muted);font-size:11.5px;margin-top:6px}
@media (max-width:760px){
  body{padding:14px 12px 36px}
  h1{font-size:19px}
  .stat .v{font-size:19px}
  .manual-row{flex-direction:column;gap:4px}
  .manual-row .mt{min-width:0;max-width:none}
}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <div>
      <h1>Mod 下载看板</h1>
      <div class="sub" id="subline">正在读取…</div>
    </div>
    <div class="controls">
      <label class="toggle"><input type="checkbox" id="auto" checked> 每 5 秒自动刷新</label>
      <button class="btn" id="refresh">立即刷新</button>
    </div>
  </header>

  <div class="banner" id="banner"></div>

  <div class="cards" id="cards"></div>

  <section id="partsSection" style="display:none">
    <h2>正在下载 <span class="count" id="partsCount"></span></h2>
    <div class="parts" id="parts"></div>
  </section>

  <section class="card" style="padding:0">
    <div class="toolbar">
      <input type="search" id="q" placeholder="搜索标题 / 链接 / 文件…">
      <select id="source">
        <option value="all">全部来源</option>
        <option value="arca.live">arca.live</option>
        <option value="GameBanana">GameBanana</option>
      </select>
      <select id="day"><option value="all">全部日期</option></select>
      <div class="chips" id="chips">
        <span class="chip on" data-st="all">全部</span>
        <span class="chip" data-st="active">下载中</span>
        <span class="chip" data-st="queued">排队</span>
        <span class="chip" data-st="done">已完成</span>
        <span class="chip" data-st="manual">需手动</span>
        <span class="chip" data-st="failed">失败</span>
      </div>
    </div>
    <div class="tablewrap">
      <table id="tbl">
        <thead><tr>
          <th style="width:92px">状态</th><th style="width:104px">来源</th><th>标题</th>
          <th style="width:104px">下载日</th><th style="width:190px">进度</th>
          <th style="width:150px">已下载</th><th style="width:60px">尝试</th>
          <th>说明 / 错误</th><th style="width:96px">操作</th>
        </tr></thead>
        <tbody id="tbody"></tbody>
      </table>
      <div class="empty" id="empty" style="display:none">没有匹配的条目</div>
    </div>
  </section>
  <div class="legend" id="legend"></div>

  <section id="manualSection" style="display:none">
    <h2>需手动下载 <span class="count" id="manualCount"></span>
      <button class="btn" id="copyManual" style="margin-left:auto;font-size:12px;padding:5px 10px">复制全部链接</button>
    </h2>
    <div class="card manual-list" id="manualList"></div>
  </section>

  <section id="sourcesSection" style="display:none">
    <h2>采集源累计 <span class="count" id="sourcesCount"></span></h2>
    <div class="card tablewrap">
      <table class="src-table" style="min-width:720px">
        <thead><tr><th>来源</th><th>累计条目</th><th>最近发现</th><th>最近发布日期</th><th>每日表</th><th>预览图</th></tr></thead>
        <tbody id="sources"></tbody>
      </table>
    </div>
  </section>

  <section>
    <h2>日志尾部</h2>
    <div class="tabs">
      <button class="btn primary" data-log="arca">arca_download.log</button>
      <button class="btn" data-log="gb">gamebanana_download.log</button>
    </div>
    <pre class="log" id="log"></pre>
  </section>

  <div class="footer" id="footer"></div>
</div>

<script>
const $ = (s) => document.querySelector(s);
let DATA = null;
let FILTER = {status: "all", q: "", source: "all", day: "all"};
let LOG_TAB = "arca";
let DETAILED = new Set();
let timer = null;

const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, c => (
  {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeUrl = (u) => /^https?:\/\//i.test(String(u || "")) ? String(u) : "#";
const fmtBytes = (n) => {
  n = Number(n || 0);
  if (!n) return "0 B";
  const u = ["B","KB","MB","GB","TB"]; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (n >= 100 || i === 0 ? n.toFixed(0) : n.toFixed(1)) + " " + u[i];
};
const ST_LABEL = {queued:"排队中", pending:"待下载", partial:"续传中", done:"已完成",
  manual:"需手动", failed:"失败", skipped:"已跳过"};
const stLabel = (s) => ST_LABEL[s] || s;
const stClass = (s) => s === "done" ? "done" : s === "partial" || s === "pending" ? "active"
  : s === "manual" ? "manual" : s === "failed" ? "failed" : "queued";
const stBadge = (s, label) => `<span class="badge b-${stClass(s)}"><i class="dot"></i>${esc(label || s)}</span>`;
const relTime = (iso) => {
  if (!iso) return "—";
  const t = Date.parse(iso); if (isNaN(t)) return iso;
  const d = (Date.now() - t) / 1000;
  if (d < 0) return "刚刚";
  if (d < 60) return Math.round(d) + " 秒前";
  if (d < 3600) return Math.round(d / 60) + " 分钟前";
  if (d < 86400) return Math.round(d / 3600) + " 小时前";
  return Math.round(d / 86400) + " 天前";
};
const pct = (e) => {
  if (e.status === "done") return 100;
  if (e.bytes_total > 0 && e.bytes_done > 0) {
    return Math.min(100, Math.round(e.bytes_done * 100 / e.bytes_total));  // 有字节数时按字节更准
  }
  const eff = Math.max(e.done || 0, e.on_disk || 0);
  return e.total ? Math.round(eff * 100 / e.total) : 0;
};

function matches(e) {
  const f = FILTER;
  if (f.source !== "all" && e.source !== f.source) return false;
  if (f.day !== "all" && e.day !== f.day) return false;
  if (f.status === "active") { if (!(e.status === "partial" || e.status === "pending")) return false; }
  else if (f.status !== "all" && e.status !== f.status) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [e.title, e.page_url, e.last_error, e.key,
      ...(e.items || []).map(x => x.name)].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function progressCell(e) {
  const p = pct(e);
  const cls = e.status === "done" ? "done" : e.status === "failed" ? "failed" : "";
  const parts = [];
  const ie = Math.max(e.images.done || 0, e.images.on_disk || 0);
  const fe = Math.max(e.files.done || 0, e.files.on_disk || 0);
  if (e.images.total) parts.push(`图 ${ie}/${e.images.total}`);
  if (e.files.total) parts.push(`文件 ${fe}/${e.files.total}`);
  if (!parts.length) parts.push(e.manual && e.manual.length ? `${e.manual.length} 个手动链接` : "无文件");
  return `<div class="prog">
    <div class="bar ${cls}" title="${p}%"><i style="width:${p}%"></i></div>
    <div class="ptext">${parts.join(" · ")}${e.total ? ` · ${p}%` : ""}</div>
  </div>`;
}

function sizeCell(e) {
  const total = e.bytes_total ? fmtBytes(e.bytes_total) : "—";
  const missing = e.status === "done" && !e.bytes_done && e.bytes_total;
  return `<div class="num">${fmtBytes(e.bytes_done)} <span style="color:var(--muted)">/ ${total}</span></div>
    ${missing ? `<div class="ts" title="文件已不在队列记录的日期目录里，通常是手动重命名/移动过">原路径已无文件</div>` : ""}`;
}

function detailRow(e) {
  const groups = {image: [], file: []};
  (e.items || []).forEach(x => (groups[x.type] || groups.file).push(x));
  const render = (arr, label) => {
    if (!arr.length) return "";
    return `<div style="margin:6px 0 10px">
      <div style="font-weight:600;color:var(--muted);font-size:12px;margin-bottom:6px">${label}（${arr.length}）</div>
      <div style="display:flex;flex-direction:column;gap:4px">
      ${arr.map(x => {
        const liveDone = x.on_disk && ["pending","queued","partial"].includes(x.status);
        const cls = liveDone ? "active" : stClass(x.status);
        const label = liveDone ? "已落盘" : stLabel(x.status);
        const size = Number(x.size || 0) || Number(x.planned || 0);
        return `<div style="display:flex;gap:10px;align-items:flex-start;font-size:12.5px">
          <span class="badge b-${cls}" style="min-width:76px;justify-content:center"><i class="dot"></i>${esc(label)}</span>
          <span style="flex:1;word-break:break-all">${esc(x.name)}</span>
          <span class="num" style="color:var(--muted);white-space:nowrap">${size ? fmtBytes(size) : ""}</span>
          ${x.part ? `<span class="num" style="color:var(--accent);white-space:nowrap">↓${fmtBytes(x.part.size)}</span>` : ""}
          ${x.error ? `<span style="color:var(--red);max-width:340px;word-break:break-word">${esc(x.error)}</span>` : ""}
        </div>`;
      }).join("")}
      </div></div>`;
  };
  const manual = (e.manual || []).length ? `<div style="margin-top:8px">
    <div style="font-weight:600;color:var(--muted);font-size:12px;margin-bottom:6px">需手动链接（${e.manual.length}）</div>
    ${e.manual.map(m => `<div style="font-size:12.5px;margin:3px 0"><a href="${esc(safeUrl(m.link))}" target="_blank" rel="noreferrer">${esc(m.link)}</a> <span style="color:var(--muted)">· ${esc(m.reason)}</span></div>`).join("")}
  </div>` : "";
  return `<tr class="detail" data-detail="${esc(e.source)}:${esc(e.key)}">
    <td colspan="9" style="background:var(--panel-2)">${render(groups.image, "图片")}${render(groups.file, "Mod 文件")}${manual}</td>
  </tr>`;
}

function renderTable() {
  if (!DATA) return;
  const rows = DATA.entries.filter(matches);
  const tb = $("#tbody");
  tb.innerHTML = rows.map(e => {
    const id = `${e.source}:${e.key}`;
    const open = DETAILED.has(id);
    const note = e.last_error || ((e.manual && e.manual[0]) ? e.manual[0].reason : "");
    return `<tr data-id="${esc(id)}">
      <td>${stBadge(e.status, e.status_label)}</td>
      <td><span class="src">${esc(e.source)}</span></td>
      <td class="title"><div class="tt">${esc(e.title)}</div>
        <div class="ts">${e.day ? `下载日 ${esc(e.day)}` : ""}${e.publish_date ? ` · 发布 ${esc(e.publish_date)}` : ""}${e.kind ? ` · ${esc(e.kind)}` : ""}</div></td>
      <td class="num">${esc(e.day || "—")}</td>
      <td>${progressCell(e)}</td>
      <td>${sizeCell(e)}</td>
      <td class="num">${e.attempts || 0}</td>
      <td class="err" title="${esc(note)}">${esc(note)}</td>
      <td class="actions">
        <button class="btn linkbtn" data-toggle="${esc(id)}">${open ? "收起" : "详情"}</button>
        ${e.page_url ? `<a class="linkbtn" href="${esc(safeUrl(e.page_url))}" target="_blank" rel="noreferrer">原帖</a>` : ""}
      </td>
    </tr>${open ? detailRow(e) : ""}`;
  }).join("");
  $("#empty").style.display = rows.length ? "none" : "block";
}

function renderCards() {
  const s = DATA.summary;
  const cards = [
    ["total", "总条目", s.total, ""],
    ["done", "已完成", s.done, ""],
    ["active", "待处理 / 续传", s.active, ""],
    ["queued", "排队", s.queued, ""],
    ["manual", "需手动", s.manual, `${(DATA.manual || []).length} 个链接`],
    ["failed", "失败", s.failed, ""],
    ["bytes", "已下载", fmtBytes(s.bytes_done), `计划 ${fmtBytes(s.bytes_total)}`],
    ["disk", "磁盘剩余", DATA.disk.free_gb + " GB", `共 ${DATA.disk.total_gb} GB`],
  ];
  $("#cards").innerHTML = cards.map(([cls, k, v, h]) => `
    <div class="card stat ${cls}"><div class="k">${k}</div><div class="v">${v}</div>
    ${h ? `<div class="h">${h}</div>` : ""}</div>`).join("");
}

function renderParts() {
  const list = (DATA.parts || []).slice().sort((a, b) => b.size - a.size);
  const sec = $("#partsSection");
  if (!list.length) { sec.style.display = "none"; return; }
  sec.style.display = "";
  $("#partsCount").textContent = `${list.length} 个 .part 正在写盘`;
  $("#parts").innerHTML = list.map(p => `
    <div class="card part">
      <div class="pt">${esc(p.title)}</div>
      <div class="pm">${esc(p.name)}</div>
      <div class="pbar"></div>
      <div class="pv"><span>${esc(p.source)} · ${esc(p.day || "—")}</span>
        <span>已写 ${fmtBytes(p.size)}${p.entry_total ? ` · ${p.entry_done}/${p.entry_total}` : ""}
        · ${relTime(p.mtime)}</span></div>
    </div>`).join("");
}

function renderManual() {
  const list = DATA.manual || [];
  const sec = $("#manualSection");
  if (!list.length) { sec.style.display = "none"; return; }
  sec.style.display = "";
  $("#manualCount").textContent = `${list.length} 个链接`;
  $("#manualList").innerHTML = list.map(m => `
    <div class="manual-row">
      <div class="mt">${esc(m.title)}<div class="ts">${esc(m.source)} · ${esc(m.day || "—")}</div></div>
      <div class="ml"><a href="${esc(safeUrl(m.link))}" target="_blank" rel="noreferrer">${esc(m.link)}</a></div>
      <div class="mr">${esc(m.reason)}</div>
    </div>`).join("");
}

function renderSources() {
  const list = DATA.sources || [];
  const sec = $("#sourcesSection");
  if (!list.length) { sec.style.display = "none"; return; }
  sec.style.display = "";
  $("#sourcesCount").textContent = `${list.length} 个来源`;
  $("#sources").innerHTML = list.map(s => `<tr>
    <td>${esc(s.name)}</td><td class="num">${s.total}</td>
    <td class="num" title="${esc(s.last_new)}">${relTime(s.last_new)}</td>
    <td class="num">${esc(s.last_date || "—")}</td>
    <td class="num">${s.tables}</td><td class="num">${s.images}</td></tr>`).join("");
}

function renderLog() {
  const lines = (DATA.logs && DATA.logs[LOG_TAB]) || [];
  const pre = $("#log");
  const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 30;
  pre.textContent = lines.length ? lines.join("\n") : "（日志为空）";
  if (atBottom) pre.scrollTop = pre.scrollHeight;
}

function renderMeta() {
  const p = DATA.process || {};
  const bits = [];
  bits.push(`数据目录 <span style="font-family:var(--mono)">${esc(DATA.dest_root)}</span>`);
  bits.push(`更新于 ${new Date().toLocaleTimeString("zh-CN", {hour12:false})}`);
  if (p.arca) bits.push(`<span class="badge b-active" style="font-size:11px"><i class="dot"></i>下载进程运行中 · PID ${p.pid}</span>`);
  else bits.push(`下载进程未运行（下轮计划任务会自动拉起）`);
  $("#subline").innerHTML = bits.join(" · ");
  $("#footer").textContent = `最后生成：${DATA.generated_at} · 日志活动：arca ${relTime(p.log_mtimes && p.log_mtimes.arca)} / GB ${relTime(p.log_mtimes && p.log_mtimes.gb)}`;
}

function updateDayOptions() {
  const sel = $("#day");
  const cur = sel.value || "all";
  const days = [...new Set((DATA.entries || []).map(e => e.day).filter(Boolean))]
    .sort().reverse();
  const html = '<option value="all">全部日期</option>' +
    days.map(d => `<option value="${esc(d)}">${esc(d)}</option>`).join("");
  if (sel.innerHTML !== html) {
    sel.innerHTML = html;
    sel.value = [...sel.options].some(o => o.value === cur) ? cur : "all";
  }
}

function renderAll() {
  if (!DATA) return;
  hideBanner();
  updateDayOptions();
  renderMeta(); renderCards(); renderParts(); renderTable();
  renderManual(); renderSources(); renderLog();
}

async function load() {
  try {
    const r = await fetch("/api/status", {cache: "no-store"});
    if (!r.ok) throw new Error("HTTP " + r.status);
    DATA = await r.json();
    renderAll();
  } catch (e) {
    showBanner("读取状态失败：" + e.message + "（服务器是否还在运行？）");
  }
}

function showBanner(msg) {
  const b = $("#banner"); b.textContent = msg; b.classList.add("show");
}
function hideBanner(){ $("#banner").classList.remove("show"); }

function setAuto(on) {
  if (timer) { clearInterval(timer); timer = null; }
  if (on) timer = setInterval(() => { if (!document.hidden) load(); }, 5000);
}

$("#auto").addEventListener("change", (e) => setAuto(e.target.checked));
$("#refresh").addEventListener("click", load);
$("#q").addEventListener("input", (e) => { FILTER.q = e.target.value.trim(); renderTable(); });
$("#source").addEventListener("change", (e) => { FILTER.source = e.target.value; renderTable(); });
$("#day").addEventListener("change", (e) => { FILTER.day = e.target.value; renderTable(); });
$("#chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".chip"); if (!chip) return;
  document.querySelectorAll("#chips .chip").forEach(c => c.classList.toggle("on", c === chip));
  FILTER.status = chip.dataset.st; renderTable();
});
$("#tbody").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-toggle]"); if (!btn) return;
  const id = btn.dataset.toggle;
  if (DETAILED.has(id)) DETAILED.delete(id); else DETAILED.add(id);
  renderTable();
});
document.querySelectorAll("[data-log]").forEach(btn => btn.addEventListener("click", () => {
  LOG_TAB = btn.dataset.log;
  document.querySelectorAll("[data-log]").forEach(b => b.classList.toggle("primary", b === btn));
  renderLog();
}));
$("#copyManual").addEventListener("click", async () => {
  const txt = (DATA.manual || []).map(m => m.link).join("\n");
  try { await navigator.clipboard.writeText(txt); $("#copyManual").textContent = "已复制"; }
  catch { $("#copyManual").textContent = "复制失败"; }
  setTimeout(() => $("#copyManual").textContent = "复制全部链接", 1500);
});

setAuto(true);
load();
</script>
</body>
</html>
"""


# ---------------------------------------------------------------- 启动


PATHS = Paths()
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")


def _local_ip() -> str:
    try:
        return socket.gethostbyname(socket.gethostname())
    except OSError:
        return "127.0.0.1"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Mod 下载看板")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址，默认仅本机")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="起始端口")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args(argv)

    server = None
    port = args.port
    for candidate in range(args.port, args.port + 12):
        try:
            server = ThreadingHTTPServer((args.host, candidate), Handler)
            port = candidate
            break
        except OSError:
            continue
    if server is None:
        print(f"端口 {args.port}~{args.port + 11} 都被占用，无法启动")
        return 1

    host = "127.0.0.1" if args.host in ("0.0.0.0", "::") else args.host
    url = f"http://{host}:{port}/"
    print("=" * 58)
    print(" Mod 下载看板已启动")
    print(f" 本机访问：{url}")
    if args.host in ("0.0.0.0", "::"):
        print(f" 局域网访问：http://{_local_ip()}:{port}/")
    print(f" 数据目录：{PATHS.dest_root}")
    print(" Ctrl+C 停止")
    print("=" * 58)

    if not args.no_browser:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
