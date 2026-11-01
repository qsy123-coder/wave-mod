"""GameBanana 原图 + 附件本地化下载（本机运行）。

目录约定（图片和 Mod 附件**直接**落在当天的分发文件夹里，不再分
「原图 / Mod文件」子目录）：

    <dest_dir>/W-2026.10.30/<Mod名称>.jpg
    <dest_dir>/W-2026.10.30/<Mod名称>_2.jpg
    <dest_dir>/W-2026.10.30/<Mod名称>.rar

设计要点：
  - **日期取下载任务的执行日**，不是 Mod 的发布时间：关机期间发布的 Mod
    在开机下载那天归档（例：29 日发布、30 日才开机下载 → 进 W-2026.10.30）。
  - 当天的 `W-YYYY.MM.DD` 文件夹已存在（手工整理过）就直接复用，
    不存在才新建；图片和附件都放在文件夹根目录。
  - **原图**取 `_aPreviewMedia._aImages[]._sFile`（站点原始尺寸），
    不是 HTML 用的 530 缩略图。
  - 单图/单附件不加序号；多图/多附件按 `_1.._N` 编号。
  - 采集（15 分钟一次）只负责把新 Mod 写进队列，真正的下载由独立的
    计划任务 `GameBananaModDownload` 慢慢跑 —— 采集任务有 10 分钟执行
    上限，大文件会被强杀。
  - 队列持久化在 `state.gb_downloads.json`，关机/失败后下次自动续传。
"""

from __future__ import annotations

import html as html_mod
import json
import logging
import os
import re
import shutil
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, date
from pathlib import Path
from typing import Any, Iterable

import requests

from kekehxl_watcher.notify import Notifier

from .client import GameBananaClient
from .proxy import make_session

log = logging.getLogger("gamebanana.download")

STATE_VERSION = 1
CHUNK = 1 << 20                     # 1MB
GB = 1024 ** 3
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)

# Windows 保留设备名（不分大小写、带扩展名也算）
_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

# GameBanana 原图/附件接口里常见的扩展名，兜底用
_EXT_OK = re.compile(r"^[A-Za-z0-9]{1,8}$")


@dataclass
class DownloadSettings:
    enabled: bool = True
    dest_dir: str = ""                  # 分发根目录；空则退回 out_dir/subdir
    subdir: str = "下载"                # 仅 dest_dir 未配置时使用（兼容旧配置）
    folder_prefix: str = "W-"           # 日期文件夹前缀，与手工整理的 W-2026.10.30 一致
    images: bool = True
    files: bool = True
    min_free_gb: float = 3.0
    request_timeout: int = 120
    retry: int = 3
    delay_seconds: float = 1.0
    image_workers: int = 4
    max_run_minutes: int = 120
    state_file: str = "state.gb_downloads.json"
    proxy: str | None = None            # 由 poller.build() 探测后填入


# ---------------------------------------------------------------- 配置 / 状态


def load_settings(cfg) -> DownloadSettings:
    if not cfg.has_section("download"):
        return DownloadSettings()
    sec = cfg["download"]
    return DownloadSettings(
        enabled=sec.getboolean("enabled", True),
        dest_dir=sec.get("dest_dir", "").strip(),
        subdir=sec.get("subdir", "下载").strip() or "下载",
        folder_prefix=sec.get("folder_prefix", "W-").strip(),
        images=sec.getboolean("images", True),
        files=sec.getboolean("files", True),
        min_free_gb=sec.getfloat("min_free_gb", 3.0),
        request_timeout=sec.getint("request_timeout", 120),
        retry=sec.getint("retry", 3),
        delay_seconds=sec.getfloat("delay_seconds", 1.0),
        image_workers=max(1, sec.getint("image_workers", 4)),
        max_run_minutes=sec.getint("max_run_minutes", 120),
        state_file=sec.get("state_file", "state.gb_downloads.json").strip(),
    )


def _empty_state() -> dict[str, Any]:
    return {"version": STATE_VERSION, "items": {}, "paused": None}


def load_state(path: Path) -> dict[str, Any]:
    if not path.exists():
        return _empty_state()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as exc:
        log.warning("下载队列状态损坏，重建：%s", exc)
        return _empty_state()
    data.setdefault("items", {})
    data.setdefault("paused", None)
    return data


def _save_state(path: Path, state: dict[str, Any]) -> None:
    """原子写：先写 .tmp 再 os.replace，避免半截 JSON。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, path)


@contextmanager
def _state_lock(path: Path, timeout: float = 60.0):
    """跨进程锁：采集进程（入队）与下载进程（改状态）会同时碰这个文件。"""
    lock = path.with_suffix(path.suffix + ".lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.time() + timeout
    acquired = False
    while True:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode("ascii", "ignore"))
            os.close(fd)
            acquired = True
            break
        except FileExistsError:
            # 进程被强杀会留下锁，超过 5 分钟视为失效
            try:
                if time.time() - lock.stat().st_mtime > 300:
                    lock.unlink()
                    continue
            except FileNotFoundError:
                continue
            if time.time() > deadline:
                raise TimeoutError(f"等待下载队列锁超时：{lock}")
            time.sleep(0.5)
        except OSError:
            # 无权限创建锁时降级为不加锁（单进程场景仍可用）
            break
    try:
        yield
    finally:
        if acquired:
            try:
                lock.unlink()
            except OSError:
                pass


def update_state(path: Path, fn) -> Any:
    """加锁读-改-写。fn(state) 的返回值原样返回。"""
    with _state_lock(path):
        state = load_state(path)
        result = fn(state)
        _save_state(path, state)
        return result


# ---------------------------------------------------------------- 命名


def day_folder(date_str: str, prefix: str = "") -> str:
    """2026-10-24 → W-2026.10.24（与既有 W-YYYY.MM.DD 文件夹一致，月份补零避免排序错乱）。"""
    try:
        y, m, d = (int(x) for x in str(date_str).split("-"))
        return f"{prefix}{y}.{m:02d}.{d:02d}"
    except ValueError:
        return prefix + str(date_str).replace("-", ".")


def sanitize_name(name: str, budget: int = 100) -> str:
    """去掉 Windows 非法字符并控制长度。中英文都按字符计（MAX_PATH 论字符）。"""
    text = html_mod.unescape(str(name or ""))
    text = "".join(
        "_" if ch in '<>:"/\\|?*' or ord(ch) < 32 else ch
        for ch in text
    )
    text = re.sub(r"\s+", " ", text).strip(" .")
    if not text:
        text = "未命名"
    if text.split(".")[0].upper() in _RESERVED:
        text = "_" + text
    if len(text) > budget:
        text = text[:budget].rstrip(" .")
    return text or "未命名"


def _ext_of(filename: str, default: str = "") -> str:
    base = str(filename or "").split("?")[0].rsplit("/", 1)[-1]
    if "." in base:
        ext = base.rsplit(".", 1)[-1]
        if _EXT_OK.match(ext):
            return "." + ext
    return default


def _budget_for(dest_dir: Path, suffix_len: int) -> int:
    """给文件名留出长度预算，确保整条路径远小于 Windows 的 260 字符限制。"""
    reserve = 220 - len(str(dest_dir)) - 8 - suffix_len
    return max(24, min(100, reserve))


def _unique_base(base: str, mod_id: str, taken: set[str]) -> str:
    """同一天里两个 Mod 撞名时，给后来者加 (mod id) 后缀。"""
    if base not in taken:
        return base
    candidate = f"{base} (mod {mod_id})"
    if candidate in taken:
        candidate = f"{base} (mod {mod_id}-{int(time.time()) % 10000})"
    return candidate


# ---------------------------------------------------------------- 入队


def enqueue_rows(
    rows: Iterable[dict[str, str]],
    state_path: str | Path,
) -> int:
    """把本轮新发现的 Mod 写进下载队列（采集进程调用，只做入队不下载）。"""
    state_path = Path(state_path)
    entries = {}
    for row in rows:
        mid = str(row.get("mod_id", "") or "").strip()
        if not mid:
            continue
        entries[mid] = {
            "mod_id": mid,
            "name": (row.get("名称") or "").strip(),
            "date": (row.get("日期") or "").strip(),
            "page_url": (row.get("页面链接") or "").strip(),
            "status": "queued",
            "attempts": 0,
            "last_error": "",
            "created_at": datetime.now().isoformat(timespec="seconds"),
        }
    if not entries:
        return 0

    def mutate(state: dict[str, Any]) -> int:
        added = 0
        for mid, entry in entries.items():
            if mid in state["items"]:
                continue                       # 已入队，保留原进度
            state["items"][mid] = entry
            added += 1
        if added:
            state.pop("paused", None)          # 有新任务就解除「低磁盘暂停」标记
        return added

    return update_state(state_path, mutate)


# ---------------------------------------------------------------- 下载


class LowDisk(RuntimeError):
    """剩余空间不足，整轮停止。"""


def _free_gb(path: Path) -> float:
    try:
        return shutil.disk_usage(str(path)).free / GB
    except OSError:
        return 0.0


def _new_session(proxy: str | None) -> requests.Session:
    """显式设置代理，不读系统代理（注册表里的 https:// 写法会让 TLS 握手失败）。"""
    return make_session(proxy, _UA)


def _get(sess: requests.Session, url: str, **kwargs: Any) -> requests.Response:
    """代理挂了自动降级直连（下载会变慢，但不会中断）。"""
    try:
        return sess.get(url, **kwargs)
    except requests.exceptions.ProxyError as exc:
        if not sess.proxies:
            raise
        log.warning("代理不可用，改用直连：%s", str(exc)[:150])
        sess.proxies = {}
        return sess.get(url, **kwargs)


def _download_file(
    sess: requests.Session,
    url: str,
    dest: Path,
    *,
    expected_size: int | None,
    is_image: bool,
    page_url: str,
    timeout: int,
) -> bool:
    """下载到 .part 再改名。返回 True 表示这次真的下了，False 表示已存在跳过。

    附件支持断点续传：上一轮被计划任务强杀时留下的 `.part` 会用 Range 接着下。
    """
    if dest.exists():
        if expected_size is None:
            return False
        if abs(dest.stat().st_size - expected_size) <= 1024:
            return False
        dest.unlink(missing_ok=True)            # 大小对不上，重下

    tmp = dest.with_suffix(dest.suffix + ".part")
    headers = {"Referer": page_url} if page_url else {}

    resume_from = 0
    if expected_size and tmp.exists():
        have = tmp.stat().st_size
        if 0 < have < expected_size:
            resume_from = have
            headers["Range"] = f"bytes={have}-"
        else:
            tmp.unlink(missing_ok=True)
    elif tmp.exists():
        tmp.unlink(missing_ok=True)             # 图片不续传，残片直接丢

    with _get(sess, url, stream=True, timeout=(20, timeout), headers=headers) as resp:
        resp.raise_for_status()
        ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if is_image and not (ctype.startswith("image/") or ctype.startswith("video/")):
            raise RuntimeError(f"返回的不是图片（Content-Type={ctype or '空'}）")
        # 服务器不认 Range 会回 200，此时从头写
        mode = "ab" if resume_from and resp.status_code == 206 else "wb"
        if mode == "wb":
            resume_from = 0
        written = resume_from
        with tmp.open(mode) as fh:
            for chunk in resp.iter_content(CHUNK):
                if chunk:
                    fh.write(chunk)
                    written += len(chunk)
    if expected_size and abs(written - expected_size) > 1024:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"大小不符：期望 {expected_size}，实际 {written}（可能被登录墙拦截）")
    os.replace(tmp, dest)
    return True


def _download_image_worker(
    url: str,
    dest: Path,
    page_url: str,
    timeout: int,
    delay: float,
    proxy: str | None,
) -> bool:
    """单张原图下载（多线程用，独立 session 保证线程安全）。"""
    sess = _new_session(proxy)
    try:
        return _download_file(
            sess, url, dest,
            expected_size=None, is_image=True,
            page_url=page_url, timeout=timeout,
        )
    finally:
        if delay > 0:
            time.sleep(delay)


def _image_url(img: dict[str, Any]) -> tuple[str, str]:
    """返回 (原图 URL, 原图文件名)。只认 `_sFile`（原图），没有就放弃。"""
    name = str(img.get("_sFile") or "").strip()
    base = str(img.get("_sBaseUrl") or "").rstrip("/")
    if not name or not base:
        return "", ""
    safe = urllib.parse.quote(name, safe="")
    return f"{base}/{safe}", name


def _plan_item(
    client: GameBananaClient,
    entry: dict[str, Any],
    day_dir: Path,
    taken_img: set[str],
    taken_file: set[str],
    settings: DownloadSettings,
) -> None:
    """拉 ProfilePage，决定每个原图/附件存成什么名字。只规划，不下载。"""
    mid = entry["mod_id"]
    detail = client.mod_profile(mid)
    if detail.get("_bIsWithheld") or detail.get("_bIsTrashed"):
        entry["status"] = "skipped"
        entry["last_error"] = "站点已下架/隐藏（withheld）"
        return

    name = (detail.get("_sName") or entry.get("name") or "").strip()
    entry["name"] = html_mod.unescape(name)
    entry["page_url"] = detail.get("_sProfileUrl") or entry.get("page_url") or ""

    images: list[dict[str, Any]] = []
    if settings.images:
        for img in ((detail.get("_aPreviewMedia") or {}).get("_aImages") or []):
            url, fname = _image_url(img)
            if not url:
                continue
            images.append({"url": url, "src": fname, "status": "pending", "size": 0})

    files: list[dict[str, Any]] = []
    if settings.files:
        for f in (detail.get("_aFiles") or []):
            url = str(f.get("_sDownloadUrl") or "").strip()
            if not url:
                continue
            files.append({
                "url": url,
                "src": str(f.get("_sFile") or ""),
                "status": "pending",
                "size": int(f.get("_nFilesize") or 0),
            })

    img_dir = day_dir
    file_dir = day_dir

    if images:
        n = len(images)
        suffix_len = 0 if n == 1 else len(f"_{n}")
        base = sanitize_name(entry["name"], _budget_for(img_dir, suffix_len))
        base = _unique_base(base, mid, taken_img)
        taken_img.add(base)
        entry["image_base"] = base
        for idx, img in enumerate(images):
            ext = _ext_of(img["src"], ".jpg")
            suffix = "" if n == 1 else f"_{idx + 1}"
            img["file"] = f"{base}{suffix}{ext}"

    if files:
        n = len(files)
        suffix_len = 0 if n == 1 else len(f"_{n}")
        base = sanitize_name(entry["name"], _budget_for(file_dir, suffix_len))
        base = _unique_base(base, mid, taken_file)
        taken_file.add(base)
        entry["file_base"] = base
        for idx, f in enumerate(files):
            ext = _ext_of(f["src"], ".bin")
            suffix = "" if n == 1 else f"_{idx + 1}"
            f["file"] = f"{base}{suffix}{ext}"

    entry["images"] = images
    entry["files"] = files
    entry["planned"] = True
    entry["status"] = "pending" if (images or files) else "done"


def _apply_state(path: Path, mid: str, entry: dict[str, Any], fn) -> None:
    """把 entry 的改动写回队列（加锁）。"""
    def mutate(state: dict[str, Any]) -> None:
        stored = state["items"].get(mid)
        if stored is None:
            return
        fn(stored)
        # 规划结果由调用方持有，这里整体覆盖（保留 queued 期间的元数据）
        stored.clear()
        stored.update(entry)
    update_state(path, mutate)


def _taken_bases(state: dict[str, Any]) -> dict[str, dict[str, set[str]]]:
    """按天收集已被占用的文件名（防止同一天两个 Mod 撞名）。"""
    taken: dict[str, dict[str, set[str]]] = {}
    for item in state["items"].values():
        day = item.get("day") or item.get("date") or ""
        slot = taken.setdefault(day, {"img": set(), "file": set()})
        if item.get("image_base"):
            slot["img"].add(item["image_base"])
        if item.get("file_base"):
            slot["file"].add(item["file_base"])
    return taken


def process_queue(
    client: GameBananaClient,
    settings: DownloadSettings,
    state_path: Path,
    out_dir: Path,
    notifier: Notifier,
    *,
    max_items: int | None = None,
) -> dict[str, int]:
    """处理队列里所有未完成的 Mod。返回统计。

    `out_dir` 传**来源目录**（`_Mod每日汇总/GameBanana`），不要再拼来源名。
    """
    state_path = Path(state_path)
    out_dir = Path(out_dir)
    # 图片/附件写到分发目录（A_每日更新\W-YYYY.MM.DD\<来源>\）；
    # 没配 dest_dir 时退回旧布局（out_dir 本身就是来源目录，不再套一层）。
    dest_root = Path(settings.dest_dir) if settings.dest_dir else out_dir / settings.subdir
    source_dir = out_dir.name if settings.dest_dir else ""
    run_day = date.today()              # 本轮执行日：整轮（含跨午夜）统一用它归档
    stats = {"planned": 0, "images": 0, "files": 0, "done": 0, "failed": 0, "skipped": 0}

    state = load_state(state_path)
    paused = state.get("paused") or {}
    if paused.get("reason") == "low_disk":
        # 上次因空间不足暂停；这次先复查空间
        if _free_gb(dest_root) < settings.min_free_gb:
            log.warning("磁盘仍不足（%.1fGB），继续暂停下载", _free_gb(dest_root))
            return stats
        _clear_paused(state_path)              # 空间够了，恢复下载

    pending = [
        item for item in state["items"].values()
        if item.get("status") in ("queued", "pending", "partial")
    ]
    pending.sort(key=lambda e: (e.get("date") or "", e.get("created_at") or ""))
    if max_items is not None:
        pending = pending[:max_items]
    if not pending:
        log.info("下载队列为空")
        return stats

    log.info("待处理 %d 个 Mod（%s）", len(pending),
             f"代理 {settings.proxy}" if settings.proxy else "直连")
    deadline = time.time() + settings.max_run_minutes * 60
    # 下载用独立 session：client.session 带 Accept: application/json，不合适
    sess = _new_session(settings.proxy)
    taken = _taken_bases(state)
    alerted = 0
    low_disk = False

    for entry in pending:
        if time.time() > deadline:
            log.warning("本轮达到 max_run_minutes=%d，剩余留到下次", settings.max_run_minutes)
            break
        mid = entry["mod_id"]
        # 日期按「下载执行日」归档，不是 Mod 发布时间。第一次处理时写进队列并
        # 持久化，后续断点续传/重试都落回同一天；当天文件夹已存在就直接复用。
        if not entry.get("day"):
            entry["day"] = run_day.isoformat()
        day_key = entry["day"]
        day_dir = dest_root / day_folder(day_key, settings.folder_prefix)
        if source_dir:
            day_dir = day_dir / source_dir
        img_dir = file_dir = day_dir

        # 规划（拉 ProfilePage 拿原图/附件清单）
        if not entry.get("planned"):
            try:
                slot = taken.setdefault(day_key, {"img": set(), "file": set()})
                slot["img"].discard(entry.get("image_base") or "")
                slot["file"].discard(entry.get("file_base") or "")
                _plan_item(client, entry, day_dir, slot["img"], slot["file"], settings)
                stats["planned"] += 1
                _apply_state(state_path, mid, entry, lambda e: None)
                time.sleep(settings.delay_seconds)
            except LowDisk:
                low_disk = True
                break
            except Exception as exc:  # noqa: BLE001
                entry["attempts"] = int(entry.get("attempts") or 0) + 1
                entry["last_error"] = f"规划失败：{exc}"
                entry["status"] = "failed" if entry["attempts"] >= settings.retry else "partial"
                _apply_state(state_path, mid, entry, lambda e: None)
                stats["failed"] += 1
                log.warning("Mod %s 规划失败：%s", mid, exc)
                if alerted < 3:
                    _maybe_alert(notifier, entry)
                    alerted += 1
                continue

        if entry.get("status") in ("done", "skipped"):
            continue

        # 真有东西要下才建文件夹（下架/隐藏的 Mod 不会留下空目录）；
        # 当天目录已存在时 exist_ok 直接复用，与手工整理的文件夹共存。
        day_dir.mkdir(parents=True, exist_ok=True)

        # 下载图片：多线程。本机到 GameBanana 直连实测单线程只有 20~80KB/s，
        # 一个 Mod 动辄十几二十张图，串行会把整轮拖到几十分钟。
        pending_imgs = [x for x in (entry.get("images") or []) if x.get("status") != "done"]
        if pending_imgs:
            workers = max(1, min(settings.image_workers, len(pending_imgs)))
            futures = {}
            with ThreadPoolExecutor(max_workers=workers) as ex:
                for img in pending_imgs:
                    if _free_gb(dest_root) < settings.min_free_gb:
                        low_disk = True
                        break
                    fut = ex.submit(
                        _download_image_worker,
                        img["url"],
                        img_dir / img["file"],
                        entry.get("page_url", ""),
                        settings.request_timeout,
                        settings.delay_seconds,
                        settings.proxy,
                    )
                    futures[fut] = img
                for fut in as_completed(futures):
                    img = futures[fut]
                    try:
                        if fut.result():
                            stats["images"] += 1
                        img["status"] = "done"
                        img.pop("error", None)
                    except Exception as exc:  # noqa: BLE001
                        img["status"] = "failed"
                        img["error"] = str(exc)[:200]
                        log.warning("图片下载失败 %s/%s：%s", mid, img.get("file"), exc)
        if low_disk:
            break

        # 下载附件
        for f in entry.get("files") or []:
            if f.get("status") == "done":
                continue
            dest = file_dir / f["file"]
            need = (f.get("size") or 0) / GB
            if _free_gb(dest_root) < settings.min_free_gb + need:
                low_disk = True
                break
            try:
                fresh = _download_file(
                    sess, f["url"], dest,
                    expected_size=f.get("size") or None, is_image=False,
                    page_url=entry.get("page_url", ""),
                    timeout=settings.request_timeout,
                )
                f["status"] = "done"
                if fresh:
                    stats["files"] += 1
                time.sleep(settings.delay_seconds)
            except Exception as exc:  # noqa: BLE001
                f["status"] = "failed"
                f["error"] = str(exc)[:200]
                log.warning("附件下载失败 %s/%s：%s", mid, f.get("file"), exc)
        if low_disk:
            break

        all_items = (entry.get("images") or []) + (entry.get("files") or [])
        failed = [x for x in all_items if x.get("status") != "done"]
        if not failed:
            entry["status"] = "done"
            entry["last_error"] = ""
            stats["done"] += 1
            log.info("Mod %s 下载完成：%d 图 / %d 附件", mid,
                     len(entry.get("images") or []), len(entry.get("files") or []))
        else:
            entry["attempts"] = int(entry.get("attempts") or 0) + 1
            errors = [f"{x.get('file')}: {x.get('error', '')}" for x in failed[:3]]
            entry["last_error"] = "；".join(errors)[:300]
            if entry["attempts"] >= settings.retry:
                entry["status"] = "failed"
                stats["failed"] += 1
                if alerted < 3:                 # 风控/断网时别刷屏
                    _maybe_alert(notifier, entry)
                    alerted += 1
            else:
                entry["status"] = "partial"
            log.warning("Mod %s 有 %d 项失败（第 %d 次）", mid, len(failed), entry["attempts"])
        _apply_state(state_path, mid, entry, lambda e: None)

    if low_disk:
        paused = {"reason": "low_disk", "at": datetime.now().isoformat(timespec="seconds")}
        free = _free_gb(dest_root)
        log.error("磁盘剩余 %.1fGB，低于阈值 %.1fGB，暂停下载", free, settings.min_free_gb)
        _set_paused(state_path, paused)
        _notify_low_disk(state_path, notifier, free, settings.min_free_gb)
    else:
        _clear_paused(state_path)

    log.info(
        "本轮下载：新增图片 %d 张、附件 %d 个，完成 %d 个 Mod，失败 %d 个",
        stats["images"], stats["files"], stats["done"], stats["failed"],
    )
    return stats


def _set_paused(state_path: Path, paused: dict[str, Any]) -> None:
    def mutate(state: dict[str, Any]) -> None:
        state["paused"] = paused
    update_state(state_path, mutate)


def _clear_paused(state_path: Path) -> None:
    """本轮跑通就清掉「低磁盘暂停」标记（空间可能已经被清理）。"""
    def mutate(state: dict[str, Any]) -> None:
        if (state.get("paused") or {}).get("reason") == "low_disk":
            state["paused"] = None
    update_state(state_path, mutate)


def _notify_low_disk(state_path: Path, notifier: Notifier, free: float, threshold: float) -> None:
    """同一天只提醒一次，避免每 30 分钟弹一次。"""
    today = date.today().isoformat()

    def mutate(state: dict[str, Any]) -> bool:
        if (state.get("paused") or {}).get("notified_on") == today:
            return False
        state.setdefault("paused", {})["notified_on"] = today
        return True

    if update_state(state_path, mutate):
        notifier.send_alert(
            "磁盘空间不足，已暂停下载 GameBanana Mod",
            f"剩余 {free:.1f}GB，低于阈值 {threshold:.1f}GB。\n"
            "清理磁盘后下一轮会自动继续，无需手动操作。",
        )


def _maybe_alert(notifier: Notifier, entry: dict[str, Any]) -> None:
    if entry.get("alerted"):
        return
    entry["alerted"] = True
    notifier.send_alert(
        "GameBanana Mod 下载失败",
        f"**{entry.get('name') or entry.get('mod_id')}**\n"
        f"页面：{entry.get('page_url', '')}\n"
        f"原因：{entry.get('last_error', '')}\n"
        "已重试到上限，需要手动处理（重新入队：删掉 state.gb_downloads.json 里该条）。",
    )
