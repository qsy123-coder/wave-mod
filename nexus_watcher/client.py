"""Nexus Mods API v1 客户端（纯 HTTP，无浏览器）。

实测结论（2026-10-12，首尔服务器）：
  - `https://www.nexusmods.com/...` 网页 → 403 Cloudflare，机房 IP 被拦
  - `https://api.nexusmods.com/...` **不拦**，无 key 时干净地返回 401
  - 限流：响应头带 `X-RL-Hourly-Remaining` / `X-RL-Daily-Remaining`，超限返回 429

`latest_added` 每次固定返回**最新 10 个** mod（按创建时间倒序），故轮询间隔
只要短于「10 个 mod 被发布的时间」，就不会漏。鸣潮分区日均远低于此。
"""

from __future__ import annotations

import logging
import time
from typing import Any

import requests

log = logging.getLogger("nexus")

API = "https://api.nexusmods.com/v1"
# Nexus 要求 UA 可识别，默认的 python-requests UA 容易被拒
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)
LATEST_ADDED_LIMIT = 10  # 接口固定条数，改不了


class ApiError(RuntimeError):
    """接口返回异常（key 失效、被限流、路径变更等）。"""


class NexusClient:
    def __init__(self, domain: str, api_key: str, timeout: int = 30, retry: int = 3) -> None:
        self.domain = domain
        self.api_key = api_key
        self.timeout = timeout
        self.retry = retry
        self.session = requests.Session()
        # 直连：与 GameBanana 同理，经系统/环境里的代理出口反而容易被风控
        self.session.trust_env = False
        self.session.headers.update(
            {"apikey": api_key, "User-Agent": UA, "Accept": "application/json"}
        )
        self._categories: dict[int, str] = {}

    # ---------- 底座 ----------

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{API}{path}"
        last: Exception | None = None
        for attempt in range(1, self.retry + 1):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
            except requests.RequestException as exc:
                last = exc
                log.warning("请求异常（第 %d/%d 次）：%s", attempt, self.retry, exc)
                time.sleep(2 * attempt)
                continue

            if resp.status_code == 401:
                raise ApiError("API key 无效或未填写（HTTP 401）—— 见 config.nexus.ini")
            if resp.status_code == 403:
                raise ApiError("被拒绝（HTTP 403）—— key 可能被封禁")
            if resp.status_code == 429:
                last = ApiError("被限流（HTTP 429）")
                log.warning("触发限流（第 %d/%d 次），退避重试", attempt, self.retry)
                time.sleep(10 * attempt)
                continue
            if resp.status_code != 200:
                last = ApiError(f"HTTP {resp.status_code}")
                time.sleep(2 * attempt)
                continue

            remaining = resp.headers.get("X-RL-Hourly-Remaining")
            if remaining is not None and int(remaining) <= 5:
                log.warning("本小时配额仅剩 %s 次", remaining)
            try:
                return resp.json()
            except ValueError as exc:
                raise ApiError("返回非 JSON（可能被 Cloudflare 拦截）") from exc
        raise ApiError(f"请求失败：{last}")

    # ---------- 业务 ----------

    def latest_added(self) -> list[dict[str, Any]]:
        """最新发布的 mod（固定 10 条，按创建时间倒序）。"""
        data = self._get(f"/games/{self.domain}/mods/latest_added.json")
        if isinstance(data, list):
            return data
        # 单条时接口会返回 object 而非数组
        return [data] if isinstance(data, dict) and data.get("mod_id") else []

    def category_map(self) -> dict[int, str]:
        """category_id → 分类名。取自 /games/{domain}.json，进程内缓存一次。"""
        if self._categories:
            return self._categories
        info = self._get(f"/games/{self.domain}.json")
        for cat in info.get("categories") or []:
            try:
                self._categories[int(cat["category_id"])] = str(cat.get("name", ""))
            except (KeyError, TypeError, ValueError):
                continue
        log.info("载入 %d 个分类名", len(self._categories))
        return self._categories
