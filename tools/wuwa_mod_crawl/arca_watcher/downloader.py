"""arca.live 模组文件 + 原图本地化下载（本机 Windows 运行）。

与 GameBanana 的下载任务（``gamebanana_watcher/downloader.py``）保持同样的产物约定：
图片和 Mod 文件直接落在当天的分发目录，日期按**下载执行日**归档：

    <dest_dir>/W-2026.11.01/<标题>.png
    <dest_dir>/W-2026.11.01/<标题>_2.png
    <dest_dir>/W-2026.11.01/<标题>.zip              ← kio.ac 合集里的压缩包
    <dest_dir>/W-2026.11.01/<标题>/...              ← nahida.live 模组的目录树

数据来源是服务器 arca-watcher 归档、再由 ``sync.ps1`` 拉回本机的
``A_每日更新/_Mod每日汇总/arca.live/all_mods.csv``。

帖子页本身也受 Cloudflare 保护：纯 HTTP 会被 ``Just a moment...`` 拦住，
此时改用真实 Chrome（屏幕外的有头窗口，和 nahida 分享链接共用同一个进程）
打开页面再解析；正文图片走 ``ac-o.arca.live`` CDN，仍然是纯 HTTP。

支持的外链（2026-11 实测）：

  - ``kio.ac/c/<id>``
      Kiosk File Sharing 的密码合集。频道规矩见 arca 公告帖：
      「Channel standard password = Eldwh」。接口是 CBOR（``api.kio.ac/v0/...``），
      token 放 ``Kiosk-CAT`` 头，下载能力放 ``Kiosk-Download-Capability: cdn, edge``。
      文件按 16MiB 分段，每段给一个 CDN 预签名 URL。

  - ``nahida.live/akasha/mod/<id>``
      Nahida Drive 的模组页。GET ``api.nahida.live/akasha/mod/<id>?password=<b64url>``
      直接返回 x-token 和 collection 列表，密码同样用频道标准密码；随后用
      ``/akasha/mod/item/<id>`` 递归列目录、``/akasha/mod/file/download?...&presign=true``
      拿 S3 预签名直链。**不需要浏览器**。

  - ``nahida.live/akasha/link/<id>``
      分享链接，POST 时必须带 Cloudflare Turnstile 的 ``cftoken``。用真实 Chrome
      （有界面、不能用 headless）打开分享页，页面自己的 Turnstile 会自动通过；
      带密码的链接自动填频道共享密码。拿到 12 小时有效的 ``nhd-link-token`` 后，
      列目录 / 下载都走 API，不再需要浏览器。实现见 ``nahida_link.py``。
      链接失效或密码不对时仍记录为待手动。需要积分的模组一律不下载。

  - 「챈방주 내닉폴더에 있음」（频道 Mod 方舟）
      正文不挂外链、只指向频道公共方舟时，用 ``[download] ark_link`` 的
      分享链接拿到 token，按作者昵称定位方舟里的个人目录，再下载发帖日期
      前后新增的子目录。方舟根目录按平台 / 작가별 / 공용)챈 업로더 分层。

  - GameBanana 链接：由本机 GameBanana 任务负责，这里直接跳过。
  - 其他网盘/站外链接：记录为待手动。

待手动项会写进当天目录的 ``arca_需手动下载.txt`` 和 ``arca_需手动下载.html``
（后者可直接点链接），方便一次处理完。
"""

from __future__ import annotations

import base64
import copy
import html as html_mod
import logging
import os
import queue
import re
import shutil
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Iterable
from urllib.parse import urlsplit

import cbor2
import requests

from gamebanana_watcher.downloader import (
    _clear_retry,
    _schedule_retry,
    _select_pending,
    day_folder,
    load_state,
    sanitize_name,
    update_state,
)
from gamebanana_watcher.proxy import https_alive, make_session
from kekehxl_watcher.notify import Notifier

from .browser import CF_MARKERS
from .nahida_link import (
    BrowserResponse,
    ChromeLinkResolver,
    LinkApiError,
    LinkResolveError,
    NahidaLinkClient,
    decompress_file,
    split_link,
)

log = logging.getLogger("arca.download")

STATE_VERSION = 1
CHUNK = 1 << 20
GB = 1024 ** 3
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)

# 站点公告帖写死的频道共用密码（영조 엔드필드 모딩 채널）
DEFAULT_PASSWORD = "Eldwh"

# 可以当作图片落盘的后缀；mp4 只在 [download] include_video = true 时才收
_IMG_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
_VIDEO_EXTS = {".mp4", ".webm", ".mov"}

_RE_KIO = re.compile(r"https?://kio\.ac/c/([A-Za-z0-9_-]{8,})", re.I)
_RE_NAHIDA = re.compile(
    r"https?://nahida\.live/akasha/(mod|link)/([A-Za-z0-9_-]{4,})", re.I
)
_RE_GAMEBANANA = re.compile(r"https?://(?:www\.)?gamebanana\.com/mods/\d+", re.I)

# Kiosk 的自定义 22 字符 UUID 编码（不是标准 base64url，字符表顺序不同）
_KIO_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"


@dataclass
class ArcaDownloadSettings:
    enabled: bool = True
    dest_dir: str = ""
    folder_prefix: str = "W-"
    csv_path: str = ""                     # 空则自动找 dest_dir/_Mod每日汇总/<来源>/all_mods.csv
    images: bool = True
    files: bool = True
    include_video: bool = False
    password: str = DEFAULT_PASSWORD
    backfill_days: int = 7                 # 首次运行回填天数
    min_free_gb: float = 3.0
    request_timeout: int = 120
    # 下载读超时：代理节点抽风时经常「连上了但一直不来数据」。120 秒会让整个
    # 帖子卡两分钟，30 秒足够判断并触发换节点/重试。
    read_timeout: int = 30
    # 同一个帖子内并发下载的图片/文件数（API 调用仍然串行，受各自限流保护）
    download_workers: int = 4
    # arca 图床（ac-o.arca.live）实测 4 并发会回 429，默认只开 2
    image_workers: int = 2
    # kio 大文件分段下载的并发数
    segment_workers: int = 4
    retry: int = 3
    # 达到 retry 后仍会自动重试 auto_retry_rounds 轮，间隔指数增长
    auto_retry_rounds: int = 5
    retry_backoff_minutes: float = 15.0
    retry_backoff_max_minutes: float = 240.0
    delay_seconds: float = 0.5
    max_run_minutes: int = 90
    state_file: str = "state.arca_downloads.json"
    proxy: str | None = None               # 由 run 脚本探测后填入
    chrome_path: str = ""                  # 空则自动找 Chrome / Edge
    link_timeout: int = 180                # 分享链接等 Turnstile 的上限秒数
    skip_categories: tuple[str, ...] = ("엔드필드 모드", "enFielMd")
    ark_link: str = ""                     # 频道公共方舟的 nahida 分享链接；空则关闭


# ---------------------------------------------------------------- 配置 / 状态


def load_settings(cfg) -> ArcaDownloadSettings:
    if not cfg.has_section("download"):
        return ArcaDownloadSettings()
    sec = cfg["download"]
    return ArcaDownloadSettings(
        enabled=sec.getboolean("enabled", True),
        dest_dir=sec.get("dest_dir", "").strip(),
        folder_prefix=sec.get("folder_prefix", "W-").strip() or "W-",
        csv_path=sec.get("csv_path", "").strip(),
        images=sec.getboolean("images", True),
        files=sec.getboolean("files", True),
        include_video=sec.getboolean("include_video", False),
        password=sec.get("password", DEFAULT_PASSWORD).strip() or DEFAULT_PASSWORD,
        backfill_days=max(0, sec.getint("backfill_days", 7)),
        min_free_gb=sec.getfloat("min_free_gb", 3.0),
        request_timeout=sec.getint("request_timeout", 120),
        read_timeout=max(10, sec.getint("read_timeout", 30)),
        download_workers=max(1, min(8, sec.getint("download_workers", 4))),
        image_workers=max(1, min(4, sec.getint("image_workers", 2))),
        segment_workers=max(1, min(8, sec.getint("segment_workers", 4))),
        retry=max(1, sec.getint("retry", 3)),
        auto_retry_rounds=max(0, sec.getint("auto_retry_rounds", 5)),
        retry_backoff_minutes=max(1.0, sec.getfloat("retry_backoff_minutes", 15.0)),
        retry_backoff_max_minutes=max(
            1.0, sec.getfloat("retry_backoff_max_minutes", 240.0)
        ),
        delay_seconds=sec.getfloat("delay_seconds", 0.5),
        max_run_minutes=max(5, sec.getint("max_run_minutes", 90)),
        state_file=sec.get("state_file", "state.arca_downloads.json").strip(),
        chrome_path=sec.get("chrome_path", "").strip(),
        link_timeout=max(30, sec.getint("link_timeout", 180)),
        ark_link=sec.get("ark_link", "").strip(),
        skip_categories=tuple(
            x.strip() for x in sec.get(
                "skip_categories", "엔드필드 모드,enFielMd"
            ).split(",") if x.strip()
        ),
    )


def _free_gb(path: Path) -> float:
    try:
        return shutil.disk_usage(str(path)).free / GB
    except OSError:
        return 0.0


def _ext_of(name_or_url: str, default: str = "") -> str:
    base = str(name_or_url or "").split("?")[0].rsplit("/", 1)[-1]
    if "." in base:
        ext = base.rsplit(".", 1)[-1].lower()
        if re.fullmatch(r"[a-z0-9]{1,8}", ext):
            return "." + ext
    return default


def _taken_bases(state: dict[str, Any]) -> set[str]:
    return {str(item.get("base") or "") for item in state["items"].values()}


def _unique_base(base: str, article_id: str, taken: set[str]) -> str:
    if base not in taken:
        return base
    candidate = f"{base} (arca {article_id})"
    if candidate in taken:
        candidate = f"{base} (arca {article_id}-{int(time.time()) % 10000})"
    return candidate


# ---------------------------------------------------------------- UUID 编码


def _kio_decode_id(text: str) -> bytes:
    """Kiosk 的 22 字符 UUID → 16 字节。"""
    if len(text) != 22:
        raise ValueError(f"不是 Kiosk 的 22 字符 ID：{text!r}")
    out = bytearray(16)
    bit = 0
    byte = 0
    for ch in reversed(text):
        try:
            value = _KIO_ALPHABET.index(ch)
        except ValueError as exc:
            raise ValueError(f"Kiosk ID 含非法字符 {ch!r}") from exc
        for shift in range(6):
            if byte >= 16:
                break
            out[byte] |= ((value >> shift) & 1) << bit
            bit += 1
            if bit == 8:
                bit = 0
                byte += 1
    return bytes(out)


def _b64url(text: str) -> str:
    return base64.urlsafe_b64encode(text.encode("utf-8")).decode("ascii").rstrip("=")


# ---------------------------------------------------------------- 帖子解析


def _is_cf_challenge(page: str) -> bool:
    head = page[:8000]
    return any(m in head for m in CF_MARKERS)


def _fetch_post(
    sess: requests.Session,
    url: str,
    timeout: int,
    resolver: ChromeLinkResolver | None = None,
) -> str:
    """拉帖子页。纯 HTTP 被 Cloudflare 拦下时改用真实 Chrome（有头窗口）。"""
    resp = sess.get(url, timeout=(20, timeout), headers={"Referer": "https://arca.live/"})
    if _is_cf_challenge(resp.text):
        if resolver is None:
            raise RuntimeError(f"帖子页被 Cloudflare 拦截（HTTP {resp.status_code}）：{url}")
        log.info("帖子页被 Cloudflare 拦截，改用 Chrome：%s", url)
        return resolver.fetch_html(url, timeout)
    resp.raise_for_status()
    return resp.text


def _has_article_body(page: str) -> bool:
    """页面里是否真的渲染出了正文容器（而不是只剩验证页/顶栏）。"""
    return 'class="article-body"' in page or "article-body" in page


def _article_body_html(page: str) -> str:
    """截出正文区域，避开顶栏/广告/推荐位的图片。"""
    start = page.find('class="article-body"')
    if start < 0:
        start = page.find("article-body")
    if start < 0:
        return page
    end = page.find('class="vote-area"', start)
    if end < 0:
        end = page.find('<div class="article-menu', start)
    return page[start: end if end > start else start + 400_000]


def _extract_media(body: str, *, include_video: bool) -> list[str]:
    """正文里的原图（data-originalurl 优先，缺了再退回 src）。"""
    urls: list[str] = []
    seen: set[str] = set()

    def add(raw: str) -> None:
        url = html_mod.unescape((raw or "").strip())
        if not url.startswith("http"):
            if url.startswith("//"):
                url = "https:" + url
            else:
                return
        path = urlsplit(url).path
        ext = _ext_of(path)
        if ext in _VIDEO_EXTS and not include_video:
            return
        if ext not in _IMG_EXTS and ext not in _VIDEO_EXTS:
            return
        host = urlsplit(url).netloc.lower()
        if "arca.live" not in host:
            return
        key = path
        if key in seen:
            return
        seen.add(key)
        urls.append(url)

    for m in re.finditer(r'<img\b[^>]*>', body, re.I):
        tag = m.group(0)
        mo = re.search(r'data-originalurl="([^"]+)"', tag, re.I)
        if mo:
            add(mo.group(1))
            continue
        ms = re.search(r'\bsrc="([^"]+)"', tag, re.I)
        if ms:
            add(ms.group(1))
    # 有些帖子直接把 mp4 放进 <video>
    for m in re.finditer(r'<video\b[^>]*>.*?</video>', body, re.I | re.S):
        tag = m.group(0)
        if not include_video:
            continue
        mo = re.search(r'data-originalurl="([^"]+)"', tag, re.I) or re.search(
            r'\bsrc="([^"]+)"', tag, re.I
        )
        if mo:
            add(mo.group(1))
    return urls


def _post_text(body: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", body)
    text = re.sub(r"<[^>]+>", "", text)
    return html_mod.unescape(text)


_RE_PLAIN_URL = re.compile(r"https?://[^\s\"'<>)\]}]+")
_RE_B64 = re.compile(r"[A-Za-z0-9+/]{16,}={0,2}")
_RE_INTERNAL = re.compile(
    r"(ac-?o?\.arca\.live|arca\.live/(b|api|static|u)/|\.(jpg|jpeg|png|gif|webp|svg|css|js)(\?|$))",
    re.I,
)


def _decode_base64_urls(text: str) -> list[str]:
    out: list[str] = []
    for m in _RE_B64.finditer(text):
        token = m.group(0)
        for cand in (token, token.rstrip("=")):
            pad = "=" * (-len(cand) % 4)
            try:
                dec = base64.b64decode(cand + pad, validate=True).decode("utf-8")
            except Exception:  # noqa: BLE001 - 不是 base64 就跳过
                continue
            if dec.startswith(("http://", "https://")) and dec.isprintable():
                out.append(dec.strip())
                break
    return out


def _extract_links(text: str) -> list[str]:
    urls = _RE_PLAIN_URL.findall(text) + _decode_base64_urls(text)
    seen: set[str] = set()
    out: list[str] = []
    for url in urls:
        url = url.rstrip(".,;、。)\"'")
        if not url or url in seen or _RE_INTERNAL.search(url):
            continue
        seen.add(url)
        out.append(url)
    return out


# ---------------------------------------------------------------- Kiosk (kio.ac)


class _ApiError(RuntimeError):
    def __init__(self, code: str, message: str = "") -> None:
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code
        self.message = message


class TransientError(RuntimeError):
    """限流/5xx 这类「过一会儿再来」的错误：不能当成永久失败记进 manual。"""


def _is_transient(exc: Exception) -> bool:
    if isinstance(exc, (TransientError, requests.ConnectionError, requests.Timeout)):
        return True
    if isinstance(exc, _ApiError):
        code = exc.code.lower()
        return "429" in code or code.startswith("http_5") or "too many requests" in code
    return False


class KioClient:
    BASE = "https://api.kio.ac"

    def __init__(self, sess: requests.Session, timeout: int = 60) -> None:
        self.sess = sess
        self.timeout = timeout

    def _post(self, path: str, body: dict[str, Any], headers: dict[str, str] | None = None):
        h = {
            "Content-Type": "application/cbor",
            "Accept": "application/cbor",
            "Origin": "https://kio.ac",
            "Referer": "https://kio.ac/",
        }
        h.update(headers or {})
        resp = self.sess.post(
            self.BASE + path, data=cbor2.dumps(body), headers=h, timeout=self.timeout
        )
        try:
            data = cbor2.loads(resp.content) if resp.content else None
        except Exception as exc:  # noqa: BLE001 - 服务端偶发 5xx 返回 HTML
            raise _ApiError(
                f"http_{resp.status_code}", f"响应不是 CBOR：{exc}"
            ) from exc
        if resp.status_code != 200 or not isinstance(data, dict):
            code = str((data or {}).get("code") or f"http_{resp.status_code}")
            msg = str((data or {}).get("message") or "")
            raise _ApiError(code, msg)
        return data

    def resolve(self, code: str, password: str) -> dict[str, Any]:
        body = {
            "uuid": _kio_decode_id(code),
            "protector": [{"type": "password", "data": {"password": password}}],
        }
        info = self._post("/v0/collection/get", body)
        info["token"] = str(info.get("token") or "")
        info["root"] = bytes(info.get("root") or b"")
        if not info["token"] or not info["root"]:
            raise _ApiError("bad_collection", "缺少 token 或 root")
        return info

    def directory(self, token: str, root: bytes) -> dict[str, Any]:
        return self._post("/v0/collection/directory/get", {"id": root}, {"Kiosk-CAT": token})

    def files(self, token: str, ids: list[bytes]) -> list[dict[str, Any]]:
        data = self._post(
            "/v0/collection/file/gets",
            {"ids": ids},
            {"Kiosk-CAT": token, "Kiosk-Download-Capability": "cdn, edge"},
        )
        return list(data.get("files") or [])

    @staticmethod
    def walk(node: dict[str, Any], prefix: str = "") -> list[tuple[str, dict[str, Any]]]:
        """(相对路径, 文件节点) 的扁平列表。"""
        out: list[tuple[str, dict[str, Any]]] = []
        for f in node.get("files") or []:
            name = str(f.get("name") or "")
            out.append((prefix + name, f))
        for child in node.get("children") or []:
            name = str(child.get("name") or "")
            out.extend(KioClient.walk(child, prefix + name + "/"))
        return out

    def walk_deep(self, token: str, node: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
        """和 walk 一样，但子目录若只给了 id 就再请求一次（服务端可能只返回一层）。"""
        out: list[tuple[str, dict[str, Any]]] = []
        for f in node.get("files") or []:
            out.append((str(f.get("name") or ""), f))
        for child in node.get("children") or []:
            name = str(child.get("name") or "")
            sub = child
            if "files" not in child and "children" not in child and child.get("id"):
                sub = self.directory(token, bytes(child["id"]))
            for rel, f in self.walk_deep(token, sub):
                out.append((name + "/" + rel, f))
        return out


# ---------------------------------------------------------------- Nahida Drive


class NahidaClient:
    BASE = "https://api.nahida.live/akasha"

    def __init__(
        self,
        sess: requests.Session,
        timeout: int = 60,
        resolver: ChromeLinkResolver | None = None,
    ) -> None:
        self.sess = sess
        self.timeout = timeout
        self.resolver = resolver
        self._last_call = 0.0
        # 一旦确认 requests 会被 Cloudflare 拦（TLS 指纹），后续请求直接走 Chrome，
        # 不再每个文件都先浪费一次必然失败的 HTTP 请求。
        self._browser_only = False
        self._headers = {
            "Origin": "https://nahida.live",
            "Referer": "https://nahida.live/",
            "Accept": "application/json",
        }

    def _browser_get(self, url: str, headers: dict[str, str]) -> BrowserResponse:
        if self.resolver is None:
            raise TransientError("没有可用的 Chrome，无法直连 nahida 接口")
        try:
            return self.resolver.api_fetch(
                url, headers=headers, timeout=self.timeout,
            )
        except LinkResolveError as exc:
            # Chrome 起不来 / 页面超时都是可恢复的，下一轮再试，
            # 不要写成永久「需手动」。
            raise TransientError(f"Chrome 直连 nahida 接口失败：{exc}") from exc

    def _get(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, str] | None = None,
        min_gap: float = 0.5,
    ) -> BrowserResponse | requests.Response:
        """429 是常态（单模组 200+ 个文件，逐个取预签名会触发限流），按 retryAfter 等待重试。"""
        resp = None
        full = requests.Request("GET", url, params=params).prepare().url or url
        hdrs = headers or self._headers
        for attempt in range(8):
            # 预签名端点是独立的 **5 次 / 10 秒** 令牌桶（实测 0.6s、1.2s 都会 429，
            # 2.0s 连续 12 次全过）；目录/鉴权接口按全局 60 次 / 10 秒，0.5s 足够。
            gap = min_gap - (time.monotonic() - self._last_call)
            if gap > 0:
                time.sleep(gap)
            self._last_call = time.monotonic()
            if self._browser_only:
                resp = self._browser_get(full, hdrs)
            else:
                resp = self.sess.get(
                    url, headers=hdrs, params=params,
                    timeout=(20, self.timeout),
                )
                if (
                    resp.status_code in (401, 403, 503)
                    and self.resolver is not None
                    and _is_cf_challenge(resp.text)
                ):
                    # 2026-11-14：Cloudflare 现在同时看 TLS 指纹，浏览器 cookie
                    # 拷进 requests 也照样 403；直接在 Chrome 页面里发同一个 GET。
                    log.info("nahida API 被 Cloudflare 拦截，后续改在 Chrome 里请求")
                    self._browser_only = True
                    resp = self._browser_get(full, hdrs)
            if resp.status_code != 429 and resp.status_code < 500:
                return resp
            retry_after = 0
            try:
                data = resp.json()
                retry_after = int(data.get("retryAfter") or data.get("retry_after") or 0)
            except Exception:  # noqa: BLE001 - 429 体不一定是 JSON
                pass
            if not retry_after:
                try:
                    retry_after = int(resp.headers.get("Retry-After") or 0)
                except ValueError:
                    retry_after = 0
            # 没有 retryAfter（例如 {"status":429,"error":"too many requests"}）就指数退避
            if not retry_after:
                retry_after = min(2 ** attempt, 20)
            retry_after = min(max(retry_after, 1), 60)
            log.info("nahida 限流/5xx，等待 %ds 后重试（第 %d 次）", retry_after, attempt + 1)
            time.sleep(retry_after)
        raise TransientError(
            f"nahida 持续限流/5xx：{url}（HTTP {resp.status_code if resp else '?'}）"
        )

    def mod(self, mod_id: str, password: str) -> tuple[dict[str, Any], str]:
        """返回 (模组信息, x-token)。密码用 base64url(UTF-8)。"""
        url = f"{self.BASE}/mod/{mod_id}"
        resp = self._get(url, params={"password": _b64url(password)})
        if resp.status_code != 200:
            raise _ApiError(f"nahida_http_{resp.status_code}", resp.text[:200])
        token = resp.headers.get("x-token") or ""
        if not token:
            raise _ApiError("nahida_no_token", "响应没有 x-token（密码不对？）")
        return resp.json(), token

    def item(self, token: str, item_id: str) -> dict[str, Any]:
        url = f"{self.BASE}/mod/item/{item_id}"
        resp = self._get(url, headers={**self._headers, "x-token": token})
        if resp.status_code != 200:
            raise _ApiError(f"nahida_item_{resp.status_code}", resp.text[:200])
        return resp.json()

    def walk(self, token: str, root_id: str) -> list[tuple[str, dict[str, Any]]]:
        """递归列目录，返回 (相对路径, item)。root 本身不计入路径。"""
        out: list[tuple[str, dict[str, Any]]] = []
        self._walk(token, root_id, "", out, set())
        return out

    def _walk(
        self,
        token: str,
        item_id: str,
        prefix: str,
        out: list[tuple[str, dict[str, Any]]],
        seen: set[str],
    ) -> None:
        if item_id in seen:
            return
        seen.add(item_id)
        data = self.item(token, item_id)
        for child in data.get("children") or []:
            name = str(child.get("name") or "未命名")
            path = prefix + name
            if child.get("isDir"):
                self._walk(token, str(child.get("id")), path + "/", out, seen)
            else:
                out.append((path, child))

    def presign_meta(self, token: str, item_id: str) -> dict[str, Any]:
        """返回直链和压缩信息。

        响应形如 ``{url, size, uncompSize, compAlg, expiresIn}``：列表接口里的
        ``size`` 是原始大小，这里的 ``size`` 是压缩后大小。``compAlg`` 非空时
        直链拿到的是压缩帧，必须解压后才能落盘。
        """
        url = f"{self.BASE}/mod/file/download"
        resp = self._get(
            url,
            params={"itemId": item_id, "presign": "true"},
            headers={**self._headers, "x-token": token},
            min_gap=2.1,
        )
        if resp.status_code != 200:
            raise _ApiError(f"nahida_presign_{resp.status_code}", resp.text[:200])
        data = resp.json()
        if not isinstance(data, dict) or not data.get("url"):
            raise _ApiError("nahida_no_url", str(data)[:200])
        return data

    def presign(self, token: str, item_id: str) -> str:
        return str(self.presign_meta(token, item_id)["url"])


# ---------------------------------------------------------------- 入队（读同步回来的 CSV）


def find_csv(settings: ArcaDownloadSettings, source_name: str = "arca.live") -> Path:
    if settings.csv_path:
        return Path(settings.csv_path)
    dest = Path(settings.dest_dir)
    return dest / "_Mod每日汇总" / source_name / "all_mods.csv"


def _read_csv(path: Path) -> list[dict[str, str]]:
    import csv

    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        return list(csv.DictReader(fh))


def _category_skipped(category: str, tokens: Iterable[str]) -> bool:
    """分类名包含跳过关键词（大小写不敏感）时返回 True。"""
    if not category:
        return False
    cat = category.casefold()
    return any(t.casefold() in cat for t in tokens if t)


def enqueue_from_csv(
    csv_path: str | Path,
    state_path: str | Path,
    settings: ArcaDownloadSettings,
    source_name: str = "arca.live",
) -> int:
    """把 CSV 里尚未入队的帖子写进下载队列（只入队，不下载）。"""
    csv_path = Path(csv_path)
    if not csv_path.exists():
        log.warning("找不到汇总 CSV：%s（sync.ps1 还没拉回来？）", csv_path)
        return 0
    try:
        rows = _read_csv(csv_path)
    except (OSError, UnicodeDecodeError) as exc:
        # sync.ps1 正在覆盖 CSV 时可能读到半截，下一轮再看
        log.warning("读取汇总 CSV 失败：%s", exc)
        return 0
    state_path = Path(state_path)

    def mutate(state: dict[str, Any]) -> int:
        first = not state.get("initialized", False)
        if first:
            # 首次运行定下「从哪天开始收」并永久保存；否则第二轮会把首次被
            # backfill_days 挡掉的历史帖子全部当新帖补进来（2026-11-01 实测踩过）。
            since = date.today() - timedelta(days=settings.backfill_days)
            state["enqueue_since"] = since.isoformat()
        else:
            try:
                since = date.fromisoformat(str(state.get("enqueue_since") or "1970-01-01"))
            except ValueError:
                since = date(1970, 1, 1)
        added = 0
        skipped = 0
        for row in rows:
            aid = str(row.get("article_id") or "").strip()
            if not aid:
                continue
            category = str(row.get("分类") or "").strip()
            skip = _category_skipped(category, settings.skip_categories)
            if aid in state["items"]:
                item = state["items"][aid]
                if category and not item.get("category"):
                    item["category"] = category
                # 已经在队列里的终末地条目（排队/续传/失败）也立刻停掉
                if skip and item.get("status") not in ("done", "skipped"):
                    item["status"] = "skipped"
                    item["last_error"] = f"分类「{category}」在跳过列表中"
                    skipped += 1
                continue
            day = str(row.get("日期") or "").strip()
            if day:
                try:
                    if date.fromisoformat(day) < since:
                        continue
                except ValueError:
                    pass
            links = [u for u in str(row.get("下载链接") or "").split() if u]
            state["items"][aid] = {
                "article_id": aid,
                "title": str(row.get("标题") or "").strip() or f"arca-{aid}",
                "author": str(row.get("作者") or "").strip(),
                "category": category,
                "date": day,
                "page_url": str(row.get("帖子链接") or "").strip(),
                "links": links,
                "status": "skipped" if skip else "queued",
                "attempts": 0,
                "last_error": f"分类「{category}」在跳过列表中" if skip else "",
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "source": source_name,
            }
            if skip:
                skipped += 1
            else:
                added += 1
        state["initialized"] = True
        if added:
            state.pop("paused", None)
        if skipped:
            log.info("跳过 %d 个被忽略分类的帖子（%s）",
                     skipped, "、".join(settings.skip_categories))
        return added

    return update_state(state_path, mutate)


# ---------------------------------------------------------------- 规划


def _classify(links: Iterable[str], password: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {"kio": [], "nahida_mod": [], "nahida_link": [], "other": []}
    seen: set[tuple[str, str]] = set()
    for url in links:
        if _RE_GAMEBANANA.search(url):
            continue                       # GameBanana 任务负责
        if _RE_KIO.search(url):
            bucket, key = "kio", _RE_KIO.search(url).group(1)
        elif _RE_NAHIDA.search(url):
            kind = _RE_NAHIDA.search(url).group(1).lower()
            bucket = "nahida_mod" if kind == "mod" else "nahida_link"
            key = _RE_NAHIDA.search(url).group(2)
        else:
            bucket, key = "other", url
        # 同一链接在正文里出现两次时只留一份。最常见的是第二份后面直接粘了韩文
        # （`.../link/plTaIIsC0mT_ㄱㄹ`），正则只截到 id，两份会解析成同一个分享
        # 链接 —— 以前会整包下载两遍，目录里多一份字节完全相同的副本。
        if (bucket, key) in seen:
            continue
        seen.add((bucket, key))
        out[bucket].append(url)
    return out


def _source_owners(state: dict[str, Any]) -> dict[tuple[str, str], str]:
    """同一 kio 合集 / nahida 模组被多个帖子转发时，记下第一个负责下载的帖子。"""
    owners: dict[tuple[str, str], str] = {}
    for item in state["items"].values():
        if item.get("status") == "failed":
            continue
        for plan in item.get("mods") or []:
            if plan.get("type") == "kio" and plan.get("code"):
                owners.setdefault(("kio", str(plan["code"])), str(item["article_id"]))
            elif plan.get("type") == "nahida" and plan.get("mod_id"):
                owners.setdefault(("nahida", str(plan["mod_id"])), str(item["article_id"]))
            elif plan.get("type") == "nahida_link" and plan.get("link_id"):
                if plan.get("ark"):
                    owners.setdefault(
                        ("ark", str(plan.get("ark_folder_id") or plan["link_id"])),
                        str(item["article_id"]),
                    )
                else:
                    owners.setdefault(("link", str(plan["link_id"])), str(item["article_id"]))
    return owners


# ---------------------------------------------------------------- 频道方舟 (챈방주)

# 有的帖子正文不挂外链，只写「챈방주 내닉폴더에 있음」——文件在频道公共
# Mod 方舟（nahida 分享链接）里，按作者昵称分目录。方舟根链接拿到 token 后，
# 可以定位到 <平台>/작가별(Creator)/[공용)챈 업로더/]<作者>，再按更新日期
# 猜出该帖子对应的子目录。
_ARK_HINT = re.compile(r"(챈\s*방주|모드\s*방주|방주\s*(?:에|내)|닉\s*폴더|닉폴더)", re.I)


def _norm_name(text: Any) -> str:
    return re.sub(r"\s+", "", str(text or "")).casefold()


# 方舟作者目录用英文角色名（Carlotta / Verina …），帖子标题和正文却常写韩文
# （카를로타 / 벨리나 …）。只拿英文名去对标题，明明当天只有一个对应目录也会被
# 判成「当天有多个更新」，帖子就一直卡在「需手动」。这里补常见角色名对照。
# 只收能确定的角色名；对不上就保持原样回到手动，不乱猜。
_ARK_NAME_ALIASES: dict[str, tuple[str, ...]] = {
    "augusta": ("아우구스타",),
    "baizhi": ("백지",),
    "brant": ("브랜트",),
    "calcharo": ("카카루",),
    "camellya": ("카멜리아",),
    "cantarella": ("칸타렐라",),
    "carlotta": ("카를로타",),
    "cartethyia": ("카르티시아",),
    "changli": ("창리",),
    "chixia": ("치샤",),
    "ciaccona": ("치아코나",),
    "danjin": ("단근",),
    "encore": ("앙코",),
    "galbrena": ("갈브레나",),
    "hiyuki": ("히유키",),
    "jianxin": ("감심",),
    "jinhsi": ("금희",),
    "jinshi": ("금희",),          # 方舟目录里常见拼写
    "jiyan": ("기염",),
    "lingyang": ("능양",),
    "lorelei": ("로렐라이",),
    "lumi": ("루미",),
    "lupa": ("루파",),
    "phoebe": ("페비",),
    "qingxiao": ("청초",),
    "roccia": ("로코코",),
    "rover": ("방랑자",),
    "sanhua": ("산화",),
    "shorekeeper": ("파수인",),
    "taoqi": ("도기",),
    "verina": ("벨리나",),
    "yinlin": ("음림",),
    "zani": ("젠니",),
    "zhezhi": ("절지",),
}


def _ark_name_matches(item: dict[str, Any], haystack: str) -> bool:
    """目录名（英文）或它的韩文别名是否出现在标题/正文里。haystack 须先 _norm_name。"""
    name = _norm_name(item.get("name"))
    if not name:
        return False
    if name in haystack:
        return True
    return any(_norm_name(alias) in haystack for alias in _ARK_NAME_ALIASES.get(name, ()))


def _entry_date(entry: dict[str, Any]) -> date | None:
    try:
        return date.fromisoformat(str(entry.get("date") or "")[:10])
    except ValueError:
        return None


def _ark_children(
    client: NahidaLinkClient, token: str, link_id: str, item_id: str
) -> list[dict[str, Any]]:
    return client.content(link_id, token, item_id).get("children") or []


def _ark_match_dir(items: Iterable[dict[str, Any]], target: str) -> tuple[str, str] | None:
    for item in items:
        if item.get("isDir") and _norm_name(item.get("name")) == target:
            return str(item.get("id")), str(item.get("name") or "")
    return None


def _ark_find_author_dir(
    client: NahidaLinkClient,
    token: str,
    link_id: str,
    root_id: str,
    category: Any,
    author: Any,
) -> tuple[str, str] | None:
    """在方舟里找作者昵称目录；返回 ``(目录 id, 目录名)``。"""
    target = _norm_name(author)
    if not target:
        return None
    roots = _ark_children(client, token, link_id, root_id)
    platform_name = "엔드필드" if "엔드필드" in str(category or "") else "명조"
    platform = next(
        (c for c in roots if str(c.get("name") or "") == platform_name), None
    )
    if platform is None:
        platform = next((c for c in roots if "명조" in str(c.get("name") or "")), None)
    if platform is None or not platform.get("isDir"):
        return None
    groups = []
    for platform_child in _ark_children(client, token, link_id, str(platform["id"])):
        if "작가별" in str(platform_child.get("name") or "") and platform_child.get("isDir"):
            groups = _ark_children(client, token, link_id, str(platform_child["id"]))
            break
    if not groups:
        return None
    found = _ark_match_dir(groups, target)
    if found:
        return found
    for group in groups:
        if group.get("isDir") and "챈 업로더" in str(group.get("name") or ""):
            found = _ark_match_dir(
                _ark_children(client, token, link_id, str(group["id"])), target
            )
            if found:
                return found
    return None


def _ark_candidates(
    client: NahidaLinkClient,
    token: str,
    link_id: str,
    author_dir_id: str,
    post_date: date,
    owners: dict[tuple[str, str], str],
) -> list[dict[str, Any]]:
    """作者目录下、发帖日期前后一天内新增/更新过的子项。"""
    lo, hi = post_date - timedelta(days=1), post_date + timedelta(days=2)
    out: list[dict[str, Any]] = []
    for item in _ark_children(client, token, link_id, author_dir_id):
        cid = str(item.get("id") or "")
        if not cid or owners.get(("ark", cid)):
            continue
        stamp = str(item.get("updatedAt") or item.get("createdAt") or "")
        try:
            when = datetime.fromisoformat(stamp).date()
        except ValueError:
            continue
        if lo <= when <= hi:
            out.append(item)
    return out


def _plan_ark(
    entry: dict[str, Any],
    text: str,
    settings: ArcaDownloadSettings,
    link_client: NahidaLinkClient,
    link_resolver: ChromeLinkResolver,
    owners: dict[tuple[str, str], str],
) -> list[dict[str, Any]]:
    """正文只指向「챈방주」时，从频道方舟的作者目录里找当天更新的模组。"""
    if not settings.ark_link or not _ARK_HINT.search(text or ""):
        return []
    parsed = split_link(settings.ark_link)
    if not parsed:
        log.warning("[download] ark_link 不是有效的 nahida 分享链接：%s", settings.ark_link)
        return []
    ark_id, canonical = parsed
    post_date = _entry_date(entry)
    if post_date is None:
        return []
    try:
        tok = link_resolver.resolve(ark_id)
    except LinkResolveError as exc:
        if exc.kind == "timeout":
            raise TransientError(f"方舟分享链接解析失败：{exc}") from exc
        entry.setdefault("manual", []).append({"link": canonical, "reason": str(exc)})
        return []
    author = str(entry.get("author") or "")
    found = _ark_find_author_dir(
        link_client, tok.token, ark_id, tok.root_id, entry.get("category"), author
    )
    if not found:
        entry.setdefault("manual", []).append({
            "link": canonical,
            "reason": f"챈방주里找不到作者「{author}」的文件夹",
        })
        return []
    author_dir_id, author_dir_name = found
    cands = _ark_candidates(
        link_client, tok.token, ark_id, author_dir_id, post_date, owners
    )
    if not cands:
        log.info("方舟作者目录 %s 在 %s 前后没有更新，跳过", author_dir_name, post_date)
        return []
    if len(cands) > 1:
        # 先按标题认角色（最准）；标题认不出来再看正文——作者常在正文里写
        # 「페비와 카를로타 소소하게 픽스함」，一个帖子对应多个目录也算命中。
        title = _norm_name(entry.get("title"))
        body = _norm_name(text)
        matched = [c for c in cands if _ark_name_matches(c, title)]
        if not matched:
            matched = [c for c in cands if _ark_name_matches(c, body)]
        if matched:
            cands = matched
        else:
            names = "、".join(str(c.get("name") or "") for c in cands[:5])
            entry.setdefault("manual", []).append({
                "link": canonical,
                "reason": (
                    f"方舟作者目录 {author_dir_name} 当天有多个更新"
                    f"（{names}），无法确定是哪一个"
                ),
            })
            return []

    plans: list[dict[str, Any]] = []
    for cand in cands:
        cid = str(cand.get("id") or "")
        name = str(cand.get("name") or "ark")
        try:
            if cand.get("isDir"):
                flat = link_client.walk(ark_id, tok.token, cid)
                files = [
                    {
                        "item_id": str(node.get("id") or ""),
                        "path": relpath,
                        "size": int(node.get("size") or 0),
                        "status": "pending",
                    }
                    for relpath, node in flat
                ]
            else:
                files = [{
                    "item_id": cid,
                    "path": name,
                    "size": int(cand.get("size") or 0),
                    "status": "pending",
                }]
        except LinkApiError as exc:
            if exc.status == 429 or exc.status >= 500:
                raise TransientError(f"方舟列目录失败：{exc}") from exc
            entry.setdefault("manual", []).append(
                {"link": canonical, "reason": f"方舟「{name}」列目录失败（{exc}）"}
            )
            continue
        if not files:
            continue
        plans.append({
            "type": "nahida_link",
            "ark": True,
            "ark_folder_id": cid,
            "link": canonical,
            "link_id": ark_id,
            "root_id": cid,
            "root_name": name,
            "token": tok.token,
            "token_expires": tok.expires_at,
            "files": files,
        })
        owners[("ark", cid)] = str(entry.get("article_id") or "")
        log.info("方舟命中：%s / %s（%d 个文件）", author_dir_name, name, len(files))
    return plans


def _plan_entry(
    entry: dict[str, Any],
    base: str,
    settings: ArcaDownloadSettings,
    sess: requests.Session,
    kio: KioClient,
    nahida: NahidaClient,
    link_client: NahidaLinkClient,
    link_resolver: ChromeLinkResolver,
    owners: dict[tuple[str, str], str] | None = None,
) -> None:
    """拉帖子页 + 解析每个外链，写入 entry 的 images/kio/nahida/manual。"""
    owners = owners or {}
    # 重新规划（上一轮因限流失败）时先清空，避免 manual/images 累加重复
    entry["manual"] = []
    entry["images"] = []
    entry["mods"] = []
    entry["last_error"] = ""
    aid = entry["article_id"]
    page_url = entry.get("page_url") or f"https://arca.live/b/thingzyoa/{aid}"
    page = _fetch_post(sess, page_url, settings.request_timeout, link_resolver)
    body = _article_body_html(page)
    text = _post_text(body)

    # 帖子正文里可能还有 CSV 没记录到的链接（历史条目尤其常见）。
    # 但正文真的取到时就以正文为准：作者改帖换掉贴错的链接后，旧链接若继续
    # 从 state 合并进来，会永远卡在「需手动」并反复下载错的东西。
    fresh = _extract_links(text)
    if fresh or _has_article_body(page):
        links = fresh
    else:
        links = list(dict.fromkeys(list(entry.get("links") or []) + fresh))
    entry["links"] = links
    buckets = _classify(links, settings.password)

    images: list[dict[str, Any]] = []
    if settings.images:
        media = _extract_media(body, include_video=settings.include_video)
        count = len(media)
        for idx, url in enumerate(media):
            suffix = "" if count == 1 else f"_{idx + 1}"
            images.append({
                "src": urlsplit(url).path,     # 签名 URL 会过期，按路径重新匹配
                # 直接存签名 URL（约 1 小时有效）：同一轮下载通常刚规划完，
                # 复用它就不用为了刷新签名再开一次 Chrome 抓帖子页。
                "url": url,
                "file": f"{base}{suffix}{_ext_of(urlsplit(url).path, '.jpg')}",
                "status": "pending",
            })

    kio_plans: list[dict[str, Any]] = []
    if settings.files:
        for url in buckets["kio"]:
            code = _RE_KIO.search(url).group(1)
            owner = owners.get(("kio", code))
            if owner and owner != entry["article_id"]:
                entry.setdefault("manual", []).append(
                    {"link": url, "reason": f"与帖子 {owner} 是同一个合集，已跳过重复下载"}
                )
                continue
            try:
                info = kio.resolve(code, settings.password)
                tree = kio.directory(info["token"], info["root"])
                flat = kio.walk_deep(info["token"], tree)
            except Exception as exc:  # noqa: BLE001
                if _is_transient(exc):
                    raise
                entry.setdefault("manual", []).append(
                    {"link": url, "reason": f"kio 合集打不开（{exc}）"}
                )
                continue
            if not flat:
                continue
            files = []
            for relpath, node in flat:
                files.append({
                    "id": bytes(node.get("id") or b"").hex(),
                    "name": str(node.get("name") or ""),
                    "path": relpath,
                    "size": int(node.get("size") or 0),
                    "status": "pending",
                })
            kio_plans.append({
                "type": "kio",
                "link": url,
                "code": code,
                "segment_size": int(info.get("segment_size") or 0),
                "collection": str(info.get("name") or ""),
                "files": files,
            })

        for url in buckets["nahida_mod"]:
            mod_id = _RE_NAHIDA.search(url).group(2)
            owner = owners.get(("nahida", mod_id))
            if owner and owner != entry["article_id"]:
                entry.setdefault("manual", []).append(
                    {"link": url, "reason": f"与帖子 {owner} 是同一个模组页，已跳过重复下载"}
                )
                continue
            try:
                info, token = nahida.mod(mod_id, settings.password)
            except Exception as exc:  # noqa: BLE001
                if _is_transient(exc):
                    raise
                entry.setdefault("manual", []).append(
                    {"link": url, "reason": f"nahida 模组页打不开（{exc}）"}
                )
                continue
            points = (info.get("mod") or {}).get("points") or {}
            if points.get("scope") not in (None, "none") and not points.get("paid"):
                entry.setdefault("manual", []).append(
                    {"link": url, "reason": "需要积分，未自动下载"}
                )
                continue
            # 共享模组页通常按角色分 collection（例如「챗지피티 명조 모딩 작업본」
            # 一个页面挂了 6 个角色、近 3GB）。正文里点名了「파수인 폴더」这种
            # 目录名时只下那个 collection，否则会把整页的角色全拖下来。
            all_colls = list(info.get("collections") or [])
            named = [
                c for c in all_colls
                if str(c.get("name") or "").strip()
                and str(c.get("name")).strip() in text
            ]
            if named:
                log.info("模组页 %s 按正文只取 collection：%s",
                         mod_id, "、".join(str(c.get("name")) for c in named))
                all_colls = named
            collections = []
            for coll in all_colls:
                if coll.get("pointAmount") and not coll.get("paid"):
                    entry.setdefault("manual", []).append(
                        {"link": url, "reason": f"collection「{coll.get('name')}」需要积分"}
                    )
                    continue
                try:
                    flat = nahida.walk(token, str(coll.get("rootId")))
                except Exception as exc:  # noqa: BLE001
                    if _is_transient(exc):
                        raise
                    entry.setdefault("manual", []).append(
                        {"link": url, "reason": f"collection「{coll.get('name')}」列目录失败（{exc}）"}
                    )
                    continue
                if not flat:
                    continue
                collections.append({
                    "name": str(coll.get("name") or "root"),
                    "root_id": str(coll.get("rootId") or ""),
                    "files": [
                        {
                            "item_id": str(node.get("id") or ""),
                            "path": relpath,
                            "size": int(node.get("size") or 0),
                            "status": "pending",
                        }
                        for relpath, node in flat
                    ],
                })
            if collections:
                kio_plans.append({
                    "type": "nahida",
                    "link": url,
                    "mod_id": mod_id,
                    "collections": collections,
                })

        ark_link_id = ""
        if settings.ark_link:
            ark_parsed = split_link(settings.ark_link)
            if ark_parsed:
                ark_link_id = ark_parsed[0]

        for url in buckets["nahida_link"]:
            parsed = split_link(url)
            if not parsed:
                entry.setdefault("manual", []).append(
                    {"link": url, "reason": "无法识别的 nahida 分享链接"}
                )
                continue
            link_id, canonical = parsed
            if ark_link_id and link_id == ark_link_id:
                # 频道公告里的公共方舟根链接（上 TB），不能按普通分享链接整包下载
                entry.setdefault("manual", []).append({
                    "link": canonical,
                    "reason": "这是频道公共方舟链接，未整包下载",
                })
                continue
            owner = owners.get(("link", link_id))
            if owner and owner != entry["article_id"]:
                entry.setdefault("manual", []).append(
                    {"link": canonical, "reason": f"与帖子 {owner} 是同一个分享链接，已跳过重复下载"}
                )
                continue
            try:
                tok = link_resolver.resolve(link_id)
                try:
                    flat = link_client.walk(link_id, tok.token, tok.root_id)
                except LinkApiError as exc:
                    if exc.status not in (401, 403):
                        raise
                    # token 可能因为梯子节点换了 IP 而失效：重新开一次浏览器
                    link_resolver.invalidate(link_id)
                    tok = link_resolver.resolve(link_id)
                    flat = link_client.walk(link_id, tok.token, tok.root_id)
            except LinkResolveError as exc:
                if exc.kind == "timeout":
                    raise TransientError(f"nahida 分享链接解析失败：{exc}") from exc
                entry.setdefault("manual", []).append(
                    {"link": canonical, "reason": str(exc)}
                )
                continue
            except LinkApiError as exc:
                if exc.status == 429 or exc.status >= 500:
                    raise TransientError(f"nahida 分享链接接口失败：{exc}") from exc
                entry.setdefault("manual", []).append(
                    {"link": canonical, "reason": f"分享链接列目录失败（{exc}）"}
                )
                continue
            if not flat:
                continue
            kio_plans.append({
                "type": "nahida_link",
                "link": canonical,
                "link_id": link_id,
                "root_id": tok.root_id,
                "root_name": tok.root_name,
                "token": tok.token,
                "token_expires": tok.expires_at,
                "files": [
                    {
                        "item_id": str(node.get("id") or ""),
                        "path": relpath,
                        "size": int(node.get("size") or 0),
                        "status": "pending",
                    }
                    for relpath, node in flat
                ],
            })

        # 正文只写「챈방주 내닉폴더에 있음」、没有任何外链时，去频道方舟找
        if not (buckets["kio"] or buckets["nahida_mod"] or buckets["nahida_link"]):
            kio_plans.extend(_plan_ark(
                entry, text, settings, link_client, link_resolver, owners
            ))
    if buckets["other"]:
        for url in buckets["other"]:
            entry.setdefault("manual", []).append({"link": url, "reason": "站外链接，未自动下载"})

    # 分配文件名：kio 是压缩包，直接平铺；nahida 模组页 / 分享链接是目录树，
    # 各放一个文件夹；只有一个目录组时才直接平铺到帖子标题下。
    total_kio_files = sum(len(p["files"]) for p in kio_plans if p["type"] == "kio")
    kio_index = 0
    nahida_groups = [p for p in kio_plans if p["type"] == "nahida"]
    link_groups = [p for p in kio_plans if p["type"] == "nahida_link"]
    dir_groups = sum(len(p["collections"]) for p in nahida_groups) + len(link_groups)
    used_dirs: set[str] = set()

    def _assign_tree(folder: str, files: list[dict[str, Any]]) -> None:
        for f in files:
            # 组件级清洗：Mod 内部路径可能带 ? : * 等 Windows 非法字符
            safe = "/".join(
                sanitize_name(part, 120) for part in str(f["path"]).split("/")
            )
            f["file"] = f"{folder}/{safe}"

    for plan in kio_plans:
        if plan["type"] == "kio":
            for f in plan["files"]:
                kio_index += 1
                suffix = "" if total_kio_files == 1 else f"_{kio_index}"
                f["file"] = f"{base}{suffix}{_ext_of(f['name'], '.zip')}"
        elif plan["type"] == "nahida_link":
            name = plan.get("root_name") or "share"
            folder = base if dir_groups == 1 else sanitize_name(f"{base}_{name}", 80)
            if folder in used_dirs:
                folder = sanitize_name(f"{base}_{name}_{plan['link_id']}", 80)
            used_dirs.add(folder)
            _assign_tree(folder, plan["files"])
        else:
            for coll in plan["collections"]:
                folder = base if dir_groups == 1 else sanitize_name(f"{base}_{coll['name']}", 80)
                if folder in used_dirs:
                    folder = sanitize_name(f"{base}_{coll['name']}_{plan['mod_id']}", 80)
                used_dirs.add(folder)
                _assign_tree(folder, coll["files"])

    entry["base"] = base
    entry["images"] = images
    entry["mods"] = kio_plans
    entry["planned"] = True
    has_work = bool(images) or any(
        (p.get("files") or p.get("collections")) for p in kio_plans
    )
    entry["status"] = "pending" if has_work else ("manual" if entry.get("manual") else "done")


# ---------------------------------------------------------------- 下载


class _SessionPool:
    """按线程复用的 requests.Session。

    ``requests.Session`` 不是线程安全的（cookie/连接池），并发下载必须每个线程
    一个。这里用 threading.local 让同一线程的多个文件复用 TLS 连接，进程结束时
    统一关闭。
    """

    def __init__(self, proxy: str | None) -> None:
        self.proxy = proxy
        self._local = threading.local()
        self._all: list[requests.Session] = []
        self._lock = threading.Lock()

    def get(self) -> requests.Session:
        sess = getattr(self._local, "sess", None)
        if sess is None:
            sess = make_session(self.proxy, _UA)
            self._local.sess = sess
            with self._lock:
                self._all.append(sess)
        return sess

    def close(self) -> None:
        with self._lock:
            sessions, self._all = self._all, []
        for sess in sessions:
            try:
                sess.close()
            except Exception:  # noqa: BLE001 - 关闭失败不影响结果
                pass


class _PipelineAbort(Exception):
    """取直链阶段发现「后面的文件也没必要再试」的错误（如分享链接 token 彻底失效）。"""


class _RateLimited(Exception):
    """服务端返回 429/503：并发过高或短时间请求太多，按 Retry-After 退避。"""

    def __init__(self, after: float) -> None:
        super().__init__(f"429/503，retry_after={after:g}s")
        self.after = after


def _presign_download_pipeline(
    pending: list[dict[str, Any]],
    presign: Callable[[dict[str, Any]], Any],
    download: Callable[[dict[str, Any], Any], int],
    workers: int,
    *,
    label: str,
    on_progress: Callable[[], None] | None = None,
) -> list[tuple[dict[str, Any], int]]:
    """把「取直链（串行、必须遵守服务端限流）」和「下载（并发）」重叠起来。

    nahida 的预签名接口是 5 次/10 秒，每个文件固定等 2.1 秒——这段等待正好可以
    用来传上一个文件。``presign`` 抛错只标记该文件失败，不影响其他文件。
    返回成功项 ``(file_plan, 写入字节数)``，由调用方汇总统计、落盘状态。
    """
    if not pending:
        return []
    workers = max(1, min(workers, len(pending)))
    q: queue.Queue = queue.Queue(maxsize=workers * 2)
    sentinel = object()
    results: list[tuple[dict[str, Any], int]] = []
    # 状态落盘（看板进度）会和 worker 修改文件状态同时发生，统一用这把锁；
    # 落盘时传 deepcopy 快照，避免 json 序列化读到「正在改的」字典。
    state_lock = threading.Lock()

    def producer() -> None:
        last_progress = time.monotonic()
        abort: Exception | None = None
        try:
            for item in pending:
                if abort is not None:
                    with state_lock:
                        item["status"] = "failed"
                        item["error"] = f"已跳过：{abort}"[:200]
                    continue
                try:
                    token = presign(item)
                except _PipelineAbort as exc:
                    abort = exc
                    with state_lock:
                        item["status"] = "failed"
                        item["error"] = f"取直链失败：{exc}"[:200]
                    log.warning("%s 中断后续文件 %s：%s", label, item.get("file"), exc)
                    continue
                except Exception as exc:  # noqa: BLE001 - 单个文件取直链失败
                    with state_lock:
                        item["status"] = "failed"
                        item["error"] = f"取直链失败：{exc}"[:200]
                    log.warning("%s 取直链失败 %s：%s", label, item.get("file"), exc)
                    continue
                q.put((item, token))
                if on_progress is not None and time.monotonic() - last_progress >= 3:
                    with state_lock:
                        on_progress()
                    last_progress = time.monotonic()
        finally:
            # 无论生产端怎么退出都要发结束标记，否则 worker 会永远等下去
            for _ in range(workers):
                q.put(sentinel)

    def worker() -> None:
        while True:
            got = q.get()
            if got is sentinel:
                return
            item, token = got
            try:
                written = download(item, token)
                with state_lock:
                    item["status"] = "done"
                    item.pop("error", None)
                    results.append((item, written))
            except Exception as exc:  # noqa: BLE001 - 单个文件失败不拖垮整帖
                with state_lock:
                    item["status"] = "failed"
                    item["error"] = str(exc)[:200]
                log.warning("%s 下载失败 %s：%s", label, item.get("file"), exc)

    threads = [threading.Thread(target=producer, name=f"{label}-presign")]
    threads += [
        threading.Thread(target=worker, name=f"{label}-dl-{i}") for i in range(workers)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def _stream_response_to(
    resp: requests.Response,
    fh,
    *,
    skip: int = 0,
) -> int:
    """把响应体写进已打开的文件；服务器不认 Range（200）时丢弃前面 skip 字节。"""
    written = 0
    status = resp.status_code
    if status == 206:
        for chunk in resp.iter_content(CHUNK):
            if chunk:
                fh.write(chunk)
                written += len(chunk)
        return written
    if status == 200:
        remaining = skip
        for chunk in resp.iter_content(CHUNK):
            if not chunk:
                continue
            if remaining:
                if len(chunk) <= remaining:
                    remaining -= len(chunk)
                    continue
                chunk = chunk[remaining:]
                remaining = 0
            fh.write(chunk)
            written += len(chunk)
        return written
    resp.raise_for_status()
    return 0


def _content_range_total(value: str) -> int | None:
    """`bytes 100-999/1000` → 1000。"""
    m = re.search(r"/(\d+)\s*$", value or "")
    return int(m.group(1)) if m else None


_ARCA_PROBE_URL = "https://arca.live/"


def _repair_transport(sess: requests.Session) -> bool:
    """代理连接失败时先自动换 Clash 节点，换不了再评估直连。

    arca.live 直连会被 Cloudflare 拦（403），所以只有直连返回 <400 才切；
    换节点成功则继续走同一个本地代理端口，只是出口换了。
    """
    if not sess.proxies:
        return False
    proxy_url = str(sess.proxies.get("https") or sess.proxies.get("http") or "")
    if proxy_url:
        try:
            from gamebanana_watcher.clash import switch_to_working_node

            result = switch_to_working_node([_ARCA_PROBE_URL], proxy_url=proxy_url)
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
        if not https_alive(None, _ARCA_PROBE_URL, timeout=10.0, max_status=400):
            return False
    except Exception:  # noqa: BLE001 - 探活失败不致命
        return False
    log.warning("代理连接失败，直连实测可用，本次运行改走直连")
    sess.proxies = {}
    return True


def _download_url(
    sess: requests.Session,
    url: str,
    dest: Path,
    *,
    timeout: int,
    read_timeout: int = 30,
    expected_size: int | None = None,
    is_image: bool = False,
    headers: dict[str, str] | None = None,
    resume: bool = True,
) -> bool:
    """单 URL 下载到 .part 再改名；支持 Range 断点续传。返回是否真的写了数据。

    `Accept-Encoding: identity` 是必须的：requests 默认会要 gzip 并自动解压，
    二进制附件（尤其是 S3 预签名直链）会因此和 Content-Length 对不上。
    """
    if dest.exists():
        if expected_size is None:
            return False
        if abs(dest.stat().st_size - expected_size) <= 1024:
            return False
        dest.unlink(missing_ok=True)

    part = dest.with_suffix(dest.suffix + ".part")
    offset = 0
    if resume and part.exists():
        offset = part.stat().st_size
        if expected_size and offset >= expected_size:
            os.replace(part, dest)
            return False
    elif part.exists():
        part.unlink(missing_ok=True)

    h = dict(headers or {})
    h.setdefault("Accept-Encoding", "identity")
    attempt = 0
    rate_attempt = 0          # 429/503 单独计数，不消耗网络重试次数
    switched = False          # 一次下载最多换一次节点，避免在两组节点间来回跳
    while True:
        offset = part.stat().st_size if part.exists() else 0
        if expected_size and offset >= expected_size:
            os.replace(part, dest)
            return False
        if offset:
            h["Range"] = f"bytes={offset}-"
        elif "Range" in h:
            h.pop("Range")
        try:
            with sess.get(url, stream=True, timeout=(20, read_timeout), headers=h) as resp:
                if resp.status_code == 416 and offset:
                    part.unlink(missing_ok=True)      # 残片比文件还大，重来
                    return _download_url(
                        sess, url, dest, timeout=timeout, read_timeout=read_timeout,
                        expected_size=expected_size,
                        is_image=is_image, headers=headers, resume=False,
                    )
                if resp.status_code in (429, 503):
                    try:
                        after = float(resp.headers.get("Retry-After") or 0)
                    except ValueError:
                        after = 0.0
                    raise _RateLimited(after)
                if resp.status_code not in (200, 206):
                    resp.raise_for_status()
                ctype = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
                if is_image and not (ctype.startswith("image/") or ctype.startswith("video/")):
                    raise RuntimeError(f"返回的不是图片（Content-Type={ctype or '空'}）")
                mode = "ab" if (offset and resp.status_code == 206) else "wb"
                if mode == "wb":
                    offset = 0
                # 服务端给的总大小：206 看 Content-Range，200 看 Content-Length
                total = _content_range_total(resp.headers.get("Content-Range", ""))
                if total is None:
                    try:
                        total = int(resp.headers.get("Content-Length") or 0) or None
                    except ValueError:
                        total = None
                with part.open(mode) as fh:
                    written = offset + _stream_response_to(resp, fh, skip=offset)
            break
        except _RateLimited as exc:
            # 429 是并发过高/短时间请求太多：按 Retry-After 退避，别硬顶
            rate_attempt += 1
            if rate_attempt > 3:
                raise
            wait = min(max(exc.after, 2.0 * rate_attempt), 30.0)
            log.warning("被限流，%.0fs 后重试（%s）：%s", wait, dest.name, exc)
            time.sleep(wait)
            continue
        except (
            requests.ConnectionError,
            requests.Timeout,
            requests.exceptions.ChunkedEncodingError,
            requests.exceptions.ContentDecodingError,
        ) as exc:
            # 梯子节点抽风是常态；保留 .part，从断点重试几次再放弃。
            # 读超时（连上了但一直没数据）也当作节点问题，换一次节点再续传。
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
                switched = True
                attempt = 0
                continue
            if attempt >= 4:
                raise
            wait = min(2 * attempt, 10)
            log.warning("下载中断，%ds 后重试（%s）：%s", wait, dest.name, str(exc)[:120])
            time.sleep(wait)
    expected = expected_size or total
    if expected and abs(written - expected) > 1024:
        part.unlink(missing_ok=True)
        raise RuntimeError(f"大小不符：期望 {expected}，实际 {written}（可能被登录墙拦截）")
    os.replace(part, dest)
    return True


_ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"


def _is_zstd_frame(path: Path) -> bool:
    try:
        with path.open("rb") as fh:
            return fh.read(4) == _ZSTD_MAGIC
    except OSError:
        return False


def _ensure_nahida_file(path: Path, expected: int) -> bool:
    """确认已落盘的 nahida 文件可用；旧版留下的 zstd 压缩包就地解压。

    ``expected`` 是列表接口里的原始大小。早期 ``mod/...`` 下载路径没按
    ``compAlg`` 解压，盘上留下的是压缩帧（大小与列表对不上），这里顺手修好，
    避免「看板重试也修不回来、旧包一直躺着」。
    """
    if not path.exists():
        return False
    try:
        size = path.stat().st_size
    except OSError:
        return False
    if not expected or size == expected:
        return True
    if not _is_zstd_frame(path):
        return False
    tmp = path.with_suffix(path.suffix + ".unpack")
    try:
        decompress_file("zstd", path, tmp)
        if expected and abs(tmp.stat().st_size - expected) > 1024:
            return False
        os.replace(tmp, path)
        log.info("已解压旧版遗留的压缩文件：%s", path.name)
        return True
    except Exception as exc:  # noqa: BLE001 - 修不好就让调用方重新下载
        log.warning("解压旧文件失败（将重新下载）：%s：%s", path, exc)
        return False
    finally:
        tmp.unlink(missing_ok=True)


def _adopt_renamed(day_dir: Path, files: Iterable[dict[str, Any]]) -> None:
    """目录被命名工坊整包改名后，把状态里的旧路径改到实际位置。

    下载器按 ``base/collection/...`` 写文件；用户把顶层目录改成站内规范名后，
    状态里还是旧名。下次重试若照旧路径写，就会在旁边多出一份原始名目录
    （看起来像「上一个没下完的旧包」）。这里按顶层目录之后的相对路径找回。
    """
    tops: list[Path] | None = None
    for f in files:
        rel = str(f.get("file") or "")
        if not rel:
            continue
        if (day_dir / rel).exists():
            continue
        parts = rel.split("/")
        if len(parts) < 2:
            continue
        if tops is None:
            try:
                tops = [p for p in day_dir.iterdir() if p.is_dir()]
            except OSError:
                tops = []
        for top in tops:
            cand = top.joinpath(*parts[1:])
            if cand.exists():
                f["file"] = cand.relative_to(day_dir).as_posix()
                break


def _kio_seg_target(seg: dict[str, Any], idx: int) -> tuple[str, dict[str, str]]:
    """把 kio 的一段元数据变成 (URL, 额外请求头)。"""
    kind = str(seg.get("type") or "")
    data = seg.get("data") or {}
    url = str(data.get("url") or "")
    if not url:
        raise _ApiError("bad_segment", f"第 {idx} 段没有 URL")
    headers: dict[str, str] = {}
    if kind == "edge":
        url = url.rstrip("/") + "/edge/v4/download"
        headers["Kiosk-SAT"] = str(data.get("token") or "")
    return url, headers


def _download_kio_segment(
    sessions: _SessionPool,
    url: str,
    headers: dict[str, str],
    part: Path,
    start: int,
    length: int,
    timeout: int,
    read_timeout: int,
    name: str,
    idx: int,
) -> None:
    """从 ``start`` 开始把第 idx 段写进 part，最多写 ``length`` 字节。

    失败时整段重来（覆盖该段区域），不做段内续传——段只有 16MiB，
    重来比维护每段独立偏移简单且不容易写坏文件。
    """
    attempt = 0
    switched = False
    while True:
        sess = sessions.get()
        try:
            with part.open("r+b") as fh:
                fh.seek(start)
                h = dict(headers)
                h.setdefault("Accept-Encoding", "identity")
                with sess.get(
                    url, stream=True, timeout=(20, read_timeout), headers=h
                ) as resp:
                    if resp.status_code not in (200, 206):
                        resp.raise_for_status()
                    written = 0
                    for chunk in resp.iter_content(CHUNK):
                        if not chunk:
                            continue
                        room = length - written
                        if room <= 0:
                            break
                        if len(chunk) > room:
                            chunk = chunk[:room]
                        fh.write(chunk)
                        written += len(chunk)
                    if written < length:
                        raise requests.exceptions.ChunkedEncodingError(
                            f"分段 {idx} 只收到 {written}/{length} 字节"
                        )
            return
        except (
            requests.ConnectionError,
            requests.Timeout,
            requests.exceptions.ChunkedEncodingError,
            requests.exceptions.ContentDecodingError,
        ) as exc:
            attempt += 1
            # 死节点/死连接：换一次节点再重来，比在同一节点上重试有效
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
                switched = True
                attempt = 0
                continue
            if attempt >= 4:
                raise
            wait = min(2 * attempt, 10)
            log.warning(
                "kio 第 %d 段中断，%ds 后重试（%s）：%s",
                idx, wait, name, str(exc)[:120],
            )
            time.sleep(wait)


def _download_kio_file(
    sessions: _SessionPool,
    kio: KioClient,
    token: str,
    file_plan: dict[str, Any],
    segment_size: int,
    dest: Path,
    *,
    timeout: int,
    read_timeout: int = 30,
    workers: int = 4,
) -> None:
    """按 16MiB 分段拉取 kio 文件，段 URL 每次现取（带签名、约 1 小时过期）。

    新文件各段并发拉取；只有上次中断留下的 ``.part`` 才退回单线程续传
    （多段并行时每段的断点不同，续传需要额外的偏移记录）。
    """
    expected = int(file_plan.get("size") or 0)
    if dest.exists() and (not expected or abs(dest.stat().st_size - expected) <= 1024):
        return
    fid = bytes.fromhex(str(file_plan["id"]))
    files = kio.files(token, [fid])
    if not files:
        raise _ApiError("file_not_found", file_plan.get("name") or "")
    segs = list(files[0].get("segments") or [])
    if not segs:
        raise _ApiError("no_segments", file_plan.get("name") or "")

    part = dest.with_suffix(dest.suffix + ".part")
    if expected and part.exists() and part.stat().st_size > expected:
        part.unlink(missing_ok=True)
    offset = part.stat().st_size if part.exists() else 0
    if expected and offset >= expected:
        os.replace(part, dest)
        return
    if not segment_size:
        segment_size = max(1, expected // max(1, len(segs)))

    if not offset and expected:
        # 全新下载：各段并行，卡住的首字节等待互相填补
        targets = [(idx,) + _kio_seg_target(seg, idx) for idx, seg in enumerate(segs)]
        with part.open("wb"):
            pass
        count = max(1, min(workers, len(targets)))

        def _one(target: tuple[int, str, dict[str, str]]) -> None:
            idx, url, headers = target
            start = idx * segment_size
            length = min(segment_size, expected - start)
            if length <= 0:
                return
            _download_kio_segment(
                sessions, url, headers, part, start, length,
                timeout, read_timeout, dest.name, idx,
            )

        with ThreadPoolExecutor(max_workers=count) as ex:
            futures = [ex.submit(_one, t) for t in targets]
            for fut in futures:
                fut.result()
    else:
        # 续传（或大小未知）：原来的单线程逻辑，从 .part 末尾接着拉
        with part.open("ab" if offset else "wb") as fh:
            while True:
                pos = fh.tell()
                if expected and pos >= expected:
                    break
                idx = pos // segment_size
                if idx >= len(segs):
                    break
                url, headers = _kio_seg_target(segs[idx], idx)
                # 单段重试：梯子节点中途断开是常态，从当前 .part 位置续拉这一段
                attempt = 0
                switched = False
                while True:
                    within = fh.tell() - idx * segment_size
                    h = dict(headers)
                    h.setdefault("Accept-Encoding", "identity")
                    if within > 0:
                        h["Range"] = f"bytes={within}-"
                    sess = sessions.get()
                    try:
                        with sess.get(
                            url, stream=True, timeout=(20, read_timeout), headers=h
                        ) as resp:
                            if resp.status_code not in (200, 206):
                                resp.raise_for_status()
                            if resp.status_code == 200 and within > 0:
                                # 段服务器不认 Range：回到本段起点重下
                                fh.seek(idx * segment_size)
                                fh.truncate()
                                within = 0
                            _stream_response_to(resp, fh, skip=within)
                        break
                    except (
                        requests.ConnectionError,
                        requests.Timeout,
                        requests.exceptions.ChunkedEncodingError,
                        requests.exceptions.ContentDecodingError,
                    ) as exc:
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
                            switched = True
                            attempt = 0
                            continue
                        if attempt >= 4:
                            raise
                        wait = min(2 * attempt, 10)
                        log.warning(
                            "kio 第 %d 段中断，%ds 后重试（%s）：%s",
                            idx, wait, dest.name, str(exc)[:120],
                        )
                        time.sleep(wait)
                if not expected and idx == len(segs) - 1:
                    break
    if expected and abs(part.stat().st_size - expected) > 1024:
        raise RuntimeError(f"大小不符：期望 {expected}，实际 {part.stat().st_size}")
    os.replace(part, dest)


def _refresh_media(
    sess: requests.Session,
    entry: dict[str, Any],
    timeout: int,
    resolver: ChromeLinkResolver | None = None,
) -> dict[str, str]:
    """重新拉帖子页，返回 {路径: 新鲜签名 URL}（图片签名约 1 小时过期）。"""
    page = _fetch_post(sess, entry["page_url"], timeout, resolver)
    body = _article_body_html(page)
    fresh: dict[str, str] = {}
    for url in _extract_media(body, include_video=True):
        fresh[urlsplit(url).path] = url
    return fresh


def _apply_state(state_path: Path, aid: str, entry: dict[str, Any]) -> None:
    def mutate(state: dict[str, Any]) -> None:
        stored = state["items"].get(aid)
        if stored is not None:
            stored.clear()
            stored.update(entry)
    update_state(state_path, mutate)


def _has_pending(entry: dict[str, Any]) -> bool:
    if any(
        x.get("status") not in ("done", "skipped") for x in entry.get("images") or []
    ):
        return True
    for plan in entry.get("mods") or []:
        for f in plan.get("files") or []:
            if f.get("status") != "done":
                return True
        for coll in plan.get("collections") or []:
            for f in coll.get("files") or []:
                if f.get("status") != "done":
                    return True
    return False


def _write_manual_lists(
    out_root: Path,
    entries: Iterable[dict[str, Any]],
    prefix: str,
    source_name: str = "arca.live",
) -> None:
    """把无法自动下载的链接按天汇总成 txt + 可点击的 html（放在来源子目录里）。"""
    entries = list(entries)
    grouped: dict[Path, list[tuple[str, str, str, str]]] = {}
    all_days: set[Path] = set()
    manual_days: set[Path] = set()
    for entry in entries:
        day = entry.get("day") or ""
        if not day:
            continue
        day_dir = out_root / day_folder(day, prefix) / source_name
        all_days.add(day_dir)
        manual = entry.get("manual") or []
        if not manual:
            continue
        manual_days.add(day_dir)
        for item in manual:
            grouped.setdefault(day_dir, []).append((
                entry.get("title", ""),
                entry.get("author", ""),
                item.get("link", ""),
                item.get("reason", ""),
            ))
    for day_dir, rows in grouped.items():
        try:
            day_dir.mkdir(parents=True, exist_ok=True)
            txt = "标题 | 作者 | 链接 | 原因\n" + "\n".join(
                " | ".join(r) for r in rows
            ) + "\n"
            (day_dir / "arca_需手动下载.txt").write_text(txt, encoding="utf-8-sig")

            trs = "\n".join(
                "<tr><td>{}</td><td>{}</td><td><a href=\"{}\" target=\"_blank\">{}</a></td>"
                "<td>{}</td></tr>".format(
                    html_mod.escape(title), html_mod.escape(author),
                    html_mod.escape(link, quote=True), html_mod.escape(link),
                    html_mod.escape(reason),
                )
                for title, author, link, reason in rows
            )
            page = (
                "<!doctype html><meta charset=\"utf-8\">"
                "<title>arca 需手动下载</title>"
                "<style>body{font:14px/1.6 'Malgun Gothic',sans-serif;margin:24px}"
                "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;"
                "padding:6px 10px;vertical-align:top}th{background:#f3f3f3;text-align:left}"
                "a{word-break:break-all}</style>"
                "<h2>arca.live 需手动下载</h2>"
                "<p>这些链接无法自动下载（链接失效、密码不对、需要积分，"
                "或属于站外网盘）。程序会在后续轮次重试可恢复的项。</p>"
                "<table><tr><th>标题</th><th>作者</th>"
                "<th>链接</th><th>原因</th></tr>" + trs + "</table>"
            )
            (day_dir / "arca_需手动下载.html").write_text(page, encoding="utf-8")
        except OSError as exc:
            log.warning("写待手动清单失败：%s", exc)
    # 之前失败留下的清单已经过期（帖子后来下成功了）就删掉，别让人误以为还要手动
    for day_dir in all_days - manual_days - set(grouped):
        for name in ("arca_需手动下载.txt", "arca_需手动下载.html"):
            try:
                (day_dir / name).unlink(missing_ok=True)
            except OSError as exc:
                log.warning("删除过期待手动清单失败：%s", exc)


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if os.name == "nt":
        import ctypes

        handle = ctypes.windll.kernel32.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED
        if not handle:
            return False
        ctypes.windll.kernel32.CloseHandle(handle)
        return True
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def _acquire_run_lock(state_path: Path, stale_seconds: float = 3 * 3600) -> Path | None:
    """任务计划 + 手动运行可能撞车；同一时间只允许一个下载进程。"""
    lock = state_path.with_suffix(state_path.suffix + ".run.lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    try:
        fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode("ascii", "ignore"))
        os.close(fd)
        return lock
    except FileExistsError:
        # 进程被强杀会留下锁；先看 PID 还活着没，超过 stale_seconds 也视为失效
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
        # 无权限建锁时退化为不锁（仍比直接退出好）
        return None


def _release_run_lock(lock: Path | None) -> None:
    if lock is None:
        return
    try:
        lock.unlink()
    except OSError:
        pass


def requeue_manual(state_path: str | Path) -> int:
    """把 status=manual 的帖子重新放回队列，让下一轮按最新规则重新规划。

    用于「以前只能手动下载、现在能自动下了」的条目。重新规划后如果仍然只有
    站外链接，会再次回到 manual，不会反复下载已完成的内容。
    """
    state_path = Path(state_path)
    count = 0

    def mutate(state: dict[str, Any]) -> None:
        nonlocal count
        for entry in (state.get("items") or {}).values():
            if entry.get("status") == "manual":
                entry["status"] = "pending"
                entry["planned"] = False
                entry["attempts"] = 0
                entry["last_error"] = ""
                _clear_retry(entry)
                entry.pop("alerted", None)
                count += 1

    update_state(state_path, mutate)
    return count


def process_queue(
    settings: ArcaDownloadSettings,
    state_path: str | Path,
    out_root: Path,
    notifier: Notifier | None = None,
    *,
    max_items: int | None = None,
    plan_only: bool = False,
    source_name: str = "arca.live",
) -> dict[str, int]:
    """处理队列里所有未完成的帖子。返回统计。"""
    state_path = Path(state_path)
    lock = _acquire_run_lock(state_path)
    if state_path.with_suffix(state_path.suffix + ".run.lock").exists() and lock is None:
        log.warning("已有一个下载进程在跑，本轮跳过")
        return {"planned": 0, "images": 0, "files": 0, "done": 0, "manual": 0,
                "failed": 0, "skipped": 0, "bytes": 0}
    resolver = ChromeLinkResolver(
        settings.proxy,
        settings.password,
        chrome_path=settings.chrome_path,
        per_link_timeout=settings.link_timeout,
    )
    sessions = _SessionPool(settings.proxy)
    try:
        return _process_queue_inner(
            settings, state_path, out_root, notifier, resolver,
            sessions=sessions,
            max_items=max_items, plan_only=plan_only, source_name=source_name,
        )
    finally:
        sessions.close()
        resolver.close()
        _release_run_lock(lock)


def _process_queue_inner(
    settings: ArcaDownloadSettings,
    state_path: Path,
    out_root: Path,
    notifier: Notifier | None,
    link_resolver: ChromeLinkResolver,
    *,
    sessions: _SessionPool,
    max_items: int | None = None,
    plan_only: bool = False,
    source_name: str = "arca.live",
) -> dict[str, int]:
    out_root = Path(out_root)
    source_dir = sanitize_name(source_name, 40) or "arca.live"
    run_day = date.today()
    stats = {"planned": 0, "images": 0, "files": 0, "done": 0, "manual": 0,
             "failed": 0, "skipped": 0, "bytes": 0}

    state = load_state(state_path)
    paused = state.get("paused") or {}
    if paused.get("reason") == "low_disk" and _free_gb(out_root) < settings.min_free_gb:
        log.warning("磁盘仍不足（%.1fGB），继续暂停下载", _free_gb(out_root))
        return stats
    if paused.get("reason") == "low_disk":
        def clear(state: dict[str, Any]) -> None:
            state["paused"] = None
        update_state(state_path, clear)

    pending, waiting_retry = _select_pending(state, settings)
    pending.sort(key=lambda e: (e.get("date") or "", e.get("created_at") or ""))
    if max_items is not None:
        pending = pending[:max_items]
    if waiting_retry:
        log.info("%d 个失败帖子还没到自动重试时间", waiting_retry)
    if not pending:
        log.info("下载队列为空")
        _write_manual_lists(out_root, state["items"].values(), settings.folder_prefix, source_dir)
        return stats

    log.info("待处理 %d 个 arca 帖子", len(pending))
    sess = make_session(settings.proxy, _UA)
    link_resolver.bind_session(sess)
    kio = KioClient(sess, settings.request_timeout)
    nahida = NahidaClient(sess, settings.request_timeout, link_resolver)
    link_client = NahidaLinkClient(sess, settings.request_timeout, link_resolver)

    taken = _taken_bases(state)
    owners = _source_owners(state)
    deadline = time.time() + settings.max_run_minutes * 60
    low_disk = False
    touched: list[dict[str, Any]] = []

    for entry in pending:
        if time.time() > deadline:
            log.warning("本轮达到 max_run_minutes=%d，剩余留到下次", settings.max_run_minutes)
            break
        aid = entry["article_id"]
        if not entry.get("day"):
            entry["day"] = run_day.isoformat()
        day_dir = out_root / day_folder(entry["day"], settings.folder_prefix) / source_dir

        if not entry.get("planned"):
            slot = taken
            # 同一帖子重新规划时，别把自己的旧 base 当成别人占用的名字
            if entry.get("base"):
                slot.discard(str(entry["base"]))
            base = sanitize_name(entry.get("title") or f"arca-{aid}", 100)
            base = _unique_base(base, aid, slot)
            taken.add(base)
            try:
                _plan_entry(
                    entry, base, settings, sess, kio, nahida,
                    link_client, link_resolver, owners,
                )
                for plan in entry.get("mods") or []:
                    if plan.get("type") == "kio" and plan.get("code"):
                        owners.setdefault(("kio", str(plan["code"])), aid)
                    elif plan.get("type") == "nahida" and plan.get("mod_id"):
                        owners.setdefault(("nahida", str(plan["mod_id"])), aid)
                    elif plan.get("type") == "nahida_link" and plan.get("link_id"):
                        if plan.get("ark"):
                            owners.setdefault(
                                ("ark", str(plan.get("ark_folder_id") or plan["link_id"])),
                                aid,
                            )
                        else:
                            owners.setdefault(("link", str(plan["link_id"])), aid)
                stats["planned"] += 1
                _apply_state(state_path, aid, entry)
                time.sleep(settings.delay_seconds)
            except Exception as exc:  # noqa: BLE001
                entry["attempts"] = int(entry.get("attempts") or 0) + 1
                entry["last_error"] = f"规划失败：{exc}"[:300]
                if entry["attempts"] >= settings.retry:
                    entry["status"] = "failed"
                    _schedule_retry(entry, settings)
                    stats["failed"] += 1
                    if entry.get("retry_exhausted"):
                        log.warning(
                            "帖子 %s 自动重试已用尽（共 %d 次），需要手动重试",
                            aid, entry["attempts"],
                        )
                    else:
                        log.warning(
                            "帖子 %s 规划失败（第 %d 次），将在 %s 自动重试",
                            aid, entry["attempts"], entry.get("retry_after", ""),
                        )
                else:
                    entry["status"] = "partial"
                    _clear_retry(entry)
                _apply_state(state_path, aid, entry)
                log.warning("帖子 %s 规划失败：%s", aid, exc)
                touched.append(entry)
                continue

        if plan_only:
            touched.append(entry)
            continue

        if entry.get("status") in ("done", "manual", "skipped"):
            continue

        day_dir.mkdir(parents=True, exist_ok=True)

        # ---- 图片（每次现取签名 URL）
        pending_imgs = [x for x in entry.get("images") or [] if x.get("status") != "done"]
        if pending_imgs:
            # 规划时记下的签名 URL 约 1 小时有效。同一轮下载通常刚规划完，
            # 直接复用即可；只有缺 URL 或下载被判过期（403）才重开 Chrome 抓页面。
            fresh: dict[str, str] = {}
            if any(not img.get("url") for img in pending_imgs):
                try:
                    fresh = _refresh_media(
                        sess, entry, settings.request_timeout, link_resolver
                    )
                except Exception as exc:  # noqa: BLE001
                    fresh = {}
                    log.warning("帖子 %s 重新取图失败：%s", aid, exc)

            if _free_gb(out_root) < settings.min_free_gb:
                low_disk = True
            else:
                def _one_image(img: dict[str, Any]) -> tuple[str, str | None, int]:
                    url = img.get("url") or fresh.get(img.get("src", ""))
                    if not url:
                        # 发帖人删了图：重试也没用，跳过而不是把整个帖子拖成 failed
                        return ("skipped", "图片已不在帖子中", 0)
                    try:
                        _download_url(
                            sessions.get(), url, day_dir / img["file"],
                            timeout=settings.request_timeout,
                            read_timeout=settings.read_timeout,
                            is_image=True,
                        )
                        size = (day_dir / img["file"]).stat().st_size
                        return ("done", None, size)
                    except requests.HTTPError as exc:
                        status = exc.response.status_code if exc.response is not None else 0
                        return (
                            "expired" if status in (401, 403, 410) else "failed",
                            str(exc)[:200], 0,
                        )
                    except Exception as exc:  # noqa: BLE001
                        return ("failed", str(exc)[:200], 0)

                workers = max(1, min(settings.image_workers, len(pending_imgs)))
                with ThreadPoolExecutor(max_workers=workers) as ex:
                    results = list(ex.map(_one_image, pending_imgs))
                expired: list[dict[str, Any]] = []
                for img, (outcome, err, size) in zip(pending_imgs, results):
                    if outcome == "done":
                        img["status"] = "done"
                        img.pop("error", None)
                        stats["images"] += 1
                        stats["bytes"] += size
                    elif outcome == "skipped":
                        img["status"] = "skipped"
                        img["error"] = err
                    elif outcome == "expired":
                        expired.append(img)       # 签名过期，攒着刷新后统一重试
                    else:
                        img["status"] = "failed"
                        img["error"] = err
                        log.warning("图片下载失败 %s/%s：%s", aid, img.get("file"), err)

                if expired:
                    try:
                        fresh = _refresh_media(
                            sess, entry, settings.request_timeout, link_resolver
                        )
                    except Exception as exc:  # noqa: BLE001
                        fresh = {}
                        log.warning("帖子 %s 刷新图片签名失败：%s", aid, exc)
                    for img in expired:
                        url = fresh.get(img.get("src", ""))
                        if not url:
                            img["status"] = "skipped"
                            img["error"] = "图片已不在帖子中"
                            continue
                        img["url"] = url
                        try:
                            _download_url(
                                sessions.get(), url, day_dir / img["file"],
                                timeout=settings.request_timeout,
                                read_timeout=settings.read_timeout,
                                is_image=True,
                            )
                            img["status"] = "done"
                            img.pop("error", None)
                            stats["images"] += 1
                            stats["bytes"] += (day_dir / img["file"]).stat().st_size
                        except Exception as exc:  # noqa: BLE001
                            img["status"] = "failed"
                            img["error"] = str(exc)[:200]
                            log.warning(
                                "图片下载失败 %s/%s：%s", aid, img.get("file"), exc
                            )
        if low_disk:
            _apply_state(state_path, aid, entry)
            touched.append(entry)
            break

        # ---- 模组文件
        for plan in entry.get("mods") or []:
            if plan.get("type") == "kio":
                pending_files = [f for f in plan.get("files") or [] if f.get("status") != "done"]
                if not pending_files:
                    continue
                try:
                    info = kio.resolve(plan["code"], settings.password)
                except _ApiError as exc:
                    for f in pending_files:
                        f["status"] = "failed"
                        f["error"] = f"合集打不开：{exc}"
                    log.warning("kio 合集 %s 打不开：%s", plan.get("code"), exc)
                    continue
                for f in pending_files:
                    if _free_gb(out_root) < settings.min_free_gb + (f.get("size") or 0) / GB:
                        low_disk = True
                        break
                    dest = day_dir / f["file"]
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        _download_kio_file(
                            sessions, kio, info["token"], f,
                            int(plan.get("segment_size") or 0), dest,
                            timeout=settings.request_timeout,
                            read_timeout=settings.read_timeout,
                            workers=settings.segment_workers,
                        )
                        f["status"] = "done"
                        f.pop("error", None)
                        stats["files"] += 1
                        stats["bytes"] += dest.stat().st_size if dest.exists() else 0
                        log.info("kio 文件完成：%s（%s）", dest.name, aid)
                    except Exception as exc:  # noqa: BLE001
                        f["status"] = "failed"
                        f["error"] = str(exc)[:200]
                        log.warning("kio 文件下载失败 %s/%s：%s", aid, f.get("file"), exc)
                if low_disk:
                    break
            elif plan.get("type") == "nahida":
                # 状态写 done 不代表磁盘上还能用：目录可能被改名、文件可能还是
                # 旧版留下的压缩包。先对一遍盘，修不回再重新下载。
                pending_cols: list[dict[str, Any]] = []
                for coll in plan.get("collections") or []:
                    files = coll.get("files") or []
                    if not files:
                        continue
                    _adopt_renamed(day_dir, files)
                    for f in files:
                        expected = int(f.get("size") or 0)
                        if _ensure_nahida_file(day_dir / f["file"], expected):
                            if f.get("status") != "done":
                                f["status"] = "done"
                                f.pop("error", None)
                            continue
                        f["status"] = "pending"
                        f.pop("error", None)
                    if any(f.get("status") != "done" for f in files):
                        pending_cols.append(coll)
                if not pending_cols:
                    continue
                try:
                    _info, token = nahida.mod(plan["mod_id"], settings.password)
                except _ApiError as exc:
                    for c in pending_cols:
                        for f in c.get("files") or []:
                            if f.get("status") != "done":
                                f["status"] = "failed"
                                f["error"] = f"模组页打不开：{exc}"
                    log.warning("nahida 模组 %s 打不开：%s", plan.get("mod_id"), exc)
                    continue
                pending_files: list[dict[str, Any]] = []
                for coll in pending_cols:
                    for f in coll.get("files") or []:
                        if f.get("status") == "done":
                            continue
                        if _free_gb(out_root) < settings.min_free_gb + (f.get("size") or 0) / GB:
                            low_disk = True
                            break
                        pending_files.append(f)
                    if low_disk:
                        break

                def _nahida_presign(f: dict[str, Any], _token: str = token) -> dict[str, Any]:
                    return nahida.presign_meta(_token, f["item_id"])

                def _nahida_download(f: dict[str, Any], meta: dict[str, Any]) -> int:
                    dest = day_dir / f["file"]
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    expected = int(f.get("size") or meta.get("uncompSize") or 0)
                    if _ensure_nahida_file(dest, expected):
                        return dest.stat().st_size
                    url = str(meta.get("url") or "")
                    if not url:
                        raise RuntimeError("预签名响应没有 url")
                    comp = str(meta.get("compAlg") or "").strip().lower()
                    csize = int(meta.get("size") or 0) or None
                    raw = dest.with_suffix(dest.suffix + ".dlpart")
                    try:
                        # 直链给的是压缩帧，按 csize 校验原始字节数
                        _download_url(
                            sessions.get(), url, raw,
                            timeout=settings.request_timeout,
                            read_timeout=settings.read_timeout,
                            expected_size=csize,
                        )
                        if comp:
                            part = dest.with_suffix(dest.suffix + ".part")
                            try:
                                decompress_file(comp, raw, part)
                                if expected and abs(part.stat().st_size - expected) > 1024:
                                    raise RuntimeError(
                                        f"解压后大小不符：期望 {expected}，"
                                        f"实际 {part.stat().st_size}"
                                    )
                                os.replace(part, dest)
                            finally:
                                part.unlink(missing_ok=True)
                        else:
                            os.replace(raw, dest)
                    finally:
                        raw.unlink(missing_ok=True)
                    return dest.stat().st_size if dest.exists() else 0

                # 预签名 5 次/10 秒是服务端硬限制；把 2.1 秒的等待和下载重叠起来，
                # 文件多时总耗时从「N×2.1s + 全部传输」降到「N×2.1s」为主。
                done = _presign_download_pipeline(
                    pending_files, _nahida_presign, _nahida_download,
                    settings.download_workers, label="nahida",
                    on_progress=lambda: _apply_state(
                        state_path, aid, copy.deepcopy(entry)
                    ),
                )
                for _f, size in done:
                    stats["files"] += 1
                    stats["bytes"] += size
                    log.info("nahida 文件完成：%s（%s）", Path(_f["file"]).name, aid)
                if low_disk:
                    break
            elif plan.get("type") == "nahida_link":
                link_files = plan.get("files") or []
                _adopt_renamed(day_dir, link_files)
                for f in link_files:
                    if f.get("status") != "done":
                        continue
                    dest = day_dir / f["file"]
                    expected = int(f.get("size") or 0)
                    if not dest.exists() or (
                        expected and abs(dest.stat().st_size - expected) > 1024
                    ):
                        f["status"] = "pending"
                        f.pop("error", None)
                pending_files = [
                    f for f in link_files if f.get("status") != "done"
                ]
                if not pending_files:
                    continue
                token = str(plan.get("token") or "")
                expires = float(plan.get("token_expires") or 0)
                if not token or expires <= time.time() + 300:
                    try:
                        tok = link_resolver.resolve(plan["link_id"])
                    except LinkResolveError as exc:
                        for f in pending_files:
                            f["status"] = "failed"
                            f["error"] = f"分享链接 token 失效：{exc}"[:200]
                        log.warning("nahida 分享链接 %s 解析失败：%s", plan.get("link_id"), exc)
                        continue
                    token = tok.token
                    plan["token"] = token
                    plan["token_expires"] = tok.expires_at
                    plan["root_id"] = tok.root_id

                ready: list[dict[str, Any]] = []
                for f in pending_files:
                    if _free_gb(out_root) < settings.min_free_gb + (f.get("size") or 0) / GB:
                        low_disk = True
                        break
                    ready.append(f)

                token_box = {"token": token}

                def _link_meta(f: dict[str, Any]) -> dict[str, Any]:
                    try:
                        return link_client.file_meta(
                            plan["link_id"], token_box["token"], str(f["item_id"])
                        )
                    except LinkApiError as exc:
                        if exc.status not in (401, 403):
                            raise
                        # token 可能因为梯子节点换了 IP 而失效：重新开一次浏览器。
                        # 拿不回来就中止剩余文件，别对几百个文件各开一次 Chrome。
                        link_resolver.invalidate(plan["link_id"])
                        try:
                            tok = link_resolver.resolve(plan["link_id"])
                        except LinkResolveError as rexc:
                            raise _PipelineAbort(
                                f"分享链接 token 失效且无法重新获取：{rexc}"
                            ) from rexc
                        token_box["token"] = tok.token
                        plan["token"] = tok.token
                        plan["token_expires"] = tok.expires_at
                        plan["root_id"] = tok.root_id
                        return link_client.file_meta(
                            plan["link_id"], tok.token, str(f["item_id"])
                        )

                def _link_download(f: dict[str, Any], meta: dict[str, Any]) -> int:
                    dest = day_dir / f["file"]
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    link_client.download_file(
                        plan["link_id"], token_box["token"], f, dest,
                        timeout=settings.request_timeout,
                        meta=meta,
                        sess=sessions.get(),
                        read_timeout=settings.read_timeout,
                    )
                    return dest.stat().st_size if dest.exists() else 0

                # 一个分享链接可能有几百个文件：取直链（0.5s 一个）与下载重叠，
                # 并每 3 秒把进度落盘，看板能看到逐个文件增长。
                done = _presign_download_pipeline(
                    ready, _link_meta, _link_download,
                    settings.download_workers, label="nahida 分享",
                    on_progress=lambda: _apply_state(
                        state_path, aid, copy.deepcopy(entry)
                    ),
                )
                for _f, size in done:
                    stats["files"] += 1
                    stats["bytes"] += size
                if low_disk:
                    break
        if low_disk:
            # 先落盘本轮已经下完的项目，否则下次会把它们当没下过
            _apply_state(state_path, aid, entry)
            touched.append(entry)
            break

        # ---- 收尾状态
        failed = _has_pending(entry)
        if not failed:
            entry["status"] = "manual" if entry.get("manual") else "done"
            entry["last_error"] = ""
            _clear_retry(entry)
            stats["done"] += 1
            log.info("帖子 %s 完成：%d 图 / %d 文件", aid,
                     len(entry.get("images") or []),
                     sum(len(p.get("files") or []) for p in entry.get("mods") or [])
                     + sum(len(c.get("files") or []) for p in entry.get("mods") or []
                           for c in p.get("collections") or []))
            if entry["status"] == "manual":
                stats["manual"] += 1
        else:
            entry["attempts"] = int(entry.get("attempts") or 0) + 1
            errors = []
            for img in entry.get("images") or []:
                if img.get("status") != "done":
                    errors.append(f"{img.get('file')}: {img.get('error', '')}")
            for plan in entry.get("mods") or []:
                for f in plan.get("files") or []:
                    if f.get("status") != "done":
                        errors.append(f"{f.get('file')}: {f.get('error', '')}")
                for c in plan.get("collections") or []:
                    for f in c.get("files") or []:
                        if f.get("status") != "done":
                            errors.append(f"{f.get('file')}: {f.get('error', '')}")
            entry["last_error"] = "；".join(errors[:3])[:300]
            if entry["attempts"] >= settings.retry:
                entry["status"] = "failed"
                _schedule_retry(entry, settings)
                stats["failed"] += 1
                if entry.get("retry_exhausted"):
                    log.warning(
                        "帖子 %s 自动重试已用尽（共 %d 次），需要手动重试",
                        aid, entry["attempts"],
                    )
                else:
                    log.warning(
                        "帖子 %s 第 %d 次失败，将在 %s 自动重试",
                        aid, entry["attempts"], entry.get("retry_after", ""),
                    )
            else:
                entry["status"] = "partial"
                _clear_retry(entry)
            log.warning("帖子 %s 有 %d 项失败（第 %d 次）", aid, len(errors), entry["attempts"])
        _apply_state(state_path, aid, entry)
        touched.append(entry)

    if low_disk:
        def pause(state: dict[str, Any]) -> None:
            state["paused"] = {"reason": "low_disk",
                               "at": datetime.now().isoformat(timespec="seconds")}
        update_state(state_path, pause)
        log.error("磁盘剩余 %.1fGB，低于阈值 %.1fGB，暂停下载", _free_gb(out_root), settings.min_free_gb)
        if notifier is not None:
            notifier.send_alert(
                "磁盘空间不足，已暂停下载 arca.live Mod",
                f"剩余 {_free_gb(out_root):.1f}GB，低于阈值 {settings.min_free_gb:.1f}GB。\n"
                "清理磁盘后下一轮会自动继续。",
            )

    _write_manual_lists(out_root, state["items"].values(), settings.folder_prefix, source_dir)
    log.info(
        "本轮下载：新增图片 %d 张、文件 %d 个，完成 %d 个帖子，待手动 %d，失败 %d，共 %.1f MB",
        stats["images"], stats["files"], stats["done"], stats["manual"], stats["failed"],
        stats["bytes"] / (1024 ** 2),
    )
    return stats
