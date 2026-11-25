"""通知：PushPlus（微信推送，主通道）+ Server酱（兜底）。

Server酱 Turbo 免费版每天只有 5 条，一轮新 Mod 就占一次额度，不够用。
PushPlus 免费实名用户每天 200 次，作为主通道；Server酱 只在 PushPlus
失败时兜底（额度宝贵，正好留给真正的故障告警）。
"""

from __future__ import annotations

import logging
import time
from typing import Any

import requests

log = logging.getLogger("notify")

PUSHPLUS = "https://www.pushplus.plus/send"
SERVERCHAN = "https://sctapi.ftqq.com/{key}.send"
# 直连失败后的兜底代理。本机 Clash Verge 混合端口固定 7897；
# 只有直连（含 DNS）失败时才用，境内服务正常时不会碰它。
DEFAULT_PROXY = "http://127.0.0.1:7897"


class Notifier:
    def __init__(
        self,
        key: str = "",
        token: str = "",
        enabled: bool = True,
        timeout: int = 20,
        proxy: str = "",
    ) -> None:
        self.key = (key or "").strip()
        self.token = (token or "").strip()
        self.enabled = enabled and bool(self.key or self.token)
        self.timeout = timeout
        # 兜底代理：优先用调用方传进来的（[net] 探测结果），否则用本机默认端口
        self.proxy = (proxy or "").strip() or DEFAULT_PROXY
        self.session = requests.Session()
        # 绕过系统代理：本机开着 Clash 等系统代理时，requests 会自动读取，
        # 而该代理往往连不通（Windows 注册表里 https 代理被写成 https:// 形式）。
        # PushPlus / Server酱 都是境内服务，直连即可。
        self.session.trust_env = False
        self.session.proxies = {}
        self._proxied: requests.Session | None = None

    def _proxied_session(self) -> requests.Session:
        """直连不可用时的备用会话（懒创建）。"""
        if self._proxied is None:
            s = requests.Session()
            s.trust_env = False
            s.proxies = {"http": self.proxy, "https": self.proxy}
            self._proxied = s
        return self._proxied

    def _post(self, url: str, **kwargs: Any) -> requests.Response:
        """先直连（重试 2 次），仍失败再改走本地代理。

        代理刚启动、系统 DNS 还没恢复时，直连会以 getaddrinfo failed 秒挂；
        走代理由 Clash 自己解析，告警就能发出去。
        """
        last_exc: Exception | None = None
        for attempt in (1, 2):
            try:
                return self.session.post(url, timeout=self.timeout, **kwargs)
            except requests.RequestException as exc:
                last_exc = exc
                log.warning("通知直连失败（%d/2）：%s", attempt, exc)
                if attempt == 1:
                    time.sleep(1)
        try:
            log.warning("通知改走代理 %s 重试", self.proxy)
            return self._proxied_session().post(url, timeout=self.timeout, **kwargs)
        except requests.RequestException as exc:
            log.error("通知走代理也失败：%s", exc)
            if last_exc is not None:
                raise exc from last_exc
            raise

    def send(self, title: str, desp: str = "") -> bool:
        if not self.enabled:
            log.info("通知未启用，跳过：%s", title)
            return False
        if self.token and self._send_pushplus(title, desp):
            return True
        if self.key:
            if self.token:
                log.warning("PushPlus 失败，改用 Server酱 兜底：%s", title)
            return self._send_serverchan(title, desp)
        return False

    def _send_pushplus(self, title: str, desp: str) -> bool:
        try:
            resp = self._post(
                PUSHPLUS,
                json={
                    "token": self.token,
                    "title": title[:100],
                    "content": desp or title,
                    "template": "markdown",
                },
            )
            body: dict[str, Any] = resp.json()
            if body.get("code") == 200:
                log.info("推送成功(PushPlus)：%s", title)
                return True
            log.error("PushPlus 推送失败：%s", body)
            return False
        except (requests.RequestException, ValueError) as exc:
            log.error("PushPlus 推送异常：%s", exc)
            return False

    def _send_serverchan(self, title: str, desp: str) -> bool:
        try:
            resp = self._post(
                SERVERCHAN.format(key=self.key),
                data={"title": title, "desp": desp},
            )
            body: dict[str, Any] = resp.json()
            if body.get("code") == 0:
                log.info("推送成功(Server酱)：%s", title)
                return True
            log.error("Server酱 推送失败：%s", body)
            return False
        except (requests.RequestException, ValueError) as exc:
            log.error("Server酱 推送异常：%s", exc)
            return False

    def send_new_mods(self, rows: list[dict[str, str]], source_name: str, site: str = "") -> bool:
        """把一批新 mod 合并成一条推送。"""
        if not rows:
            return False
        n = len(rows)
        label = source_name or "Mod 站"
        title = f"{label}更新 · 发现 {n} 个新 Mod"
        lines = [f"**{label}** 本轮发现 **{n}** 个新 Mod：\n"]
        for row in rows[:15]:
            lines.append(
                f"- **{row['mod名称']}**（{row['日期']}）\n"
                f"  - 夸克：{row['夸克链接']}"
                + (f"  提取码 `{row['提取码']}`" if row.get("提取码") else "")
                + f"\n  - 页面：{row['网站页面链接']}"
            )
        if n > 15:
            lines.append(f"\n… 另有 {n - 15} 条，详见汇总 CSV。")
        return self.send(title, "\n".join(lines))

    def send_alert(self, title: str, detail: str) -> bool:
        return self.send(f"⚠️ Mod 监测异常 · {title}", detail)
