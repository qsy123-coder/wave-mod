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
from datetime import datetime, date, timedelta
from pathlib import Path
from typing import Any, Iterable

import requests

from kekehxl_watcher.notify import Notifier

from .client import GameBananaClient
from .parser import preview_images
from .proxy import make_session

log = logging.getLogger("gamebanana.download")

STATE_VERSION = 1
CHUNK = 1 << 20                     # 1MB
# 下载读超时：代理节点偶尔「连上但不来数据」，120 秒会让整个任务卡两分钟。
READ_TIMEOUT = 30
# GameBanana 的 filecache CDN 按连接限速（实测单连接 ~35–50KB/s，而代理本身
# 到 Cloudflare 有 2.9MB/s），所以只要文件够大就用多连接分段。实测 4 条连接
# 可以叠加到 ~200KB/s；再多容易被 CDN 拒绝，保持 4 条。
# 阈值从 32MB 降到 4MB：以前 12MB 的附件只开 1 条连接，慢到没法看。
SEGMENT_MIN_BYTES = 4 << 20
SEGMENT_WORKERS = 4
SEGMENT_CHUNK = 3 << 20      # 每段至少 3MB；12MB 文件 → 4 段
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
    # 达到 retry 后标记为 failed，但仍会自动重试 auto_retry_rounds 轮；
    # 每轮间隔从 retry_backoff_minutes 起指数增长，封顶 retry_backoff_max_minutes。
    auto_retry_rounds: int = 5
    retry_backoff_minutes: float = 15.0
    retry_backoff_max_minutes: float = 240.0
    delay_seconds: float = 1.0
    image_workers: int = 4
    max_run_minutes: int = 120
    # 下载前测当前节点吞吐，低于阈值就自动换节点。延迟低不代表下载快：
    # 实测香港节点 120ms 但只有 40–120KB/s，新加坡节点能到 3MB/s。
    auto_switch_slow: bool = True
    slow_threshold_kbps: int = 300
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
        retry=max(1, sec.getint("retry", 3)),
        auto_retry_rounds=max(0, sec.getint("auto_retry_rounds", 5)),
        retry_backoff_minutes=max(1.0, sec.getfloat("retry_backoff_minutes", 15.0)),
        retry_backoff_max_minutes=max(
            1.0, sec.getfloat("retry_backoff_max_minutes", 240.0)
        ),
        delay_seconds=sec.getfloat("delay_seconds", 1.0),
        image_workers=max(1, sec.getint("image_workers", 4)),
        max_run_minutes=sec.getint("max_run_minutes", 120),
        auto_switch_slow=sec.getboolean("auto_switch_slow", True),
        slow_threshold_kbps=max(50, sec.getint("slow_threshold_kbps", 300)),
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


def requeue_updates(mod_ids: Iterable[str], state_path: str | Path) -> list[str]:
    """把「发现新文件」的老 Mod 重新排队，按本次执行日重新规划/下载。

    与 enqueue_rows 的区别：这些 mod_id 已经在队列里，不能因为"已存在"跳过。
    重新规划会重建文件列表，旧版本文件留在原来的日期文件夹里，不覆盖、不删除。
    """
    state_path = Path(state_path)
    ids = [str(x) for x in mod_ids if x]
    if not ids:
        return []

    def mutate(state: dict[str, Any]) -> list[str]:
        changed: list[str] = []
        day = date.today().isoformat()
        for mid in ids:
            entry = state["items"].get(mid)
            if entry is None:
                continue
            entry["status"] = "queued"
            entry["planned"] = False
            entry["attempts"] = 0
            entry["last_error"] = ""
            entry["day"] = day
            entry["update_at"] = datetime.now().isoformat(timespec="seconds")
            entry.pop("retry_after", None)
            entry.pop("retry_exhausted", None)
            # 丢掉旧规划（文件名/下载状态），让 _plan_item 按新版本重新算
            for key in ("images", "files", "image_base", "file_base", "planned"):
                entry.pop(key, None)
            entry["planned"] = False
            changed.append(mid)
        if changed:
            state.pop("paused", None)
        return changed

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


_PROBE_URL = "https://gamebanana.com/"


def _repair_transport(sess: requests.Session) -> bool:
    """代理连接失败时先自动换 Clash 节点，换不了再降级直连。

    Clash 节点死掉时表现为 TLS 握手失败（SSLError），而不是 ProxyError。
    换节点成功时 session 继续走同一个本地代理端口，只是出口换了；
    只有换节点也失败、且直连实测可用时，才把 session 切成直连。
    """
    if not sess.proxies:
        return False
    proxy_url = str(sess.proxies.get("https") or sess.proxies.get("http") or "")
    if proxy_url:
        try:
            from .clash import switch_to_working_node

            result = switch_to_working_node([_PROBE_URL], proxy_url=proxy_url)
            if result.get("ok"):
                log.warning(
                    "代理节点失效，已自动切换：%s → %s",
                    result.get("previous") or "—", result.get("node"),
                )
                return True
            log.warning("自动换节点未成功：%s", result.get("error") or "")
        except Exception as exc:  # noqa: BLE001 - 换节点不可用不致命
            log.warning("自动换节点不可用：%s", exc)
    try:
        from .proxy import https_alive

        if not https_alive(None, _PROBE_URL, timeout=10.0, max_status=400):
            return False
    except Exception:  # noqa: BLE001 - 探活失败不致命
        return False
    log.warning("代理连接失败，直连实测可用，本次运行改走直连")
    sess.proxies = {}
    return True


def _get(sess: requests.Session, url: str, **kwargs: Any) -> requests.Response:
    """代理挂了自动降级直连（下载会变慢，但不会中断）。"""
    try:
        return sess.get(url, **kwargs)
    except (
        requests.exceptions.ProxyError,
        requests.exceptions.SSLError,
    ) as exc:
        if not _repair_transport(sess):
            raise
        log.warning("代理连接已恢复（换节点或直连）：%s", str(exc)[:150])
        return sess.get(url, **kwargs)


def _download_segmented(
    sess: requests.Session,
    url: str,
    dest: Path,
    expected_size: int,
    page_url: str,
    timeout: int,
    tries: int = 4,
    workers: int = SEGMENT_WORKERS,
) -> bool:
    """大附件多连接分段下载：每条连接只拉一段，卡住的连接由其他段填满。

    每段单独写 ``.part.segN``，失败后保留，下次从该段断点续传；全部完成后
    拼成 ``.part`` 再改名。服务端不认 Range（回 200 整包）时按偏移丢弃前缀。
    """
    tmp = dest.with_suffix(dest.suffix + ".part")
    base_headers = {"Referer": page_url} if page_url else {}
    proxy = sess.proxies.get("https") or sess.proxies.get("http")
    workers = max(1, min(workers, expected_size // SEGMENT_CHUNK or 1))
    chunk = (expected_size + workers - 1) // workers
    ranges = []
    for i in range(workers):
        start = i * chunk
        end = min(start + chunk, expected_size) - 1
        if start <= end:
            ranges.append((i, start, end))

    def _one(rng: tuple[int, int, int]) -> Path:
        idx, start, end = rng
        want = end - start + 1
        part = dest.with_suffix(dest.suffix + f".part.seg{idx}")
        attempt = 0
        switched = False
        http = _new_session(proxy)
        while True:
            have = part.stat().st_size if part.exists() else 0
            if have > want:
                part.unlink(missing_ok=True)
                have = 0
            if have == want:
                return part
            headers = dict(base_headers)
            headers["Accept-Encoding"] = "identity"
            headers["Range"] = f"bytes={start + have}-{end}"
            try:
                with http.get(
                    url, stream=True,
                    timeout=(20, min(timeout, READ_TIMEOUT)),
                    headers=headers,
                ) as resp:
                    resp.raise_for_status()
                    if have and resp.status_code == 206:
                        mode = "ab"
                        written = have
                        skip = 0
                    else:
                        mode = "wb"
                        written = 0
                        skip = start if resp.status_code == 200 else 0
                    with part.open(mode) as fh:
                        for piece in resp.iter_content(CHUNK):
                            if not piece:
                                continue
                            if skip:
                                if len(piece) <= skip:
                                    skip -= len(piece)
                                    continue
                                piece = piece[skip:]
                                skip = 0
                            room = want - written
                            if room <= 0:
                                break
                            if len(piece) > room:
                                piece = piece[:room]
                            fh.write(piece)
                            written += len(piece)
                if part.stat().st_size != want:
                    raise RuntimeError(
                        f"分段 {idx} 大小不符：{part.stat().st_size}/{want}"
                    )
                return part
            except (
                requests.ConnectionError,
                requests.Timeout,
                requests.exceptions.ChunkedEncodingError,
                requests.exceptions.ContentDecodingError,
                OSError,
            ) as exc:
                attempt += 1
                # 死节点/死连接：换一次节点，后续分段会跟着新出口走
                if (
                    isinstance(
                        exc,
                        (
                            requests.ConnectionError,
                            requests.Timeout,
                            requests.exceptions.ChunkedEncodingError,
                        ),
                    )
                    and not switched
                    and _repair_transport(http)
                ):
                    switched = True
                    attempt = 0
                    continue
                if attempt >= tries:
                    raise
                wait = min(2 * attempt, 10)
                log.warning(
                    "附件分段 %d 中断，%ds 后续传（%s，第 %d/%d 次）：%s",
                    idx, wait, dest.name, attempt, tries, str(exc)[:120],
                )
                time.sleep(wait)

    with ThreadPoolExecutor(max_workers=len(ranges)) as ex:
        parts = list(ex.map(_one, ranges))
    with tmp.open("wb") as out:
        for part in parts:
            with part.open("rb") as fh:
                shutil.copyfileobj(fh, out, CHUNK)
    got = tmp.stat().st_size
    if abs(got - expected_size) > 1024:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(f"大小不符：期望 {expected_size}，实际 {got}")
    for part in parts:
        part.unlink(missing_ok=True)
    os.replace(tmp, dest)
    return True


def _download_file(
    sess: requests.Session,
    url: str,
    dest: Path,
    *,
    expected_size: int | None,
    is_image: bool,
    page_url: str,
    timeout: int,
    tries: int = 4,
) -> bool:
    """下载到 .part 再改名。返回 True 表示这次真的下了，False 表示已存在跳过。

    附件支持断点续传：上一轮被计划任务强杀/梯子掉线时留下的 `.part`
    会用 Range 接着下；本轮连接再断就继续从最新断点重试，不会因为一次
    `IncompleteRead` 就让整个大文件失败、白等到下一轮计划任务。
    """
    if dest.exists():
        if expected_size is None:
            return False
        if abs(dest.stat().st_size - expected_size) <= 1024:
            return False
        dest.unlink(missing_ok=True)            # 大小对不上，重下

    # 大附件走多连接分段；已有 .part 的（上一轮单连接留下的）继续走单连接续传，
    # 避免把两种临时文件混在一起。
    if (
        not is_image
        and expected_size
        and expected_size >= SEGMENT_MIN_BYTES
        and not dest.with_suffix(dest.suffix + ".part").exists()
    ):
        return _download_segmented(
            sess, url, dest, expected_size, page_url, timeout, tries,
        )

    tmp = dest.with_suffix(dest.suffix + ".part")
    written = 0
    attempt = 0
    rate_attempt = 0          # 429/503 单独计数，不消耗网络重试次数
    switched = False          # 一次下载最多换一次节点，避免来回跳
    while True:
        headers = {"Referer": page_url} if page_url else {}
        resume_from = 0
        if not is_image and expected_size and tmp.exists():
            have = tmp.stat().st_size
            if 0 < have < expected_size:
                resume_from = have
                headers["Range"] = f"bytes={have}-"
            else:
                tmp.unlink(missing_ok=True)
        elif tmp.exists():
            tmp.unlink(missing_ok=True)         # 图片不续传，残片直接丢

        try:
            with _get(
                sess, url, stream=True,
                timeout=(20, min(timeout, READ_TIMEOUT)), headers=headers,
            ) as resp:
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
            break
        except requests.HTTPError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status not in (429, 503):
                raise
            rate_attempt += 1
            if rate_attempt > 3:
                raise
            after = 0
            try:
                after = int(exc.response.headers.get("Retry-After") or 0)
            except (TypeError, ValueError):
                after = 0
            wait = min(max(after, 2 * rate_attempt), 30)
            log.warning("被限流（HTTP %s），%ds 后重试（%s）", status, wait, dest.name)
            time.sleep(wait)
            continue
        except (
            requests.ConnectionError,
            requests.Timeout,
            requests.exceptions.ChunkedEncodingError,
            requests.exceptions.ContentDecodingError,
        ) as exc:
            # 梯子节点抽风是常态；保留 .part，从断点重试几次再放弃。
            # 读超时（连上了但一直没数据）同样视为节点问题，换一次节点再续传。
            attempt += 1
            if (
                isinstance(
                    exc,
                    (
                        requests.ConnectionError,
                        requests.Timeout,
                        requests.exceptions.ChunkedEncodingError,
                    ),
                )
                and not switched
                and _repair_transport(sess)
            ):
                # 确认是代理问题：直连从当前断点再来，不消耗重试次数
                switched = True
                attempt = 0
                continue
            if attempt >= tries:
                raise
            wait = min(2 * attempt, 10)
            wrote = tmp.stat().st_size if tmp.exists() else 0
            log.warning(
                "下载中断，%ds 后从 %d 字节续传（%s，第 %d/%d 次）：%s",
                wait, wrote, dest.name, attempt, tries, str(exc)[:120],
            )
            time.sleep(wait)

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
        # apiv13 的预览图在 `_aPreviewContent.screenshots`，不是 `_aPreviewMedia`
        for img in preview_images(detail):
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


# ---------------------------------------------------------------- 自动重试


def _max_attempts(settings: DownloadSettings) -> int:
    return max(1, settings.retry) + max(0, settings.auto_retry_rounds)


def _retry_due(entry: dict[str, Any]) -> bool:
    raw = str(entry.get("retry_after") or "").strip()
    if not raw:
        return False
    try:
        return datetime.fromisoformat(raw).timestamp() <= time.time()
    except ValueError:
        return True


def _schedule_retry(entry: dict[str, Any], settings: DownloadSettings) -> None:
    """达到失败阈值后排下一轮自动重试；用尽后保持 failed 等手动重试。"""
    attempts = int(entry.get("attempts") or 0)
    if attempts < max(1, settings.retry):
        return
    limit = _max_attempts(settings)
    if attempts >= limit:
        entry.pop("retry_after", None)
        entry["retry_exhausted"] = True
        return
    rounds = max(0, attempts - max(1, settings.retry))
    delay = min(
        settings.retry_backoff_minutes * (2 ** rounds),
        settings.retry_backoff_max_minutes,
    )
    entry["retry_after"] = (
        datetime.now() + timedelta(minutes=delay)
    ).isoformat(timespec="seconds")
    entry.pop("retry_exhausted", None)


def _clear_retry(entry: dict[str, Any]) -> None:
    entry.pop("retry_after", None)
    entry.pop("retry_exhausted", None)


def _select_pending(
    state: dict[str, Any], settings: DownloadSettings
) -> tuple[list[dict[str, Any]], int]:
    """排队条目 + 到点的失败条目。返回 (待处理, 还没到重试时间的条数)。"""
    pending: list[dict[str, Any]] = []
    waiting = 0
    for item in state["items"].values():
        status = str(item.get("status") or "")
        if status in ("queued", "pending", "partial"):
            pending.append(item)
        elif status == "failed":
            attempts = int(item.get("attempts") or 0)
            if attempts >= _max_attempts(settings):
                continue                   # 自动重试已用尽，等手动重试
            if item.get("retry_after"):
                if _retry_due(item):
                    pending.append(item)
                else:
                    waiting += 1
    return pending, waiting


# ---------------------------------------------------------------- 运行锁


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


def _run_lock_path(state_path: Path) -> Path:
    return state_path.with_suffix(state_path.suffix + ".run.lock")


def _acquire_run_lock(state_path: Path, stale_seconds: float = 6 * 3600) -> Path | None:
    """和 arca 下载器一样的跨进程运行锁；看板据此判断是否真的有下载进程。"""
    lock = _run_lock_path(state_path)
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode("ascii", "ignore"))
        os.close(fd)
        return lock
    except FileExistsError:
        try:
            raw = lock.read_text(encoding="ascii", errors="ignore").strip()
            pid = int(raw) if raw.isdigit() else 0
            if not _pid_alive(pid) or time.time() - lock.stat().st_mtime > stale_seconds:
                lock.unlink()
                return _acquire_run_lock(state_path, stale_seconds)
        except (OSError, ValueError):
            pass
        return None
    except OSError:
        return None


def _release_run_lock(lock: Path | None) -> None:
    if lock is None:
        return
    try:
        lock.unlink()
    except OSError:
        pass


def _ensure_fast_proxy(state: dict[str, Any], settings: DownloadSettings) -> None:
    """下载前按**真实吞吐**挑节点。

    延迟低不代表下载快：实测香港节点 120ms 但持续下载只有 40–120KB/s，
    新加坡节点能到 3MB/s。只有当前节点低于阈值时才去测其他节点。
    """
    if not settings.proxy or not settings.auto_switch_slow:
        return
    probe = ""
    items = list((state.get("items") or {}).values())
    # 优先用还没下完的条目的文件 URL 当探针，别拿很久以前可能已失效的链接
    items.sort(key=lambda it: 0 if it.get("status") in ("pending", "partial", "queued", "failed") else 1)
    for item in items:
        for f in item.get("files") or []:
            url = str(f.get("url") or "")
            if url.startswith("http"):
                probe = url
                break
        if probe:
            break
    if not probe:
        return
    try:
        from .clash import ensure_fast_node

        ensure_fast_node(
            settings.proxy,
            probe,
            min_kbps=settings.slow_threshold_kbps,
        )
    except Exception as exc:  # noqa: BLE001 - 测速/换节点失败不影响下载
        log.warning("下载前节点测速失败（不影响下载）：%s", exc)


def process_queue(
    client: GameBananaClient,
    settings: DownloadSettings,
    state_path: Path,
    out_dir: Path,
    notifier: Notifier,
    *,
    max_items: int | None = None,
) -> dict[str, int]:
    """处理队列；同一时间只允许一个下载进程（计划任务 + 看板重试可能并发）。"""
    state_path = Path(state_path)
    lock = _acquire_run_lock(state_path)
    if _run_lock_path(state_path).exists() and lock is None:
        log.warning("已有一个 GameBanana 下载进程在跑，本轮跳过")
        return {"planned": 0, "images": 0, "files": 0, "done": 0,
                "failed": 0, "skipped": 0}
    try:
        return _process_queue_inner(
            client, settings, state_path, out_dir, notifier, max_items=max_items
        )
    finally:
        _release_run_lock(lock)


def _process_queue_inner(
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

    pending, waiting_retry = _select_pending(state, settings)
    pending.sort(key=lambda e: (e.get("date") or "", e.get("created_at") or ""))
    if max_items is not None:
        pending = pending[:max_items]
    if waiting_retry:
        log.info("%d 个失败条目还没到自动重试时间", waiting_retry)
    if not pending:
        log.info("下载队列为空")
        return stats

    # 有活干才测速，避免空跑时折腾用户的代理节点
    _ensure_fast_proxy(state, settings)

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
                _clear_retry(entry)
                stats["planned"] += 1
                _apply_state(state_path, mid, entry, lambda e: None)
                time.sleep(settings.delay_seconds)
            except LowDisk:
                low_disk = True
                break
            except Exception as exc:  # noqa: BLE001
                entry["attempts"] = int(entry.get("attempts") or 0) + 1
                entry["last_error"] = f"规划失败：{exc}"
                if entry["attempts"] >= settings.retry:
                    entry["status"] = "failed"
                    _schedule_retry(entry, settings)
                    stats["failed"] += 1
                    if entry.get("retry_exhausted"):
                        _maybe_alert(notifier, entry, final=True)
                    elif alerted < 3:
                        _maybe_alert(notifier, entry)
                        alerted += 1
                else:
                    entry["status"] = "partial"
                    _clear_retry(entry)
                _apply_state(state_path, mid, entry, lambda e: None)
                log.warning("Mod %s 规划失败：%s", mid, exc)
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
            _clear_retry(entry)
            entry.pop("alerted", None)
            entry.pop("alerted_final", None)
            stats["done"] += 1
            log.info("Mod %s 下载完成：%d 图 / %d 附件", mid,
                     len(entry.get("images") or []), len(entry.get("files") or []))
        else:
            entry["attempts"] = int(entry.get("attempts") or 0) + 1
            errors = [f"{x.get('file')}: {x.get('error', '')}" for x in failed[:3]]
            entry["last_error"] = "；".join(errors)[:300]
            if entry["attempts"] >= settings.retry:
                entry["status"] = "failed"
                _schedule_retry(entry, settings)
                stats["failed"] += 1
                if entry.get("retry_exhausted"):
                    log.warning(
                        "Mod %s 自动重试已用尽（共 %d 次），需要手动重试",
                        mid, entry["attempts"],
                    )
                    _maybe_alert(notifier, entry, final=True)
                else:
                    log.warning(
                        "Mod %s 第 %d 次失败，将在 %s 自动重试",
                        mid, entry["attempts"], entry.get("retry_after", ""),
                    )
                    if alerted < 3:             # 风控/断网时别刷屏
                        _maybe_alert(notifier, entry)
                        alerted += 1
            else:
                entry["status"] = "partial"
                _clear_retry(entry)
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


def _maybe_alert(
    notifier: Notifier, entry: dict[str, Any], *, final: bool = False
) -> None:
    key = "alerted_final" if final else "alerted"
    if entry.get(key):
        return
    entry[key] = True
    if final:
        title = "GameBanana Mod 自动重试已用尽"
        tail = "已自动重试多轮仍失败。打开看板点「重试」，或先检查 Clash 节点是否掉线。"
    else:
        title = "GameBanana Mod 下载失败"
        retry_at = entry.get("retry_after") or ""
        tail = f"已排入自动重试，下一次：{retry_at}。" if retry_at else "请打开看板点「重试」。"
    notifier.send_alert(
        title,
        f"**{entry.get('name') or entry.get('mod_id')}**\n"
        f"页面：{entry.get('page_url', '')}\n"
        f"原因：{entry.get('last_error', '')}\n"
        f"{tail}",
    )
