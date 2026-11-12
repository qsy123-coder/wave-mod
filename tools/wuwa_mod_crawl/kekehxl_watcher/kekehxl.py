"""可可站 HTTP 客户端：登录（纯 HTTP，无浏览器）+ WooCommerce REST API 读取。

站点结构（已实测）：
  - WordPress + WooCommerce，mod 以 /product/<slug>/ 形式发布
  - 全站受 WordPress "Password Protected" 插件保护，需 POST 密码换 cookie
  - 首尔服务器出口 IP 不触发 Cloudflare 验证码，纯 HTTP 即可（无需 Playwright）
"""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger("kekehxl")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)


class AuthError(RuntimeError):
    """登录失败或会话失效。"""


class SiteChangedError(RuntimeError):
    """站点结构/接口发生变化。"""


class KekehxlClient:
    def __init__(
        self,
        base_url: str,
        password: str,
        cookie_jar: str | Path = "cookies.json",
        timeout: int = 30,
        retry: int = 3,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.password = password
        self.cookie_jar = Path(cookie_jar)
        self.timeout = timeout
        self.retry = retry

        self.session = requests.Session()
        # 一律绕过系统代理：本机开着 Clash 等系统代理时 requests 会自动读取并连接失败
        self.session.trust_env = False
        self.session.proxies = {}
        self.session.headers.update({"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"})
        self._tag_cache: dict[int, str] = {}
        self._load_cookies()

    # ---------- cookie 持久化 ----------

    def _load_cookies(self) -> None:
        if not self.cookie_jar.exists():
            return
        try:
            data = json.loads(self.cookie_jar.read_text(encoding="utf-8"))
            self.session.cookies.update(data)
            log.info("已载入 %d 个 cookie", len(data))
        except (json.JSONDecodeError, OSError) as exc:
            log.warning("cookie 读取失败，将重新登录：%s", exc)

    def _save_cookies(self) -> None:
        try:
            self.cookie_jar.write_text(
                json.dumps(self.session.cookies.get_dict(), ensure_ascii=False, indent=1),
                encoding="utf-8",
            )
        except OSError as exc:
            log.warning("cookie 保存失败：%s", exc)

    def has_session(self) -> bool:
        """cookie jar 里**有没有**会话 cookie。

        ⚠️ 这只回答「在不在」，**不代表还有效**。`cookies.json` 里的旧 cookie 会让它
        永远为真 —— 2026-10-15 就是栽在这上面：站点密码被换了，`login()` 每次都失败，
        但 `has_session()` 因为旧 cookie 还在而返回 True，日志一路报「登录成功」，
        结果连续失败 156 轮（26 小时）都没人看出来。
        现在 `login()` 会自己识别失败信号并抛错（见下），别再只靠这个函数判断。
        """
        return "bid_1_password_protected_auth" in self.session.cookies

    # ---------- 登录 ----------

    def login(self) -> None:
        """用站点密码换会话 cookie。纯 HTTP，无需浏览器。"""
        login_url = f"{self.base_url}/?password-protected=login"

        # ⚠️ 必须先 GET **登录页本身**再 POST，不能只 GET 首页。
        # 实测（2026-10-15）：站点同时有 kekehxl.org 和 www.kekehxl.org 两个域，
        # 先 GET 首页时插件设的 wordpress_test_cookie 会落在另一个域上，POST 时
        # requests **根本不带这个 cookie**（实测 `Cookie: None`），插件于是报
        # 「Cookies are blocked or not supported」—— 这个假错误会把真正的失败原因
        # （密码不对）一起盖住，非常难查。先 GET 登录页后，该错误立刻消失。
        try:
            self.session.get(login_url, timeout=self.timeout)
        except requests.RequestException as exc:
            raise AuthError(f"打开登录页失败：{exc}") from exc

        payload = {
            "password_protected_pwd": self.password,
            "password_protected_cookie_test": "1",
            "password-protected": "login",
            "redirect_to": f"{self.base_url}/",
        }
        log.info("正在登录 %s ...", self.base_url)
        try:
            resp = self.session.post(
                login_url,
                data=payload,
                timeout=self.timeout,
                allow_redirects=True,
            )
        except requests.RequestException as exc:
            raise AuthError(f"登录请求失败：{exc}") from exc

        # ⚠️ 逐个识别失败信号，**不要**只看 has_session()。
        # 旧实现的问题是：cookie jar 里残留着旧的会话 cookie，`has_session()` 恒真，
        # 于是「登录失败」被记成「登录成功」，故障可以静默潜伏好几天。
        if "sgcaptcha" in resp.text or "Robot Challenge" in resp.text:
            raise AuthError(
                "触发验证码（sgcaptcha）——该出口 IP 已被站点风控，需改用浏览器方案或更换出口"
            )
        if "Incorrect Password" in resp.text:
            raise AuthError(
                "站点密码不正确 —— 密码很可能已被站点更换，"
                "需更新 config.ini 的 site.password（实测：拿故意写错的密码去试，"
                "响应与当前配置的密码**字节完全相同**）"
            )
        if "Cookies are blocked" in resp.text:
            raise AuthError(
                "插件报「Cookies are blocked」—— 登录页的测试 cookie 没带上（正常流程"
                "会先 GET 登录页，见上面的注释；走到这里说明站点流程又变了）"
            )
        if "password_protected_pwd" in resp.text:
            raise AuthError("登录后仍返回密码表单 —— 登录未生效（密码或流程已变）")
        if not self.has_session():
            raise AuthError(
                f"登录未获得会话 cookie（HTTP {resp.status_code}），密码可能已变更"
            )
        self._save_cookies()
        log.info("登录成功，cookie 已保存")

    def ensure_login(self) -> None:
        if not self.has_session():
            self.login()

    # ---------- API ----------

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        url = f"{self.base_url}{path}"
        last_exc: Exception | None = None
        for attempt in range(1, self.retry + 1):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
            except requests.RequestException as exc:
                last_exc = exc
                log.warning("请求异常（第 %d/%d 次）：%s", attempt, self.retry, exc)
                time.sleep(2 * attempt)
                continue

            if resp.status_code in (401, 403) or "sgcaptcha" in resp.text[:600]:
                log.warning("会话失效或触发风控（HTTP %s），尝试重新登录", resp.status_code)
                self.login()
                continue
            if resp.status_code == 404:
                raise SiteChangedError(f"接口 404：{url}（站点结构可能已变）")
            if resp.status_code != 200:
                last_exc = SiteChangedError(f"HTTP {resp.status_code}: {url}")
                time.sleep(2 * attempt)
                continue
            try:
                return resp.json()
            except ValueError as exc:
                raise SiteChangedError(f"返回非 JSON：{url}") from exc

        raise SiteChangedError(f"请求失败：{url}（{last_exc}）")

    def fetch_products(
        self,
        category_id: int,
        after: str | None = None,
        per_page: int = 100,
    ) -> list[dict[str, Any]]:
        """读取指定分类下的商品，按发布日期倒序。

        带 ``_embed=wp:featuredmedia`` 以一次请求内联缩略图信息（避免每件商品再查一次 media）。
        """
        params: dict[str, Any] = {
            "product_cat": category_id,
            "orderby": "date",
            "order": "desc",
            "per_page": per_page,
            "_embed": "wp:featuredmedia",
        }
        if after:
            params["after"] = after
        data = self._get("/wp-json/wp/v2/product", params)
        if not isinstance(data, list):
            raise SiteChangedError("返回结构异常：期望 list")
        return data

    def fetch_tag_map(self, force: bool = False) -> dict[int, str]:
        """product_tag id → 名称 映射（用于把角色标签 ID 还原成中文名）。"""
        if self._tag_cache and not force:
            return self._tag_cache
        mapping: dict[int, str] = {}
        for page in range(1, 4):  # 最多 3 页，足够
            data = self._get(
                "/wp-json/wp/v2/product_tag",
                {"per_page": 100, "page": page, "_fields": "id,name"},
            )
            if not isinstance(data, list) or not data:
                break
            for item in data:
                mapping[int(item["id"])] = str(item.get("name", "")).strip()
            if len(data) < 100:
                break
        if mapping:
            self._tag_cache = mapping
        return mapping
