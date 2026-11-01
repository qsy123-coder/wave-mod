"""通知：PushPlus（微信推送，主通道）+ Server酱（兜底）。

Server酱 Turbo 免费版每天只有 5 条，一轮新 Mod 就占一次额度，不够用。
PushPlus 免费实名用户每天 200 次，作为主通道；Server酱 只在 PushPlus
失败时兜底（额度宝贵，正好留给真正的故障告警）。
"""

from __future__ import annotations

import logging
from typing import Any

import requests

log = logging.getLogger("notify")

PUSHPLUS = "https://www.pushplus.plus/send"
SERVERCHAN = "https://sctapi.ftqq.com/{key}.send"


class Notifier:
    def __init__(
        self,
        key: str = "",
        token: str = "",
        enabled: bool = True,
        timeout: int = 20,
    ) -> None:
        self.key = (key or "").strip()
        self.token = (token or "").strip()
        self.enabled = enabled and bool(self.key or self.token)
        self.timeout = timeout
        self.session = requests.Session()
        # 绕过系统代理：本机开着 Clash 等系统代理时，requests 会自动读取，
        # 而该代理往往连不通（Windows 注册表里 https 代理被写成 https:// 形式）。
        # PushPlus / Server酱 都是境内服务，直连即可。
        self.session.trust_env = False
        self.session.proxies = {}

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
            resp = self.session.post(
                PUSHPLUS,
                json={
                    "token": self.token,
                    "title": title[:100],
                    "content": desp or title,
                    "template": "markdown",
                },
                timeout=self.timeout,
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
            resp = self.session.post(
                SERVERCHAN.format(key=self.key),
                data={"title": title, "desp": desp},
                timeout=self.timeout,
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
