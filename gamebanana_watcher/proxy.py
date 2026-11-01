"""本机代理探测（GameBanana 走梯子比直连快约 8 倍）。

⚠️ Windows 的坑：系统代理注册表里 `https` 一项经常被写成
`https://127.0.0.1:7897`。requests 会把它当成「到代理本身也要 TLS」，
于是和本地明文代理握手失败，报 `ProxyError ... FileNotFoundError`。
这里统一把回环地址的 https:// 纠正成 http://，并做 TCP 探活。

`auto` 的探测顺序：
  1. 系统代理（注册表，Clash Verge / v2rayN 开启「系统代理」时会写）
  2. 常见本地端口 7897 / 7890 / 10809 / 10808 / 7891
都探不通就返回 None（直连）。直连也能用，只是慢。
"""

from __future__ import annotations

import logging
import os
import socket
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import requests

log = logging.getLogger("gamebanana.proxy")

DEFAULT_PORTS = (7897, 7890, 10809, 10808, 7891, 8889)
_LOOPBACK = {"127.0.0.1", "localhost", "::1"}
_DIRECT_VALUES = {"off", "none", "direct", "false", "0", "no"}

# 代理客户端常见安装位置（Clash Verge 本机实测在 D:\Clash Verge）
DEFAULT_APP_PATHS = (
    r"D:\Clash Verge\clash-verge.exe",
    r"C:\Program Files\Clash Verge\clash-verge.exe",
    r"C:\Program Files (x86)\Clash Verge\clash-verge.exe",
    r"%LOCALAPPDATA%\Programs\Clash Verge\clash-verge.exe",
    r"C:\Program Files\Clash Verge\Clash Verge.exe",
)

_CREATE_NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)


def normalize_proxy(raw: str | None) -> str | None:
    """把 `127.0.0.1:7897` / `https://127.0.0.1:7897` 这类值纠正成可用的 URL。"""
    text = (raw or "").strip()
    if not text:
        return None
    if "://" not in text:
        text = "http://" + text
    parts = urllib.parse.urlsplit(text)
    scheme = (parts.scheme or "http").lower()
    host = parts.hostname
    if not host:
        return None
    # 注册表 bug：本地代理被标成 https，实际是明文 HTTP CONNECT
    if scheme == "https" and host in _LOOPBACK:
        scheme = "http"
    if scheme not in ("http", "https", "socks5", "socks5h", "socks4"):
        scheme = "http"
    return urllib.parse.urlunsplit((scheme, parts.netloc, "", "", ""))


def tcp_alive(proxy: str, timeout: float = 1.5) -> bool:
    """只验证端口能不能连上（不验证认证/线路）。"""
    parts = urllib.parse.urlsplit(proxy)
    host = parts.hostname
    if not host:
        return False
    port = parts.port or (443 if parts.scheme == "https" else 80)
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def find_proxy_app(explicit: str | None = None) -> Path | None:
    """找到代理客户端可执行文件；explicit 优先。"""
    if explicit:
        path = Path(os.path.expandvars(explicit)).expanduser()
        return path if path.is_file() else None
    for raw in DEFAULT_APP_PATHS:
        path = Path(os.path.expandvars(raw))
        if path.is_file():
            return path
    return None


def _process_running(exe_name: str) -> bool:
    """代理客户端是否已经在跑（避免重复拉起/空等）。"""
    try:
        r = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {exe_name}", "/NH"],
            capture_output=True, text=True, timeout=10, creationflags=_CREATE_NO_WINDOW,
        )
        return exe_name.lower() in (r.stdout or "").lower()
    except Exception:  # noqa: BLE001 - 查进程失败不致命
        return False


def launch_proxy_app(exe: Path) -> bool:
    """后台拉起代理客户端。

    GUI 进程必须脱离任务计划的隐藏控制台，否则 wscript 退出后会被一起收掉。
    """
    flags = 0
    if sys.platform == "win32":
        flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(
            subprocess, "CREATE_NEW_PROCESS_GROUP", 0
        )
    try:
        subprocess.Popen(
            [str(exe)],
            cwd=str(exe.parent),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            close_fds=True,
            creationflags=flags,
        )
        log.info("代理客户端未运行，已自动启动：%s", exe)
        return True
    except OSError as exc:
        log.warning("拉起代理客户端失败（%s）：%s", exe, exc)
        return False


def _probe_any(candidates: list[str | None]) -> str | None:
    seen: set[str] = set()
    for candidate in candidates:
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        if tcp_alive(candidate):
            return candidate
    return None


def make_session(proxy: str | None = None, user_agent: str | None = None) -> requests.Session:
    """统一的 requests.Session：不读系统代理，代理显式传入。"""
    sess = requests.Session()
    sess.trust_env = False
    sess.proxies = {}
    if proxy:
        sess.proxies = {"http": proxy, "https": proxy}
    if user_agent:
        sess.headers.update({"User-Agent": user_agent})
    return sess


def _candidates() -> list[str | None]:
    """系统代理 + 常见本地端口。"""
    candidates: list[str | None] = []
    try:
        system = urllib.request.getproxies()
        # https 优先：requests 对 https 请求用 https 那一项
        for key in ("https", "http"):
            if system.get(key):
                candidates.append(normalize_proxy(system[key]))
    except Exception as exc:  # noqa: BLE001 - 读注册表失败不应影响采集
        log.debug("读取系统代理失败：%s", exc)
    candidates += [f"http://127.0.0.1:{port}" for port in DEFAULT_PORTS]
    return candidates


def _wait_for_proxy(candidates: list[str | None], seconds: float) -> str | None:
    """等代理端口起来（客户端冷启动要几秒）。"""
    deadline = time.time() + max(0.0, seconds)
    while True:
        found = _probe_any(candidates)
        if found or time.time() >= deadline:
            return found
        time.sleep(1.0)


def resolve_proxy(
    value: str = "auto",
    *,
    autostart: bool = False,
    app_path: str | None = None,
    wait_seconds: float = 40.0,
) -> str | None:
    """按配置解析代理；返回 `http://127.0.0.1:7897` 这样的 URL 或 None。

    `autostart=True` 时，探测不到端口会**自动拉起代理客户端**再等端口就绪，
    这样计划任务无人值守也能保证走代理（直连只有 20~80KB/s）。
    """
    text = (value or "auto").strip()
    if text.lower() in _DIRECT_VALUES:
        return None

    candidates = _candidates()
    configured: str | None = None
    if text.lower() not in ("", "auto"):
        configured = normalize_proxy(text)
        if configured and tcp_alive(configured):
            return configured
        log.warning("配置的代理不可用（%s），改为自动探测", text)
        # 继续走自动探测

    found = _probe_any(candidates)
    if found:
        return found

    if not autostart:
        return None

    # 客户端没开（或刚被关掉）：拉起来再等端口
    exe = find_proxy_app(app_path)
    if not exe:
        log.warning("未检测到代理客户端（可在配置 [net] 里指定 app_path），走直连")
        return None
    # 端口不通但进程在：可能正在启动，或核心没起来；先等一小会儿
    wait = wait_seconds if not _process_running(exe.name) else min(wait_seconds, 10.0)
    if not _process_running(exe.name) and not launch_proxy_app(exe):
        return None
    probe_list = ([configured] if configured else []) + candidates
    found = _wait_for_proxy(probe_list, wait)
    if found:
        log.info("代理已就绪：%s", found)
        return found
    log.warning("等了 %d 秒代理端口仍不可用，走直连", int(wait))
    return None
