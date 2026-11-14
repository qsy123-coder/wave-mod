"""nahida.live 分享链接（``/akasha/link/<id>``）自动下载。

背景：分享链接的 ``POST /akasha/link/<id>`` 必须带 Cloudflare Turnstile 的
``cftoken``。旧实现用 requests 直接 POST，得到 ``cftoken_required``，只能记为
「需手动」。

2026-11-01 复测确认了一条不需要对抗验证码的路径：

  1. 用**真实 Chrome**（有界面，不能用 headless——Turnstile 会一直不通过）
     打开分享页，页面自己弹 Turnstile，通常十几秒自动通过；
  2. 如果分享链接带密码，页面会出现密码输入框；填频道标准密码（``Eldwh``）
     后点确认，同样会自动过 Turnstile；
  3. 页面把结果写进 ``sessionStorage['linkData-<id>']``：``cachedToken`` 是
     后续 API 用的 ``nhd-link-token``，有效期 12 小时；
  4. 拿到 token 之后列目录 / 取下载直链都走 ``api.nahida.live``，不再需要浏览器。

本模块提供 `ChromeLinkResolver`（浏览器取 token，带缓存）和
`NahidaLinkClient`（列目录 + 下载 + 解压）。文件在 CDN 上是 zstd 压缩的，
``compAlg`` 字段说明压缩算法。
"""

from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

from .browser import CF_MARKERS as _CF_MARKERS

log = logging.getLogger("arca.nahida_link")

BASE = "https://api.nahida.live/akasha"
CHUNK = 1 << 20


class ChromeLaunchError(RuntimeError):
    """找不到 Chrome，或者 Chrome/DevTools 起不来。"""


class LinkResolveError(RuntimeError):
    """浏览器没能拿到分享链接的 token。

    ``kind``:
      - ``chrome``   Chrome 不可用（未安装 / 启动失败）
      - ``timeout``  等待 Turnstile / 页面加载超时（可以下一轮重试）
      - ``password`` 链接密码不对
      - ``not_found`` 链接失效
      - ``denied``   Turnstile 明确拒绝
    """

    def __init__(self, kind: str, message: str) -> None:
        super().__init__(message)
        self.kind = kind


class LinkApiError(RuntimeError):
    def __init__(self, code: str, message: str = "", status: int = 0) -> None:
        super().__init__(f"{code}: {message}" if message else code)
        self.code = code
        self.message = message
        self.status = status


@dataclass
class LinkToken:
    token: str
    root_id: str
    root_name: str
    expires_at: float          # epoch 秒


class BrowserResponse:
    """真实 Chrome 里 ``fetch`` 的响应，字段与 ``requests.Response`` 对齐。

    Cloudflare 现在会同时校验 TLS/HTTP2 指纹和 ``cf_clearance``：把浏览器
    的 cookie 拷进 requests 也照样 403（2026-11-14 实测）。所以被拦时改在
    浏览器页面里发同一个请求，再把状态码 / 响应头 / 正文包装成这个对象，
    上层 ``NahidaClient`` / ``NahidaLinkClient`` 完全不用改调用方式。
    """

    def __init__(self, status: int, headers: dict[str, str], text: str) -> None:
        self.status_code = int(status)
        self.headers = requests.structures.CaseInsensitiveDict(headers or {})
        self.text = text or ""
        self.content = self.text.encode("utf-8", "replace")

    def json(self) -> Any:
        return json.loads(self.text)


def find_chrome(explicit: str = "") -> str:
    """按显式配置 → PATH → 常见安装位置 找 Chrome，最后退回 Edge。"""
    candidates: list[str] = []
    if explicit:
        candidates.append(explicit.strip().strip('"'))
    env = os.environ.get("CHROME_PATH", "").strip()
    if env:
        candidates.append(env)
    for name in ("chrome", "chrome.exe", "google-chrome", "google-chrome-stable"):
        found = shutil.which(name)
        if found:
            candidates.append(found)
    for root in (
        os.environ.get("ProgramFiles"),
        os.environ.get("ProgramFiles(x86)"),
        os.environ.get("LocalAppData"),
    ):
        if root:
            candidates.append(os.path.join(root, "Google", "Chrome", "Application", "chrome.exe"))
    for root in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles")):
        if root:
            candidates.append(os.path.join(root, "Microsoft", "Edge", "Application", "msedge.exe"))
    for path in candidates:
        if path and os.path.isfile(path):
            return path
    raise ChromeLaunchError("找不到 Chrome（可在 config.arca.ini [download] chrome_path 指定）")


class ChromeLinkResolver:
    """启动一个真实 Chrome，通过 CDP 读取分享链接的 ``nhd-link-token``。

    Chrome 懒启动：只有真的遇到分享链接才会弹出来；同一个进程内所有链接复用
    同一个窗口。token 由调用方缓存（通常 12 小时），所以每天最多启动一两次。
    """

    def __init__(
        self,
        proxy: str | None,
        password: str,
        *,
        chrome_path: str = "",
        per_link_timeout: int = 180,
    ) -> None:
        self.proxy = proxy
        self.password = password
        self.chrome_path = chrome_path
        self.per_link_timeout = max(30, per_link_timeout)
        self._proc: subprocess.Popen | None = None
        self._ws = None
        self._msg_id = 0
        self._profile = ""
        self._cache: dict[str, LinkToken] = {}
        self._sess: requests.Session | None = None

    def bind_session(self, sess: requests.Session) -> None:
        """绑定后续 API 用的 requests 会话，让 Chrome 的 cf_clearance 自动同步过去。"""
        self._sess = sess

    # ------------------------------------------------------------ 生命周期
    def close(self) -> None:
        try:
            if self._ws is not None:
                self._ws.close()
        except Exception:  # noqa: BLE001
            pass
        self._ws = None
        if self._proc is not None:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=8)
            except Exception:  # noqa: BLE001
                try:
                    self._proc.kill()
                except Exception:  # noqa: BLE001
                    pass
            self._proc = None
        if self._profile:
            for _ in range(3):
                try:
                    shutil.rmtree(self._profile, ignore_errors=False)
                    break
                except OSError:
                    time.sleep(0.5)
            shutil.rmtree(self._profile, ignore_errors=True)
            self._profile = ""

    def __enter__(self) -> "ChromeLinkResolver":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    def _start(self) -> None:
        if self._proc is not None and self._proc.poll() is None and self._ws is not None:
            return
        self.close()
        chrome = find_chrome(self.chrome_path)
        self._profile = tempfile.mkdtemp(prefix="arca_nahida_chrome_")
        port_file = Path(self._profile) / "DevToolsActivePort"
        args = [
            chrome,
            "--remote-debugging-port=0",
            f"--user-data-dir={self._profile}",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-blink-features=AutomationControlled",
            "--remote-allow-origins=*",
            "--disable-sync",
            "--disable-extensions",
            "--window-position=-3200,-3200",
            "--window-size=900,700",
            "about:blank",
        ]
        if self.proxy:
            args.insert(1, f"--proxy-server={self.proxy}")
        log.info("启动 Chrome 解析 nahida 分享链接：%s", chrome)
        try:
            self._proc = subprocess.Popen(
                args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        except OSError as exc:
            raise ChromeLaunchError(f"Chrome 启动失败：{exc}") from exc

        port = 0
        for _ in range(240):                      # 最多 60 秒
            if self._proc.poll() is not None:
                raise ChromeLaunchError(f"Chrome 启动即退出（code {self._proc.returncode}）")
            try:
                raw = port_file.read_text(encoding="ascii", errors="ignore").strip()
                if raw:
                    port = int(raw.splitlines()[0])
                    break
            except (OSError, ValueError):
                pass
            time.sleep(0.25)
        if not port:
            raise ChromeLaunchError("Chrome 没有写出 DevToolsActivePort")

        listing: list[dict[str, Any]] = []
        for _ in range(80):
            try:
                resp = requests.get(f"http://127.0.0.1:{port}/json/list", timeout=2)
                if resp.status_code == 200:
                    listing = resp.json()
                    if listing:
                        break
            except (requests.RequestException, ValueError):
                pass
            time.sleep(0.25)
        pages = [t for t in listing if t.get("type") == "page"]
        if not pages:
            raise ChromeLaunchError("Chrome DevTools 没有可用的页面")

        import websocket                            # websocket-client

        self._ws = websocket.create_connection(
            pages[0]["webSocketDebuggerUrl"], timeout=30, suppress_origin=True
        )
        self._ws.settimeout(60)
        self._send("Runtime.enable")
        self._send("Page.enable")

    # ------------------------------------------------------------ CDP 基础
    def _send(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        assert self._ws is not None
        self._msg_id += 1
        mid = self._msg_id
        self._ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self._ws.recv())
            if msg.get("id") == mid:
                return msg

    def _eval(self, expr: str) -> Any:
        resp = self._send(
            "Runtime.evaluate",
            {"expression": expr, "returnByValue": True, "awaitPromise": True},
        )
        result = (resp.get("result") or {}).get("result") or {}
        return result.get("value")

    def fetch_html(self, url: str, timeout: int = 120) -> str:
        """用真实 Chrome 打开页面，返回渲染后的 HTML。

        arca.live 的帖子页也走 Cloudflare（纯 HTTP 永远停在 ``Just a moment...``），
        但同一个 Chrome profile 过完一次挑战后，本轮后续页面都不再被拦。
        """
        try:
            self._start()
        except ChromeLaunchError as exc:
            raise LinkResolveError("chrome", str(exc)) from exc
        assert self._ws is not None
        try:
            self._send("Page.navigate", {"url": url})
            deadline = time.time() + max(30, timeout)
            while time.time() < deadline:
                html = self._eval(
                    "document.readyState === 'complete'"
                    " ? document.documentElement.outerHTML : null"
                )
                if html and not any(m in html[:8000] for m in _CF_MARKERS):
                    self._sync_clearance()
                    return str(html)
                time.sleep(1.0)
            raise LinkResolveError("timeout", f"浏览器打开页面超时（{timeout}s）：{url}")
        except LinkResolveError:
            raise
        except Exception as exc:  # noqa: BLE001 - CDP/Chrome 中途挂掉
            self.close()
            raise LinkResolveError("timeout", f"浏览器打开页面失败：{exc}") from exc

    # ------------------------------------------------------------ Cloudflare
    def _sync_clearance(self) -> bool:
        """把 Chrome 里 ``.nahida.live`` 的 cf_clearance 拷进绑定会话。

        api.nahida.live 同样有 Cloudflare 挑战；浏览器打开分享页/帖子页拿到的
        clearance 对同一出口 IP 的 API 请求有效。cf_clearance 与 UA 绑定，
        所以会话的 User-Agent 也同步成浏览器的真实 UA。
        """
        if self._ws is None or self._sess is None:
            return False
        try:
            cookies = self._send("Network.getAllCookies")["result"]["cookies"]
            ua = self._eval("navigator.userAgent")
        except Exception as exc:  # noqa: BLE001
            log.debug("读取 Chrome cookies 失败：%s", exc)
            return False
        if ua:
            self._sess.headers["User-Agent"] = str(ua)
        found = False
        for cookie in cookies:
            domain = str(cookie.get("domain") or "")
            if cookie.get("name") != "cf_clearance" or "nahida.live" not in domain:
                continue
            expires = float(cookie.get("expires") or 0)
            if expires and expires <= time.time() + 60:
                continue
            self._sess.cookies.set(
                "cf_clearance",
                str(cookie.get("value") or ""),
                domain=domain,
                path=str(cookie.get("path") or "/"),
            )
            found = True
        return found

    def ensure_clearance(self) -> bool:
        """确保浏览器里有可用的 cf_clearance（必要时打开 nahida.live 触发挑战）。"""
        if self._ws is not None and self._sync_clearance():
            return True
        self.fetch_html("https://nahida.live/", timeout=max(60, self.per_link_timeout))
        return self._sync_clearance()

    # ------------------------------------------------------------ 浏览器内接口请求
    def _page_origin(self) -> str:
        try:
            return str(self._eval("location.origin") or "")
        except Exception:  # noqa: BLE001 - 页面还没加载好
            return ""

    def _ensure_nahida_origin(self) -> None:
        """API 用页面内 fetch：跨域只放行 https://nahida.live 自身，先回到这个源。"""
        if self._page_origin() == "https://nahida.live":
            return
        self.fetch_html("https://nahida.live/", timeout=max(60, self.per_link_timeout))

    def api_fetch(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        timeout: int = 60,
    ) -> BrowserResponse:
        """在真实 Chrome 的 nahida.live 页面里 GET 接口，绕过 Cloudflare。

        ``headers`` 里与浏览器/跨域相关的头（Origin、Referer、User-Agent 等）
        会被丢掉：浏览器自己会填正确的值，手动设置反而会被 fetch 拒绝。
        """
        try:
            self._start()
        except ChromeLaunchError as exc:
            raise LinkResolveError("chrome", str(exc)) from exc
        self._ensure_nahida_origin()
        assert self._ws is not None
        self._ws.settimeout(max(30, timeout))
        safe = {
            k: v for k, v in (headers or {}).items()
            if k.lower() not in _FORBIDDEN_HEADERS
        }
        expr = _JS_API_FETCH % (json.dumps(url), json.dumps(safe))
        try:
            raw = self._eval(expr)
        except Exception as exc:  # noqa: BLE001 - CDP 中途挂掉
            self.close()
            raise LinkResolveError("timeout", f"Chrome 接口请求失败：{exc}") from exc
        if not isinstance(raw, str) or not raw:
            raise LinkResolveError("timeout", f"Chrome 接口请求无返回：{url}")
        if raw.startswith("ERR:"):
            raise LinkResolveError("timeout", f"Chrome 接口请求失败：{raw[4:]}（{url}）")
        try:
            data = json.loads(raw)
            return BrowserResponse(
                int(data.get("status") or 0),
                dict(data.get("headers") or {}),
                str(data.get("text") or ""),
            )
        except (ValueError, TypeError) as exc:
            raise LinkResolveError("timeout", f"Chrome 接口响应无法解析：{raw[:120]}") from exc

    def invalidate(self, link_id: str) -> None:
        self._cache.pop(link_id, None)

    # ------------------------------------------------------------ 解析
    def resolve(self, link_id: str) -> LinkToken:
        cached = self._cache.get(link_id)
        if cached and cached.expires_at > time.time() + 300:
            return cached
        try:
            self._start()
            token = self._resolve_once(link_id)
        except ChromeLaunchError as exc:
            raise LinkResolveError("chrome", str(exc)) from exc
        except LinkResolveError:
            raise
        except Exception as exc:  # noqa: BLE001
            # CDP/Chrome 中途挂掉：下一轮重新启动
            self.close()
            raise LinkResolveError("timeout", f"浏览器解析失败：{exc}") from exc
        self._sync_clearance()
        self._cache[link_id] = token
        return token

    def _resolve_once(self, link_id: str) -> LinkToken:
        assert self._ws is not None
        self._send("Page.navigate", {"url": f"https://nahida.live/akasha/link/{link_id}"})
        deadline = time.time() + self.per_link_timeout
        filled = False
        last = ""
        while time.time() < deadline:
            state = self._eval(_JS_PROBE.format(
                link_id=json.dumps(link_id),
                password=json.dumps(self.password),
            ))
            if isinstance(state, str) and state.startswith("DATA:"):
                data = json.loads(state[5:])
                tok = str(data.get("cachedToken") or "")
                parent = data.get("cachedParent") or {}
                if not tok or not parent.get("id"):
                    raise LinkResolveError("denied", "分享链接返回的数据不完整")
                exp = float(data.get("expirationTime") or 0) / 1000.0
                if exp <= time.time():
                    exp = time.time() + 6 * 3600
                return LinkToken(tok, str(parent["id"]), str(parent.get("name") or ""), exp)
            if state == "PW":
                if not filled:
                    log.info("分享链接 %s 需要密码，填入频道密码", link_id)
                    filled = True
                # 按钮在 Turnstile 弹窗出现后会自动 disabled；重复点只在状态还没
                # 刷进去时有效，不会重复触发。
                self._eval(_JS_CLICK)
                last = "等待 Turnstile…"
            elif isinstance(state, str) and state.startswith("ERR:"):
                text = state[4:]
                if re.search(r"密码|비밀번호|password", text, re.I):
                    raise LinkResolveError("password", "分享链接密码不对")
                raise LinkResolveError("not_found", f"分享链接不可用：{text[:80]}")
            else:
                last = "等待页面/Turnstile…"
            time.sleep(1.0)
        raise LinkResolveError("timeout", f"等待分享链接超时（{self.per_link_timeout}s）：{last}")


# 轮询页面状态。返回：
#   DATA:<json>  sessionStorage 里已有有效 token
#   PW           密码框已出现（需要填密码 + 点确认）
#   ERR:<text>   页面明确报错（密码错/链接失效）
#   WAIT         继续等
_JS_PROBE = r"""
(() => {{
  const key = 'linkData-' + {link_id};
  let raw = null;
  try {{ raw = sessionStorage.getItem(key); }} catch (e) {{ return 'WAIT'; }}
  if (raw) {{
    try {{
      const d = JSON.parse(raw);
      if (d && d.cachedToken && d.cachedParent && d.expirationTime > Date.now()) return 'DATA:' + raw;
      sessionStorage.removeItem(key);
    }} catch (e) {{ sessionStorage.removeItem(key); }}
  }}
  const inp = document.querySelector('input[required]');
  if (inp) {{
    const key2 = Object.keys(inp).find(k => k.startsWith('__reactProps'));
    const p = key2 ? inp[key2] : null;
    if (p && typeof p.onChange === 'function' && p.value !== {password}) {{
      p.onChange({{target: {{value: {password}}}, currentTarget: {{value: {password}}}, persist() {{}}}});
    }} else if (!p) {{
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(inp, {password});
      inp.dispatchEvent(new Event('input', {{bubbles: true}}));
      inp.dispatchEvent(new Event('change', {{bubbles: true}}));
    }}
    return 'PW';
  }}
  const text = (document.body && document.body.innerText || '').slice(0, 400);
  if (/无效|失效|密码不匹配|비밀번호가 일치하지|not_found|invalid_password|expired/i.test(text)) {{
    return 'ERR:' + text;
  }}
  return 'WAIT';
}})()
"""

_JS_CLICK = r"""
(() => {
  const b = [...document.querySelectorAll('button')]
    .find(x => /确认|确定|확인|Confirm|Continue/i.test(x.innerText || ''));
  if (b && !b.disabled) b.click();
  return !!b;
})()
"""

# 浏览器 fetch 不允许脚本设置的头（会被静默丢弃或直接报错）。
_FORBIDDEN_HEADERS = {
    "origin", "referer", "user-agent", "accept-encoding", "content-length",
    "host", "connection", "cookie", "sec-fetch-mode", "sec-fetch-site",
}

# 在 nahida.live 页面里发 GET：%s = URL(JSON)，%s = headers(JSON)。
# 响应头只回传需要的几个（其余对 Cookie 域外的调用方本来就不可见）。
_JS_API_FETCH = r"""
(async () => {
  try {
    const resp = await fetch(%s, {credentials: 'include', headers: %s});
    const text = await resp.text();
    const out = {};
    for (const name of ['x-token', 'content-type', 'retry-after']) {
      const v = resp.headers.get(name);
      if (v !== null) out[name] = v;
    }
    return JSON.stringify({status: resp.status, headers: out, text: text});
  } catch (e) {
    return 'ERR:' + (e && (e.message || e));
  }
})()
"""


# ---------------------------------------------------------------- API 客户端


class NahidaLinkClient:
    """分享链接的列目录 / 取直链 / 下载。``nhd-link-token`` 由浏览器或缓存提供。"""

    def __init__(
        self,
        sess: requests.Session,
        timeout: int = 120,
        resolver: ChromeLinkResolver | None = None,
    ) -> None:
        self.sess = sess
        self.timeout = timeout
        self.resolver = resolver
        self._last_call = 0.0
        # 同 NahidaClient：确认 requests 会被 Cloudflare 拦后就不再白试。
        self._browser_only = False

    def _browser_get(self, url: str, headers: dict[str, str]) -> BrowserResponse:
        if self.resolver is None:
            raise LinkApiError("link_no_browser", "没有可用的 Chrome，无法直连 nahida 接口")
        return self.resolver.api_fetch(url, headers=headers, timeout=self.timeout)

    def _get(
        self,
        url: str,
        *,
        params: dict[str, Any] | None = None,
        token: str,
        min_gap: float = 0.5,
    ) -> BrowserResponse | requests.Response:
        headers = {
            "Origin": "https://nahida.live",
            "Referer": "https://nahida.live/",
            "Accept": "application/json",
            "nhd-link-token": token,
        }
        full = _full_url(url, params)
        resp = None
        for attempt in range(8):
            gap = min_gap - (time.monotonic() - self._last_call)
            if gap > 0:
                time.sleep(gap)
            self._last_call = time.monotonic()
            try:
                if self._browser_only:
                    resp = self._browser_get(full, headers)
                else:
                    resp = self.sess.get(
                        url, params=params, headers=headers, timeout=(20, self.timeout)
                    )
                    if (
                        resp.status_code in (401, 403, 503)
                        and self.resolver is not None
                        and any(m in resp.text[:8000] for m in _CF_MARKERS)
                    ):
                        log.info("nahida API 被 Cloudflare 拦截，后续改在 Chrome 里请求")
                        self._browser_only = True
                        resp = self._browser_get(full, headers)
            except (requests.ConnectionError, requests.Timeout) as exc:
                # 梯子节点抽风（SSL EOF / RemoteDisconnected）是常态，退避重试
                if attempt >= 5:
                    raise
                wait = min(2 * (attempt + 1), 12)
                log.warning("nahida link 连接中断，%ds 后重试：%s", wait, str(exc)[:100])
                time.sleep(wait)
                continue
            if resp.status_code != 429 and resp.status_code < 500:
                return resp
            retry_after = 0
            try:
                data = resp.json()
                retry_after = int(data.get("retryAfter") or data.get("retry_after") or 0)
            except Exception:  # noqa: BLE001
                pass
            if not retry_after:
                try:
                    retry_after = int(resp.headers.get("Retry-After") or 0)
                except ValueError:
                    retry_after = 0
            if not retry_after:
                retry_after = min(2 ** attempt, 20)
            retry_after = min(max(retry_after, 1), 60)
            log.info(
                "nahida link 限流/5xx（HTTP %s），等待 %ds 后重试",
                resp.status_code if resp is not None else "?", retry_after,
            )
            time.sleep(retry_after)
        status = resp.status_code if resp is not None else 0
        raise LinkApiError("link_http", f"持续限流/5xx：{url}", status)

    def content(self, link_id: str, token: str, item_id: str) -> dict[str, Any]:
        url = f"{BASE}/link/{link_id}/content/{item_id}"
        resp = self._get(url, token=token)
        if resp.status_code == 401 or resp.status_code == 403:
            raise LinkApiError("link_unauthorized", resp.text[:200], resp.status_code)
        if resp.status_code != 200:
            raise LinkApiError(
                f"link_content_{resp.status_code}", resp.text[:200], resp.status_code
            )
        data = resp.json()
        if not isinstance(data, dict):
            raise LinkApiError("link_content_bad", str(data)[:200])
        return data

    def walk(self, link_id: str, token: str, root_id: str) -> list[tuple[str, dict[str, Any]]]:
        out: list[tuple[str, dict[str, Any]]] = []
        self._walk(link_id, token, root_id, "", out, set())
        return out

    def _walk(
        self,
        link_id: str,
        token: str,
        item_id: str,
        prefix: str,
        out: list[tuple[str, dict[str, Any]]],
        seen: set[str],
    ) -> None:
        if item_id in seen:
            return
        seen.add(item_id)
        data = self.content(link_id, token, item_id)
        for child in data.get("children") or []:
            name = str(child.get("name") or "未命名")
            path = prefix + name
            if child.get("isDir"):
                self._walk(link_id, token, str(child.get("id")), path + "/", out, seen)
            else:
                out.append((path, child))

    def file_meta(self, link_id: str, token: str, item_id: str) -> dict[str, Any]:
        url = f"{BASE}/file/download"
        resp = self._get(
            url,
            params={
                "uuid": item_id,
                "response": "json",
                "presign": "false",
                "linkId": link_id,
            },
            token=token,
        )
        if resp.status_code == 401 or resp.status_code == 403:
            raise LinkApiError("link_unauthorized", resp.text[:200], resp.status_code)
        if resp.status_code != 200:
            raise LinkApiError(
                f"link_download_{resp.status_code}", resp.text[:200], resp.status_code
            )
        data = resp.json()
        if not isinstance(data, dict) or not data.get("url"):
            raise LinkApiError("link_no_url", str(data)[:200])
        return data

    # ------------------------------------------------------------ 下载
    def download_file(
        self,
        link_id: str,
        token: str,
        file_plan: dict[str, Any],
        dest: Path,
        *,
        timeout: int | None = None,
        read_timeout: int = 30,
        meta: dict[str, Any] | None = None,
        sess: requests.Session | None = None,
    ) -> bool:
        """下载单个文件并解压到 ``dest``。已存在且大小正确时返回 False。

        ``meta``/``sess`` 供并发流水线使用：调用方先串行取好直链（遵守
        0.5s 的接口节奏），再把 ``meta`` 和各自的线程 session 交给下载。
        """
        expected = int(file_plan.get("size") or 0)
        if dest.exists() and (not expected or abs(dest.stat().st_size - expected) <= 1024):
            return False
        dest.parent.mkdir(parents=True, exist_ok=True)
        if meta is None:
            meta = self.file_meta(link_id, token, str(file_plan["item_id"]))
        url = str(meta["url"])
        comp = str(meta.get("compAlg") or "").strip().lower()
        csize = int(meta.get("size") or 0)
        usize = int(meta.get("uncompSize") or 0) or expected or csize

        raw = dest.with_suffix(dest.suffix + ".dlpart")
        part = dest.with_suffix(dest.suffix + ".part")
        try:
            self._download_raw(
                url, raw, csize, timeout or self.timeout,
                read_timeout=read_timeout, sess=sess,
            )
            if comp:
                decompress_file(comp, raw, part)
            else:
                raw.replace(part)
            got = part.stat().st_size
            if usize and abs(got - usize) > 1024:
                raise LinkApiError("size_mismatch", f"期望 {usize}，实际 {got}")
            os.replace(part, dest)
            return True
        except Exception:
            part.unlink(missing_ok=True)
            raise
        finally:
            raw.unlink(missing_ok=True)

    def _download_raw(
        self,
        url: str,
        raw: Path,
        csize: int,
        timeout: int,
        *,
        read_timeout: int = 30,
        sess: requests.Session | None = None,
    ) -> None:
        offset = raw.stat().st_size if raw.exists() else 0
        if csize and offset >= csize:
            return
        attempt = 0
        http = sess or self.sess
        while True:
            offset = raw.stat().st_size if raw.exists() else 0
            headers = {"Accept-Encoding": "identity"}
            if offset:
                headers["Range"] = f"bytes={offset}-"
            try:
                with http.get(
                    url, stream=True, timeout=(20, read_timeout), headers=headers
                ) as resp:
                    if resp.status_code == 416 and offset:
                        raw.unlink(missing_ok=True)
                        continue
                    if resp.status_code not in (200, 206):
                        resp.raise_for_status()
                    mode = "ab" if offset and resp.status_code == 206 else "wb"
                    with raw.open(mode) as fh:
                        for chunk in resp.iter_content(CHUNK):
                            if chunk:
                                fh.write(chunk)
                break
            except (
                requests.ConnectionError,
                requests.Timeout,
                requests.exceptions.ChunkedEncodingError,
                requests.exceptions.ContentDecodingError,
            ) as exc:
                attempt += 1
                if attempt >= 6:
                    raise
                wait = min(3 * attempt, 30)
                log.warning("nahida 直链中断，%ds 后重试：%s", wait, str(exc)[:120])
                time.sleep(wait)
        if csize and abs(raw.stat().st_size - csize) > 1024:
            raw.unlink(missing_ok=True)
            raise LinkApiError(
                "size_mismatch", f"压缩包大小不符：期望 {csize}，实际 {raw.stat().st_size}"
            )


def decompress_file(comp: str, src: Path, dst: Path) -> None:
    """按 nahida 的 ``compAlg`` 把 ``src`` 解压到 ``dst``。

    模组页（``mod/...``）和分享链接（``link/...``）用的是同一种压缩标注：
    列表里的 ``size`` 是原始大小，直链元数据里的 ``size`` 才是压缩后大小。
    """
    comp = (comp or "").strip().lower()
    if comp in ("zstd", "zstandard"):
        _decompress_zstd(src, dst)
    elif comp in ("lz4", "lz4frame"):
        _decompress_lz4(src, dst)
    elif comp in ("gzip", "gz"):
        _decompress_gzip(src, dst)
    else:
        raise LinkApiError("unsupported_comp", f"未知压缩算法：{comp}")


def _decompress_zstd(src: Path, dst: Path) -> None:
    import zstandard as zstd

    dctx = zstd.ZstdDecompressor()
    with src.open("rb") as fin, dst.open("wb") as fout:
        reader = dctx.stream_reader(fin)
        shutil.copyfileobj(reader, fout, CHUNK)


def _decompress_lz4(src: Path, dst: Path) -> None:
    import lz4.frame

    with lz4.frame.open(str(src), "rb") as fin, dst.open("wb") as fout:
        shutil.copyfileobj(fin, fout, CHUNK)


def _decompress_gzip(src: Path, dst: Path) -> None:
    import gzip

    with gzip.open(str(src), "rb") as fin, dst.open("wb") as fout:
        shutil.copyfileobj(fin, fout, CHUNK)


def _full_url(url: str, params: dict[str, Any] | None) -> str:
    """把 query 参数拼进 URL（浏览器 fetch 没有 params 参数）。"""
    if not params:
        return url
    return requests.Request("GET", url, params=params).prepare().url or url


def split_link(url: str) -> tuple[str, str] | None:
    """``https://nahida.live/akasha/link/<id>`` → (link_id, 规范 URL)。"""
    m = re.search(r"https?://nahida\.live/akasha/link/([A-Za-z0-9_-]{4,})", url, re.I)
    if not m:
        return None
    link_id = m.group(1)
    return link_id, f"https://nahida.live/akasha/link/{link_id}"
