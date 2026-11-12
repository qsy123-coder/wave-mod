"""Clash Verge / mihomo 本地控制接口（Windows 命名管道）。

Clash Verge 默认只开命名管道 ``\\.\\pipe\\verge-mihomo``，不监听 TCP 9090/9097。
这里用 ctypes 直接读写管道，按 mihomo 的 HTTP API 发请求，实现：

  - 读取当前 GLOBAL / 规则链选中的节点
  - 测一组节点的延迟（直接拿目标站点当探测 URL）
  - 切换节点，并在切换后用 127.0.0.1:7897 真实 HTTPS 验证

下载器在「代理端口通但 HTTPS 出不去」时调用 :func:`switch_to_working_node`：
优先切到能访问目标站点的节点，切不了再退回直连。
"""

from __future__ import annotations

import ctypes
import json
import logging
import os
import re
import time
import urllib.parse
from ctypes import wintypes
from pathlib import Path
from typing import Any, Iterable

import requests

log = logging.getLogger("gamebanana.clash")

_PIPE_CANDIDATES = (
    r"\\.\pipe\verge-mihomo",
    r"\\.\pipe\clash-verge",
    r"\\.\pipe\mihomo",
)
_TCP_CANDIDATES = ("http://127.0.0.1:9090", "http://127.0.0.1:9097")

# 这些 type 是策略组/内置项，不是真正的出口节点
_GROUP_TYPES = {
    "selector", "urltest", "fallback", "loadbalance", "relay",
    "compatible", "pass", "reject", "rejectdrop", "direct", "dns",
}
_INFO_NAME = re.compile(
    r"剩余流量|到期|过期|官网|订阅|流量|重置|套餐|客服|通知|expire|traffic",
    re.I,
)

_CREATE_FILE_ERRORS = {2, 3, 53}          # file/path not found, network path
_PIPE_CLOSED = {109, 232, 233}            # broken pipe / no process / pipe closing
_ERROR_MORE_DATA = 234

INVALID_HANDLE = wintypes.HANDLE(-1).value

_endpoint: tuple[str, str, str] | None = None   # (kind, target, secret)


class ClashError(RuntimeError):
    """Clash 控制接口不可用或返回异常。"""


# ---------------------------------------------------------------- 命名管道


def _kernel32():
    k = ctypes.WinDLL("kernel32", use_last_error=True)
    k.CreateFileW.argtypes = [
        wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, wintypes.LPVOID,
        wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE,
    ]
    k.CreateFileW.restype = wintypes.HANDLE
    k.ReadFile.argtypes = [
        wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID,
    ]
    k.ReadFile.restype = wintypes.BOOL
    k.WriteFile.argtypes = [
        wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD), wintypes.LPVOID,
    ]
    k.WriteFile.restype = wintypes.BOOL
    k.PeekNamedPipe.argtypes = [
        wintypes.HANDLE, wintypes.LPVOID, wintypes.DWORD,
        ctypes.POINTER(wintypes.DWORD), ctypes.POINTER(wintypes.DWORD),
        ctypes.POINTER(wintypes.DWORD),
    ]
    k.PeekNamedPipe.restype = wintypes.BOOL
    k.CloseHandle.argtypes = [wintypes.HANDLE]
    k.CloseHandle.restype = wintypes.BOOL
    return k


_K32 = _kernel32() if os.name == "nt" else None


def _pipe_transact(pipe: str, method: str, path: str,
                   body: bytes | None = None, timeout: float = 15.0) -> bytes:
    """向命名管道发一条 HTTP 请求，读到 EOF 返回原始响应。"""
    if _K32 is None:
        raise ClashError("命名管道只在 Windows 可用")
    handle = _K32.CreateFileW(
        pipe, 0x80000000 | 0x40000000, 0, None, 3, 0, None,   # RW, OPEN_EXISTING
    )
    if handle == INVALID_HANDLE or not handle:
        err = ctypes.get_last_error()
        raise ClashError(f"打不开 Clash 管道 {pipe}（错误 {err}）")

    try:
        lines = [
            f"{method} {path} HTTP/1.1",
            "Host: localhost",
            "Accept: application/json",
            "Connection: close",
        ]
        if body is not None:
            lines.append("Content-Type: application/json")
            lines.append(f"Content-Length: {len(body)}")
        raw_req = ("\r\n".join(lines) + "\r\n\r\n").encode("latin-1") + (body or b"")

        written = wintypes.DWORD(0)
        ok = _K32.WriteFile(
            handle, raw_req, len(raw_req), ctypes.byref(written), None
        )
        if not ok or written.value != len(raw_req):
            raise ClashError(
                f"写 Clash 管道失败（错误 {ctypes.get_last_error()}）"
            )

        chunks: list[bytes] = []
        total = 0
        buf = ctypes.create_string_buffer(65536)
        deadline = time.time() + max(1.0, timeout)
        while time.time() < deadline:
            # 先 Peek 再 Read：ReadFile 在没数据时会一直阻塞，Peek 让我们能按时超时
            avail = wintypes.DWORD(0)
            ok = _K32.PeekNamedPipe(
                handle, None, 0, None, ctypes.byref(avail), None
            )
            if not ok:
                err = ctypes.get_last_error()
                if err in _PIPE_CLOSED:
                    break
                raise ClashError(f"读 Clash 管道失败（错误 {err}）")
            if avail.value == 0:
                time.sleep(0.02)
                continue
            got = wintypes.DWORD(0)
            ok = _K32.ReadFile(
                handle, buf, min(65536, max(1, avail.value)),
                ctypes.byref(got), None,
            )
            if ok and got.value:
                chunks.append(buf.raw[: got.value])
                total += got.value
                if total > 8 * 1024 * 1024:
                    break
                continue
            err = ctypes.get_last_error() if not ok else 0
            if not ok and err == _ERROR_MORE_DATA:
                continue
            if not ok and err in _PIPE_CLOSED:
                break
            if not ok:
                raise ClashError(f"读 Clash 管道失败（错误 {err}）")
            break                                   # got == 0
        return b"".join(chunks)
    finally:
        _K32.CloseHandle(handle)


def _dechunk(data: bytes) -> bytes:
    out: list[bytes] = []
    pos = 0
    while True:
        line_end = data.find(b"\r\n", pos)
        if line_end < 0:
            break
        size_text = data[pos:line_end].split(b";", 1)[0].strip()
        try:
            size = int(size_text, 16)
        except ValueError:
            break
        pos = line_end + 2
        if size <= 0:
            break
        out.append(data[pos:pos + size])
        pos += size + 2
    return b"".join(out)


def _parse_response(raw: bytes) -> tuple[int, dict[str, str], bytes]:
    head, sep, rest = raw.partition(b"\r\n\r\n")
    if not sep:
        raise ClashError("Clash 返回了空响应")
    lines = head.split(b"\r\n")
    try:
        status = int(lines[0].split()[1])
    except (IndexError, ValueError) as exc:
        raise ClashError(f"无法解析 Clash 响应：{lines[0][:80]!r}") from exc
    headers: dict[str, str] = {}
    for line in lines[1:]:
        key, _, value = line.partition(b":")
        if key:
            headers[key.decode("latin-1").strip().lower()] = (
                value.decode("latin-1").strip()
            )
    if headers.get("transfer-encoding", "").lower() == "chunked":
        body = _dechunk(rest)
    elif headers.get("content-length", "").isdigit():
        body = rest[: int(headers["content-length"])]
    else:
        body = rest
    return status, headers, body


# ---------------------------------------------------------------- 控制器发现


def _clash_config_secret() -> str:
    appdata = os.environ.get("APPDATA") or ""
    if not appdata:
        return ""
    base = Path(appdata) / "io.github.clash-verge-rev.clash-verge-rev"
    for name in ("config.yaml", "clash-verge.yaml"):
        path = base / name
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        m = re.search(r"^secret:\s*['\"]?([^'\"\s#]+)", text, re.M)
        if m:
            return m.group(1)
    return ""


def _discover() -> tuple[str, str, str]:
    """返回 (kind, target, secret)；kind 为 pipe 或 tcp。"""
    global _endpoint
    if _endpoint is not None:
        return _endpoint
    errors: list[str] = []
    if os.name == "nt":
        for pipe in _PIPE_CANDIDATES:
            try:
                raw = _pipe_transact(
                    pipe, "GET", "/version", timeout=2.0
                )
                status, _headers, _body = _parse_response(raw)
                if status == 200:
                    _endpoint = ("pipe", pipe, "")
                    return _endpoint
                errors.append(f"{pipe}: HTTP {status}")
            except ClashError as exc:
                errors.append(f"{pipe}: {exc}")
    secret = _clash_config_secret()
    headers = {"Authorization": f"Bearer {secret}"} if secret else {}
    for base in _TCP_CANDIDATES:
        try:
            resp = requests.get(base + "/version", headers=headers, timeout=2)
            if resp.ok:
                _endpoint = ("tcp", base, secret)
                return _endpoint
            errors.append(f"{base}: HTTP {resp.status_code}")
        except requests.RequestException as exc:
            errors.append(f"{base}: {exc}")
    raise ClashError("找不到 Clash 控制接口：" + "；".join(errors[-3:]))


def _request_json(path: str, method: str = "GET",
                  payload: dict[str, Any] | None = None,
                  timeout: float = 15.0,
                  _retry: bool = True) -> Any:
    global _endpoint
    try:
        kind, target, secret = _discover()
        body = (
            json.dumps(payload, ensure_ascii=False).encode("utf-8")
            if payload is not None else None
        )
        if kind == "pipe":
            raw = _pipe_transact(target, method, path, body, timeout=timeout)
            status, _headers, data = _parse_response(raw)
        else:
            headers = {"Content-Type": "application/json"}
            if secret:
                headers["Authorization"] = f"Bearer {secret}"
            resp = requests.request(
                method, target + path, data=body, headers=headers, timeout=timeout
            )
            status, data = resp.status_code, resp.content
        if status >= 400:
            raise ClashError(f"Clash API {method} {path} → HTTP {status}: "
                             f"{data[:200].decode('utf-8', 'replace')}")
        if not data:
            return {}
        try:
            return json.loads(data.decode("utf-8"))
        except ValueError as exc:
            raise ClashError(f"Clash API 返回非 JSON：{data[:120]!r}") from exc
    except ClashError:
        # Clash 重启后管道路径/端口可能变化，清掉缓存重新发现一次
        if _retry and _endpoint is not None:
            _endpoint = None
            return _request_json(path, method, payload, timeout, _retry=False)
        raise


# ---------------------------------------------------------------- 节点


def _is_leaf_node(proxies: dict[str, Any], name: str) -> bool:
    info = proxies.get(name)
    if not isinstance(info, dict):
        return False
    if str(info.get("type") or "").lower() in _GROUP_TYPES:
        return False
    if name.upper() in ("DIRECT", "REJECT", "REJECT-DROP"):
        return False
    if _INFO_NAME.search(name):
        return False
    return True


def _pick_group(proxies: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """GLOBAL 模式用 GLOBAL；规则模式用最后一条 MATCH 指向的策略组。"""
    cfg = _request_json("/configs") or {}
    mode = str(cfg.get("mode") or "").lower()
    if mode == "global" and "GLOBAL" in proxies:
        return "GLOBAL", proxies["GLOBAL"]
    try:
        rules = _request_json("/rules") or {}
        for rule in reversed(rules.get("rules") or []):
            if str(rule.get("type") or "").lower() == "match":
                name = str(rule.get("proxy") or rule.get("payload") or "")
                if name and name in proxies:
                    info = proxies[name]
                    if str(info.get("type") or "").lower() in (
                        "selector", "urltest", "fallback", "loadbalance"
                    ):
                        return name, info
                break
    except ClashError:
        pass
    if "GLOBAL" in proxies:
        return "GLOBAL", proxies["GLOBAL"]
    for name, info in proxies.items():
        if str(info.get("type") or "").lower() == "selector" and info.get("all"):
            return name, info
    raise ClashError("找不到可切换的策略组")


def _group_delays(group: str, probe_url: str, timeout_ms: int) -> dict[str, int]:
    query = urllib.parse.urlencode({"url": probe_url, "timeout": timeout_ms})
    data = _request_json(
        f"/group/{urllib.parse.quote(group, safe='')}/delay?{query}",
        timeout=timeout_ms / 1000 + 8,
    )
    if not isinstance(data, dict):
        raise ClashError("策略组测速返回格式异常")
    return {
        str(name): int(delay)
        for name, delay in data.items()
        if isinstance(delay, (int, float)) and delay > 0
    }


def _node_delay(name: str, probe_url: str, timeout_ms: int) -> int:
    query = urllib.parse.urlencode({"url": probe_url, "timeout": timeout_ms})
    data = _request_json(
        f"/proxies/{urllib.parse.quote(name, safe='')}/delay?{query}",
        timeout=timeout_ms / 1000 + 5,
    )
    try:
        return int((data or {}).get("delay") or 0)
    except (TypeError, ValueError):
        return 0


def _url_limit(url: str) -> int:
    """GameBanana 要求真实 200/30x；arca 的 403 是 Cloudflare 挑战，算连上了。"""
    return 400 if "gamebanana.com" in url else 500


def _https_ok(proxy_url: str, url: str, timeout: float = 10.0,
              max_status: int = 500) -> bool:
    sess = requests.Session()
    sess.trust_env = False
    sess.proxies = {"http": proxy_url, "https": proxy_url}
    try:
        resp = sess.get(
            url,
            timeout=(4, timeout),
            allow_redirects=False,
            headers={"Range": "bytes=0-0", "Accept-Encoding": "identity"},
        )
        return 200 <= resp.status_code < max_status
    except requests.RequestException:
        return False
    finally:
        sess.close()


def select_node(group: str, name: str) -> None:
    _request_json(
        f"/proxies/{urllib.parse.quote(group, safe='')}",
        method="PUT",
        payload={"name": name},
    )


def current_selection() -> dict[str, Any]:
    """给看板/调试用：当前模式、策略组、选中节点。"""
    proxies = (_request_json("/proxies") or {}).get("proxies") or {}
    group, info = _pick_group(proxies)
    cfg = _request_json("/configs") or {}
    return {
        "mode": cfg.get("mode"),
        "group": group,
        "node": info.get("now"),
        "type": info.get("type"),
        "count": len(info.get("all") or []),
    }


def measure_speed(
    proxy_url: str,
    url: str,
    sample_bytes: int = 2 << 20,
    timeout: float = 8.0,
) -> int:
    """通过代理拉一小段 Range，返回 bytes/s。慢节点会在 timeout 内只拉到很少的数据。"""
    sess = requests.Session()
    sess.trust_env = False
    sess.proxies = {"http": proxy_url, "https": proxy_url}
    start = time.time()
    got = 0
    try:
        with sess.get(
            url,
            stream=True,
            timeout=(5, timeout),
            headers={
                "Range": f"bytes=0-{max(0, sample_bytes - 1)}",
                "Accept-Encoding": "identity",
            },
            allow_redirects=True,
        ) as resp:
            resp.raise_for_status()
            for piece in resp.iter_content(65536):
                if not piece:
                    continue
                got += len(piece)
                if got >= sample_bytes or time.time() - start >= timeout:
                    break
    except requests.RequestException:
        pass
    finally:
        sess.close()
    elapsed = time.time() - start
    return int(got / elapsed) if elapsed > 0 else 0


def ensure_fast_node(
    proxy_url: str,
    probe_url: str,
    *,
    min_kbps: int = 300,
    sample_bytes: int = 2 << 20,
    max_candidates: int = 3,
    timeout: float = 8.0,
) -> dict[str, Any]:
    """下载前测一下当前节点的**持续吞吐**，太慢就换到更快的节点。

    注意：延迟低 ≠ 下载快。实测香港节点延迟 120ms，但持续下载只有 40–120KB/s；
    换到新加坡节点后能到 3MB/s。所以这里按真实下载速度选，不按延迟。
    """
    try:
        sel = current_selection()
    except ClashError as exc:
        return {"ok": False, "error": str(exc)}

    current = str(sel.get("node") or "")
    threshold = max(1, min_kbps) * 1024
    speed = measure_speed(proxy_url, probe_url, sample_bytes, timeout)
    log.info("下载前测速：%s → %d KB/s", current or "—", speed // 1024)
    if speed >= threshold:
        return {"ok": True, "switched": False, "node": current, "speed": speed}

    proxies = (_request_json("/proxies") or {}).get("proxies") or {}
    try:
        group, info = _pick_group(proxies)
    except ClashError as exc:
        return {"ok": False, "error": str(exc)}
    all_names = [str(x) for x in (info.get("all") or [])]
    candidates = [
        name for name in all_names
        if name != current and _is_leaf_node(proxies, name)
    ]

    delays: dict[str, int] = {}
    try:
        delays = _group_delays(group, "https://gamebanana.com/", 5000)
    except Exception:  # noqa: BLE001 - 测速失败就按原顺序
        pass
    if delays:
        candidates = [n for n in candidates if delays.get(n, 0) > 0]
        candidates.sort(key=lambda n: delays[n])
    candidates = candidates[: max(1, max_candidates)]

    best_node, best_speed = current, speed
    for name in candidates:
        try:
            select_node(group, name)
        except ClashError as exc:
            log.warning("测速切换节点 %s 失败：%s", name, exc)
            continue
        time.sleep(0.4)
        got = measure_speed(proxy_url, probe_url, sample_bytes, timeout)
        log.info("节点测速：%s → %d KB/s", name, got // 1024)
        if got > best_speed:
            best_node, best_speed = name, got
        # 已经明显够快就不用继续折腾用户网络
        if got >= max(threshold * 2, speed * 3):
            break

    if best_node and best_node != current:
        try:
            select_node(group, best_node)
        except ClashError as exc:
            log.warning("切到快速节点 %s 失败：%s", best_node, exc)
            best_node = current
        else:
            log.warning(
                "下载节点太慢，已自动切换：%s（%d KB/s）→ %s（%d KB/s）",
                current or "—", speed // 1024, best_node, best_speed // 1024,
            )
            return {
                "ok": True,
                "switched": True,
                "previous": current,
                "previous_speed": speed,
                "node": best_node,
                "speed": best_speed,
            }

    # 试了一圈都不如原来 / 切换失败：恢复原节点
    if current:
        try:
            select_node(group, current)
        except ClashError:
            pass
    return {"ok": False, "switched": False, "node": current, "speed": best_speed}


def switch_to_working_node(
    probe_urls: str | Iterable[str],
    proxy_url: str = "http://127.0.0.1:7897",
    *,
    timeout_ms: int = 5000,
    max_try: int = 4,
) -> dict[str, Any]:
    """切到一个能访问 `probe_urls` 的节点。

    先用策略组测速拿到候选（测速 URL 直接用目标站点），按延迟排序；
    再逐个切换并用真实代理请求复验。失败会恢复原节点。
    """
    urls = [probe_urls] if isinstance(probe_urls, str) else list(probe_urls)
    urls = [u for u in urls if u]
    if not urls:
        return {"ok": False, "error": "没有探测 URL"}

    proxies = (_request_json("/proxies") or {}).get("proxies") or {}
    group, info = _pick_group(proxies)
    previous = str(info.get("now") or "")
    all_names = [str(x) for x in (info.get("all") or [])]
    candidates = [
        name for name in all_names
        if name != previous and _is_leaf_node(proxies, name)
    ]
    if not candidates:
        return {
            "ok": False, "group": group, "previous": previous,
            "error": "策略组里没有可切换的出口节点",
        }

    delays: dict[str, int] = {}
    try:
        delays = _group_delays(group, urls[0], timeout_ms)
    except Exception as exc:  # noqa: BLE001 - 整体测速失败就退化为逐个测速
        log.warning("策略组整体测速失败，改为逐个测速：%s", exc)
    if delays:
        ordered = [
            name for name in candidates
            if delays.get(name, 0) > 0
        ]
        ordered.sort(key=lambda n: delays[n])
    else:
        # 没有整体测速结果：最多试 max_try*3 个，避免 100+ 节点逐个等超时
        ordered = candidates[: max_try * 3]
        alive: list[str] = []
        for name in ordered:
            try:
                delay = _node_delay(name, urls[0], timeout_ms)
            except Exception:  # noqa: BLE001 - 单个节点测速失败就跳过
                continue
            if delay > 0:
                delays[name] = delay
                alive.append(name)
        ordered = sorted(alive, key=lambda n: delays[n])

    if not ordered:
        return {
            "ok": False, "group": group, "previous": previous,
            "error": "没有节点能访问探测地址（节点全部超时）",
        }

    log.info(
        "自动换节点：策略组 %s 共 %d 个候选，当前 %s",
        group, len(ordered), previous or "—",
    )
    tried: list[str] = []
    for name in ordered[:max_try]:
        tried.append(name)
        try:
            select_node(group, name)
        except ClashError as exc:
            log.warning("切换节点 %s 失败：%s", name, exc)
            continue
        time.sleep(0.4)
        if all(
            _https_ok(proxy_url, url, max_status=_url_limit(url)) for url in urls
        ):
            log.warning(
                "已自动切换 Clash 节点：%s → %s（延迟 %sms）",
                previous or "—", name, delays.get(name, "?"),
            )
            return {
                "ok": True,
                "group": group,
                "previous": previous,
                "node": name,
                "delay": delays.get(name),
                "tried": tried,
            }
        log.warning("节点 %s 切换后仍访问不了目标，继续试下一个", name)

    # 全部失败：尽量切回原节点，别把用户网络留在一个更差的节点上
    if previous:
        try:
            select_node(group, previous)
        except ClashError:
            pass
    return {
        "ok": False,
        "group": group,
        "previous": previous,
        "tried": tried,
        "error": f"试了 {len(tried)} 个节点都访问不了目标站点",
    }
