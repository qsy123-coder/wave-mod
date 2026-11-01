"""arca.live 模组文件 + 原图本地化下载（本机 Windows 运行）。

与 GameBanana 的下载任务（``gamebanana_watcher/downloader.py``）保持同样的产物约定：
图片和 Mod 文件直接落在当天的分发目录，日期按**下载执行日**归档：

    <dest_dir>/W-2026.11.01/<标题>.png
    <dest_dir>/W-2026.11.01/<标题>_2.png
    <dest_dir>/W-2026.11.01/<标题>.zip              ← kio.ac 合集里的压缩包
    <dest_dir>/W-2026.11.01/<标题>/...              ← nahida.live 模组的目录树

数据来源是服务器 arca-watcher 归档、再由 ``sync.ps1`` 拉回本机的
``A_每日更新/_Mod每日汇总/arca.live/all_mods.csv``。

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
      分享链接，POST 时必须带 Cloudflare Turnstile 的 ``cftoken``。2026-11 实测
      本机真实 Chrome（有无代理都试过）拿到的是 ``access_denied``，自动过验证
      属于对抗站点反爬，故**只记录为待手动**。需要积分的模组一律不下载。

  - GameBanana 链接：由本机 GameBanana 任务负责，这里直接跳过。
  - 其他网盘/站外链接：记录为待手动。

待手动项会写进当天目录的 ``arca_需手动下载.txt`` 和 ``arca_需手动下载.html``
（后者可直接点链接），方便一次处理完。
"""

from __future__ import annotations

import base64
import html as html_mod
import logging
import os
import re
import shutil
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlsplit

import cbor2
import requests

from gamebanana_watcher.downloader import (
    day_folder,
    load_state,
    sanitize_name,
    update_state,
)
from gamebanana_watcher.proxy import make_session
from kekehxl_watcher.notify import Notifier

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
    retry: int = 3
    delay_seconds: float = 0.5
    max_run_minutes: int = 90
    state_file: str = "state.arca_downloads.json"
    proxy: str | None = None               # 由 run 脚本探测后填入


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
        retry=max(1, sec.getint("retry", 3)),
        delay_seconds=sec.getfloat("delay_seconds", 0.5),
        max_run_minutes=max(5, sec.getint("max_run_minutes", 90)),
        state_file=sec.get("state_file", "state.arca_downloads.json").strip(),
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


def _fetch_post(sess: requests.Session, url: str, timeout: int) -> str:
    resp = sess.get(url, timeout=(20, timeout), headers={"Referer": "https://arca.live/"})
    resp.raise_for_status()
    return resp.text


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

    def __init__(self, sess: requests.Session, timeout: int = 60) -> None:
        self.sess = sess
        self.timeout = timeout
        self._last_call = 0.0
        self._headers = {
            "Origin": "https://nahida.live",
            "Referer": "https://nahida.live/",
            "Accept": "application/json",
        }

    def _get(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        params: dict[str, str] | None = None,
        min_gap: float = 0.5,
    ) -> requests.Response:
        """429 是常态（单模组 200+ 个文件，逐个取预签名会触发限流），按 retryAfter 等待重试。"""
        resp = None
        for attempt in range(8):
            # 预签名端点是独立的 **5 次 / 10 秒** 令牌桶（实测 0.6s、1.2s 都会 429，
            # 2.0s 连续 12 次全过）；目录/鉴权接口按全局 60 次 / 10 秒，0.5s 足够。
            gap = min_gap - (time.monotonic() - self._last_call)
            if gap > 0:
                time.sleep(gap)
            self._last_call = time.monotonic()
            resp = self.sess.get(
                url, headers=headers or self._headers, params=params,
                timeout=(20, self.timeout),
            )
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

    def presign(self, token: str, item_id: str) -> str:
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
        return str(data["url"])


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
        for row in rows:
            aid = str(row.get("article_id") or "").strip()
            if not aid or aid in state["items"]:
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
                "date": day,
                "page_url": str(row.get("帖子链接") or "").strip(),
                "links": links,
                "status": "queued",
                "attempts": 0,
                "last_error": "",
                "created_at": datetime.now().isoformat(timespec="seconds"),
                "source": source_name,
            }
            added += 1
        state["initialized"] = True
        if added:
            state.pop("paused", None)
        return added

    return update_state(state_path, mutate)


# ---------------------------------------------------------------- 规划


def _classify(links: Iterable[str], password: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {"kio": [], "nahida_mod": [], "nahida_link": [], "other": []}
    for url in links:
        if _RE_GAMEBANANA.search(url):
            continue                       # GameBanana 任务负责
        if _RE_KIO.search(url):
            out["kio"].append(url)
        elif _RE_NAHIDA.search(url):
            kind = _RE_NAHIDA.search(url).group(1).lower()
            out["nahida_mod" if kind == "mod" else "nahida_link"].append(url)
        else:
            out["other"].append(url)
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
    return owners


def _plan_entry(
    entry: dict[str, Any],
    base: str,
    settings: ArcaDownloadSettings,
    sess: requests.Session,
    kio: KioClient,
    nahida: NahidaClient,
    owners: dict[tuple[str, str], str] | None = None,
) -> None:
    """拉帖子页 + 解析每个外链，写入 entry 的 images/kio/nahida/manual。"""
    owners = owners or {}
    # 重新规划（上一轮因限流失败）时先清空，避免 manual/images 累加重复
    entry["manual"] = []
    entry["images"] = []
    entry["mods"] = []
    aid = entry["article_id"]
    page_url = entry.get("page_url") or f"https://arca.live/b/thingzyoa/{aid}"
    page = _fetch_post(sess, page_url, settings.request_timeout)
    body = _article_body_html(page)
    text = _post_text(body)

    # 帖子正文里可能还有 CSV 没记录到的链接（历史条目尤其常见）
    links = list(dict.fromkeys(list(entry.get("links") or []) + _extract_links(text)))
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
            collections = []
            for coll in info.get("collections") or []:
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

    if buckets["nahida_link"]:
        for url in buckets["nahida_link"]:
            entry.setdefault("manual", []).append(
                {"link": url, "reason": "nahida 分享链接（Cloudflare Turnstile，需浏览器手动打开）"}
            )
    if buckets["other"]:
        for url in buckets["other"]:
            entry.setdefault("manual", []).append({"link": url, "reason": "站外链接，未自动下载"})

    # 分配文件名：kio 是压缩包，直接平铺；nahida 是目录树，单独放一个文件夹
    total_kio_files = sum(len(p["files"]) for p in kio_plans if p["type"] == "kio")
    kio_index = 0
    nahida_groups = [p for p in kio_plans if p["type"] == "nahida"]
    total_nahida_collections = sum(len(p["collections"]) for p in nahida_groups)
    used_dirs: set[str] = set()
    for plan in kio_plans:
        if plan["type"] == "kio":
            for f in plan["files"]:
                kio_index += 1
                suffix = "" if total_kio_files == 1 else f"_{kio_index}"
                f["file"] = f"{base}{suffix}{_ext_of(f['name'], '.zip')}"
        else:
            for coll in plan["collections"]:
                if total_nahida_collections == 1:
                    folder = base
                else:
                    folder = sanitize_name(f"{base}_{coll['name']}", 80)
                if folder in used_dirs:
                    folder = sanitize_name(f"{base}_{coll['name']}_{plan['mod_id']}", 80)
                used_dirs.add(folder)
                for f in coll["files"]:
                    # 组件级清洗：Mod 内部路径可能带 ? : * 等 Windows 非法字符
                    safe = "/".join(
                        sanitize_name(part, 120) for part in str(f["path"]).split("/")
                    )
                    f["file"] = f"{folder}/{safe}"

    entry["base"] = base
    entry["images"] = images
    entry["mods"] = kio_plans
    entry["planned"] = True
    has_work = bool(images) or any(
        (p.get("files") or p.get("collections")) for p in kio_plans
    )
    entry["status"] = "pending" if has_work else ("manual" if entry.get("manual") else "done")


# ---------------------------------------------------------------- 下载


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


def _download_url(
    sess: requests.Session,
    url: str,
    dest: Path,
    *,
    timeout: int,
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
            with sess.get(url, stream=True, timeout=(20, timeout), headers=h) as resp:
                if resp.status_code == 416 and offset:
                    part.unlink(missing_ok=True)      # 残片比文件还大，重来
                    return _download_url(
                        sess, url, dest, timeout=timeout, expected_size=expected_size,
                        is_image=is_image, headers=headers, resume=False,
                    )
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
        except (
            requests.ConnectionError,
            requests.Timeout,
            requests.exceptions.ChunkedEncodingError,
            requests.exceptions.ContentDecodingError,
        ) as exc:
            # 梯子节点抽风是常态；保留 .part，从断点重试几次再放弃
            attempt += 1
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


def _download_kio_file(
    sess: requests.Session,
    kio: KioClient,
    token: str,
    file_plan: dict[str, Any],
    segment_size: int,
    dest: Path,
    *,
    timeout: int,
) -> None:
    """按 16MiB 分段拉取 kio 文件，段 URL 每次现取（带签名、约 1 小时过期）。"""
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
    with part.open("ab" if offset else "wb") as fh:
        while True:
            pos = fh.tell()
            if expected and pos >= expected:
                break
            idx = pos // segment_size
            if idx >= len(segs):
                break
            seg = segs[idx]
            kind = str(seg.get("type") or "")
            data = seg.get("data") or {}
            url = str(data.get("url") or "")
            if not url:
                raise _ApiError("bad_segment", f"第 {idx} 段没有 URL")
            headers = {}
            if kind == "edge":
                url = url.rstrip("/") + "/edge/v4/download"
                headers["Kiosk-SAT"] = str(data.get("token") or "")
            # 单段重试：梯子节点中途断开是常态，从当前 .part 位置续拉这一段
            attempt = 0
            while True:
                within = fh.tell() - idx * segment_size
                h = dict(headers)
                h.setdefault("Accept-Encoding", "identity")
                if within > 0:
                    h["Range"] = f"bytes={within}-"
                try:
                    with sess.get(url, stream=True, timeout=(20, timeout), headers=h) as resp:
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
    sess: requests.Session, entry: dict[str, Any], timeout: int
) -> dict[str, str]:
    """重新拉帖子页，返回 {路径: 新鲜签名 URL}（图片签名约 1 小时过期）。"""
    page = _fetch_post(sess, entry["page_url"], timeout)
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
    grouped: dict[Path, list[tuple[str, str, str, str]]] = {}
    for entry in entries:
        manual = entry.get("manual") or []
        if not manual:
            continue
        day = entry.get("day") or ""
        if not day:
            continue
        day_dir = out_root / day_folder(day, prefix) / source_name
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
                "<p>这些链接需要浏览器里过 Cloudflare Turnstile，或属于站外网盘，"
                "程序不会自动下载。</p><table><tr><th>标题</th><th>作者</th>"
                "<th>链接</th><th>原因</th></tr>" + trs + "</table>"
            )
            (day_dir / "arca_需手动下载.html").write_text(page, encoding="utf-8")
        except OSError as exc:
            log.warning("写待手动清单失败：%s", exc)


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
    try:
        return _process_queue_inner(
            settings, state_path, out_root, notifier,
            max_items=max_items, plan_only=plan_only, source_name=source_name,
        )
    finally:
        _release_run_lock(lock)


def _process_queue_inner(
    settings: ArcaDownloadSettings,
    state_path: Path,
    out_root: Path,
    notifier: Notifier | None = None,
    *,
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

    pending = [
        item for item in state["items"].values()
        if item.get("status") in ("queued", "pending", "partial")
    ]
    pending.sort(key=lambda e: (e.get("date") or "", e.get("created_at") or ""))
    if max_items is not None:
        pending = pending[:max_items]
    if not pending:
        log.info("下载队列为空")
        _write_manual_lists(out_root, state["items"].values(), settings.folder_prefix, source_dir)
        return stats

    log.info("待处理 %d 个 arca 帖子", len(pending))
    sess = make_session(settings.proxy, _UA)
    kio = KioClient(sess, settings.request_timeout)
    nahida = NahidaClient(sess, settings.request_timeout)

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
                _plan_entry(entry, base, settings, sess, kio, nahida, owners)
                for plan in entry.get("mods") or []:
                    if plan.get("type") == "kio" and plan.get("code"):
                        owners.setdefault(("kio", str(plan["code"])), aid)
                    elif plan.get("type") == "nahida" and plan.get("mod_id"):
                        owners.setdefault(("nahida", str(plan["mod_id"])), aid)
                stats["planned"] += 1
                _apply_state(state_path, aid, entry)
                time.sleep(settings.delay_seconds)
            except Exception as exc:  # noqa: BLE001
                entry["attempts"] = int(entry.get("attempts") or 0) + 1
                entry["last_error"] = f"规划失败：{exc}"[:300]
                entry["status"] = "failed" if entry["attempts"] >= settings.retry else "partial"
                _apply_state(state_path, aid, entry)
                stats["failed"] += 1
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
            try:
                fresh = _refresh_media(sess, entry, settings.request_timeout)
            except Exception as exc:  # noqa: BLE001
                fresh = {}
                log.warning("帖子 %s 重新取图失败：%s", aid, exc)
            for img in pending_imgs:
                if _free_gb(out_root) < settings.min_free_gb:
                    low_disk = True
                    break
                url = fresh.get(img.get("src", ""))
                if not url:
                    # 发帖人删了图：重试也没用，跳过而不是把整个帖子拖成 failed
                    img["status"] = "skipped"
                    img["error"] = "图片已不在帖子中"
                    continue
                try:
                    if _download_url(
                        sess, url, day_dir / img["file"],
                        timeout=settings.request_timeout, is_image=True,
                    ):
                        stats["images"] += 1
                        stats["bytes"] += (day_dir / img["file"]).stat().st_size
                    img["status"] = "done"
                    img.pop("error", None)
                    time.sleep(settings.delay_seconds)
                except Exception as exc:  # noqa: BLE001
                    img["status"] = "failed"
                    img["error"] = str(exc)[:200]
                    log.warning("图片下载失败 %s/%s：%s", aid, img.get("file"), exc)
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
                            sess, kio, info["token"], f, int(plan.get("segment_size") or 0),
                            dest, timeout=settings.request_timeout,
                        )
                        f["status"] = "done"
                        f.pop("error", None)
                        stats["files"] += 1
                        stats["bytes"] += dest.stat().st_size if dest.exists() else 0
                        log.info("kio 文件完成：%s（%s）", dest.name, aid)
                        time.sleep(settings.delay_seconds)
                    except Exception as exc:  # noqa: BLE001
                        f["status"] = "failed"
                        f["error"] = str(exc)[:200]
                        log.warning("kio 文件下载失败 %s/%s：%s", aid, f.get("file"), exc)
                if low_disk:
                    break
            elif plan.get("type") == "nahida":
                pending_cols = [
                    c for c in plan.get("collections") or []
                    if any(f.get("status") != "done" for f in c.get("files") or [])
                ]
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
                for coll in pending_cols:
                    for f in coll.get("files") or []:
                        if f.get("status") == "done":
                            continue
                        if _free_gb(out_root) < settings.min_free_gb + (f.get("size") or 0) / GB:
                            low_disk = True
                            break
                        dest = day_dir / f["file"]
                        dest.parent.mkdir(parents=True, exist_ok=True)
                        try:
                            url = nahida.presign(token, f["item_id"])
                            # 不用列表里的 size 校验：个别文件的元数据是压缩前大小
                            if _download_url(
                                sess, url, dest,
                                timeout=settings.request_timeout,
                            ):
                                stats["bytes"] += dest.stat().st_size
                            f["status"] = "done"
                            f.pop("error", None)
                            stats["files"] += 1
                            time.sleep(settings.delay_seconds)
                        except Exception as exc:  # noqa: BLE001
                            f["status"] = "failed"
                            f["error"] = str(exc)[:200]
                            log.warning("nahida 文件下载失败 %s/%s：%s", aid, f.get("file"), exc)
                    if low_disk:
                        break
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
                stats["failed"] += 1
            else:
                entry["status"] = "partial"
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
