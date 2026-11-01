"""有头浏览器会话（服务器上由 xvfb 提供虚拟显示）。

为什么要浏览器：arca.live 走 Cloudflare 反爬，且**不下发可复用的 clearance cookie**，
纯 HTTP 每次都被 403 `Just a moment...` 拦下（已实测）。只有真实浏览器指纹才放行。
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from typing import Iterator

log = logging.getLogger("browser")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)

CF_MARKERS = ("Just a moment", "잠시만", "Checking your browser", "사용자 확인")


class ChallengeTimeout(RuntimeError):
    """Cloudflare 挑战未能在规定时间内通过。"""


@contextmanager
def browser_page(locale: str = "ko-KR", width: int = 1440, height: int = 900) -> Iterator:
    """每次轮询开关一次浏览器：崩溃可自愈，内存也能及时释放。"""
    from playwright.sync_api import sync_playwright

    with sync_playwright() as pw:
        browser = pw.chromium.launch(
            headless=False,                       # 必须：headless 会被 CF 识别
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
        )
        ctx = browser.new_context(
            user_agent=UA,
            locale=locale,
            viewport={"width": width, "height": height},
        )
        ctx.add_init_script(
            "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"
        )
        page = ctx.new_page()
        try:
            yield page
        finally:
            try:
                browser.close()
            except Exception:                     # noqa: BLE001
                pass


def goto(page, url: str, *, timeout: int = 60000, wait_after: float = 6.0) -> None:
    """打开页面并等待 Cloudflare 挑战自行通过。"""
    page.goto(url, wait_until="domcontentloaded", timeout=timeout)
    for attempt in range(20):
        title = page.title()
        if not any(m in title for m in CF_MARKERS):
            break
        if attempt % 3 == 0:
            log.info("等待验证码通过…（%ds）", attempt * 2)
        page.wait_for_timeout(2000)
    else:
        raise ChallengeTimeout(f"Cloudflare 挑战未通过：{page.title()!r}")
    page.wait_for_timeout(int(wait_after * 1000))


def check_ok(page) -> None:
    """确认页面确实加载到了目标内容而非验证页。"""
    if any(m in page.title() for m in CF_MARKERS):
        raise ChallengeTimeout("页面仍停留在验证页")
