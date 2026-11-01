"""Patreon JSON:API 客户端（纯 HTTP，无浏览器，**跑在首尔服务器**）。

实测结论（2026-10-13，首尔服务器）：
  - `www.patreon.com/*` —— 任意路径（`/c/<name>/home`、`sitemap.xml`、
    `www.patreon.com/api/posts`）都被 Cloudflare 稳定 403「Just a moment」，
    重试 3 次全是同一个 5699 字节挑战页。**机房 IP 被拦，和 GameBanana 同理。**
  - `api.patreon.com/*` —— **不拦**，返回标准 JSON:API 200。
    注意是 `api.patreon.com`，**不是** `www.patreon.com/api`（后者照样被拦）。
  - 拿 campaign id 的正道是按 vanity 解析：`/campaigns?filter[vanity]=<name>`。
    ⚠️ 别信第三方站（如 graphtreon）页面上的 `creatorId` —— 那是 **user id，
    不是 campaign id**（shaojiang：creatorId=3568680 ≠ campaign=14019274），
    拿错会得到 `ViewForbidden`（"You do not have permission to view this
    campaign"）而不是数据，很容易误判成「这个作者是私密的」。
  - 帖子时间轴：`/posts?filter[campaign_id]=<id>&sort=-published_at`，
    游标在 `meta.pagination.cursors.next`。`page[count]` 实测可到 100。
    **无速率限制响应头**（不像 Nexus 有 X-RL-*）。
  - ⚠️ **别信 `meta.pagination.total`** —— 它会浮动。同一个 campaign 在同一小时内
    实测在 `137` 和 `107` 之间跳，**不等于能翻到的帖子数**。判断"翻完没有"只能看
    **cursor 是否为空**；要对总数，用 campaign 的 `creation_count`
    （shaojiang：`creation_count=107` == 实际翻到 107 条，逐页核对过）。
    踩这个坑会让人误以为"少了 30 条、存在静默截断"，然后白查半天。
  - 匿名只能读**元数据**。campaign 标了 `is_nsfw` 时 `current_user_can_view`
    恒为 False，`included` 里 media 的 `url` 全是 None —— 正文和附件拿不到，
    但 `attributes.image.url` 的**预览图能匿名下载**（实测 PNG 620×419）。

预览图模糊（2026-10-15，首尔服务器实测）：
  - ⚠️ **匿名拿到的预览图是服务端烤糊的**，不是我们下错了。图片 URL 的路径里
    有一段 percent-encoded base64，解出来是 CDN 的变换参数：

        .../post/172406539/3bfff921.../eyJiIjo3MCwidyI6NjIwfQ%3D%3D/1.png?token-hash=...
                                      └─ 解出 = {"b":70,"w":620}   ← b=70 即 70px 模糊

    全量扫 108 条帖子：105 条是 `{"b":70,"w":620}`，2 条 text_only 无图，
    仅 1 条（发帖时没勾 NSFW）是干净的 `{"w":620}`。
  - **绕不过去（都实测过）**：改 base64 段 → 403（`token-hash` 签在路径上）；
    删参数段 → 403；加 `&w=2560` / `&blur=0` 查询参数 → CDN 直接忽略
    （返回字节数与原来一模一样）；伪造 `Referer`/`Origin` → 同样忽略。
    匿名下 `included` 里真原图的 `url` 字段**根本不存在**，不是 None。
  - **解法 = 带有效 `session_id`**：`current_user_can_view` 变 True，
    `image.url` 变 `{"w":620}`（实测 271595 字节，肉眼完全不模糊；
    对照匿名版本只有 48150 字节的一片灰糊）。`thumbnail.original` 更是
    4305848 字节 = 和作者原始上传文件完全一致。
  - ⚠️ **session 过期后接口不报错**，只是悄悄变回糊图 —— 日志、文件完整性、
    轮询时间戳全都正常。这是本项目的**第三种静默故障**，必须靠
    `current_user()` 主动探测（见 poller / healthcheck）。
    登录态判据实测：有效 → 200 + user data；匿名/失效 → **401 LoginRequired**。
"""

from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any, Iterator

import requests

log = logging.getLogger("patreon")

API = "https://api.patreon.com"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)
# JSON:API 版本参数，实测带上才返回标准结构
JSON_API_VERSION = "1.0"


class ApiError(RuntimeError):
    """接口返回异常（被拦、路径变更、作者不存在等）。"""


class AuthRequired(ApiError):
    """未登录 / session 失效（HTTP 401）。

    单独分一个类，是因为 401 是**确定性的状态探测结果**，不是采集故障：
    重试没有意义（而 `_get` 的"非 200 就重试"逻辑会白白重试 3 次），
    而且调用方要能把「登录失效」和「网络抖动」区分开 —— 前者要告警，
    后者不该误报成凭据过期。继承 ApiError 是为了让 poller 里现有的
    `except ApiError` 兜底继续兜得住（向后兼容）。
    """


def display_name(attrs: dict[str, Any], fallback: str = "") -> str:
    """campaign 属性 → 作者显示名。

    用 `name`（如 "EnteleJiang"），**不要用 `creation_name`** ——
    后者是"你在创作什么"的标语（shaojiang 的是 "Creating ZZZ/Wuwa/EF mod."）。
    """
    return str(attrs.get("name") or attrs.get("vanity") or fallback or "").strip()


class PatreonClient:
    def __init__(
        self,
        timeout: int = 30,
        retry: int = 3,
        session_file: str | Path | None = None,
    ) -> None:
        self.timeout = timeout
        self.retry = retry
        self.session = requests.Session()
        # 直连：与其它来源同理，环境里的代理出口反而容易被 Cloudflare 风控
        self.session.trust_env = False
        self.session.headers.update({"User-Agent": UA, "Accept": "application/json"})
        self.session_file = Path(session_file) if session_file else None
        self._session_id = ""
        self._load_session()

    # ---------- 凭据 ----------

    def _load_session(self) -> None:
        """从独立凭据文件读 session_id，写进 cookie jar。

        凭据放**独立文件**（chmod 600）而不是 config.patreon.ini：config 会被
        scp / 备份 / 分享流转，密钥不该跟着它走。

        文件内容就是裸的 session_id 一串，不搞 JSON 不搞键名 —— 出错面最小，
        而且用户从浏览器复制出来时不用再做任何加工。
        """
        if not self.session_file:
            return
        if not self.session_file.exists():
            log.warning("凭据文件不存在：%s（按匿名模式跑，预览图会是模糊的）", self.session_file)
            return
        # 顺手做个权限体检：同机其它用户能读到就等于没保护
        try:
            mode = self.session_file.stat().st_mode & 0o777
            if mode & 0o077:
                log.warning("凭据文件 %s 权限为 %o，建议 chmod 600", self.session_file, mode)
        except OSError:  # noqa: BLE001 - 权限读不到不该拦住采集
            pass
        try:
            sid = self.session_file.read_text(encoding="utf-8").strip()
        except OSError as exc:
            log.warning("凭据文件读取失败：%s", exc)
            return
        # 容错：用户可能整行粘了 Cookie 头或写了 session_id= 前缀
        if sid.startswith("session_id="):
            sid = sid.split("=", 1)[1].strip()
        if not sid:
            log.warning("凭据文件 %s 是空的（按匿名模式跑）", self.session_file)
            return
        self._session_id = sid
        # domain 用 .patreon.com 覆盖 api.patreon.com；path=/ 保证 API 和 CDN 都带上
        self.session.cookies.set("session_id", sid, domain=".patreon.com", path="/")
        log.info("已载入 Patreon session（长度 %d）", len(sid))

    @property
    def session_configured(self) -> bool:
        """是否配置了 session。

        用来区分「压根没配」（匿名，受支持的历史形态）和「配了但已过期」
        （要告警）—— 两者的处理完全不同。
        """
        return bool(self._session_id)

    # ---------- 底座 ----------

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
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
                # 确定性状态，重试无意义，且必须与「网络抖动重试」区分开
                raise AuthRequired("未登录（HTTP 401）—— session 缺失或已失效")
            if resp.status_code == 403:
                raise ApiError(
                    "接口返回 403 —— 可能 Cloudflare 开始拦这个出口 IP，或参数被拒"
                )
            if resp.status_code != 200:
                last = ApiError(f"HTTP {resp.status_code}")
                time.sleep(2 * attempt)
                continue
            try:
                data = resp.json()
            except ValueError as exc:
                raise ApiError("返回非 JSON（可能被拦或路径变更）") from exc
            if "errors" in data:
                detail = data["errors"][0] if data["errors"] else {}
                raise ApiError(f"{detail.get('code_name')}: {detail.get('detail')}")
            return data
        raise ApiError(f"请求失败：{last}")

    # ---------- 登录态 ----------

    def current_user(self) -> dict[str, Any] | None:
        """探测当前登录态：已登录返回用户信息，未登录/失效返回 None。

        返回值是**拍平的** `{"id": ..., "can_see_nsfw": ..., ...}`，而不是原始的
        JSON:API 资源对象 —— 原始结构是 `data.attributes.<字段>`，调用方每处都得
        写 `user["attributes"]["x"]` 很容易漏。实测就踩过一次：直接
        `user.get("can_see_nsfw")` 拿到 None，看着像「账号看不了 NSFW」，
        其实只是层级取错了。

        ⚠️ 返回的字典含 email 等个人信息（接口就这么给的），别整个打进日志。

        实测（2026-10-15，首尔机）：
            有效 session → 200 + data 里带 id/can_see_nsfw=true 等字段
            匿名 / 失效  → 401 + {"errors":[{"code_name":"LoginRequired",...}]}

        ⚠️ 只吞 401。网络异常仍会往上抛 ApiError —— 调用方必须能分辨
        「凭据失效」和「网络挂了」，否则一次抖动就会误报成 session 过期。
        """
        try:
            data = self._get("/current_user", {"json-api-version": JSON_API_VERSION})
        except AuthRequired:
            return None
        resource = data.get("data") or None
        if not resource:
            return None
        attrs = resource.get("attributes") or {}
        # id 放最后，保证不被同名 attribute 覆盖
        return {**attrs, "id": str(resource.get("id") or "")}

    def check_session(self) -> bool:
        """session 是否有效（未配置 = False）。给脚本/巡检当统一判据用。

        注意：网络异常会抛 ApiError 而不是返回 False，以免把网络故障误判成凭据失效。
        """
        return self.current_user() is not None

    # ---------- campaign ----------

    def resolve_campaign(self, vanity: str) -> dict[str, str] | None:
        """vanity（patreon.com/<vanity> 里的那截）→ {id, name}；查不到返回 None。"""
        data = self._get("/campaigns", {"filter[vanity]": vanity, "json-api-version": JSON_API_VERSION})
        items = data.get("data") or []
        if not items:
            return None
        attrs = items[0].get("attributes") or {}
        return {"id": str(items[0].get("id")), "name": display_name(attrs, vanity)}

    def campaign_attrs(self, campaign_id: str) -> dict[str, Any]:
        data = self._get(f"/campaigns/{campaign_id}", {"json-api-version": JSON_API_VERSION})
        return (data.get("data") or {}).get("attributes") or {}

    # ---------- posts ----------

    def posts_page(
        self,
        campaign_id: str,
        count: int = 100,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {
            "filter[campaign_id]": str(campaign_id),
            "json-api-version": JSON_API_VERSION,
            "sort": "-published_at",
            "page[count]": str(count),
        }
        if cursor:
            params["page[cursor]"] = cursor
        return self._get("/posts", params)

    @staticmethod
    def _next_cursor(data: dict[str, Any]) -> str | None:
        pagination = ((data.get("meta") or {}).get("pagination") or {})
        cursors = pagination.get("cursors") or {}
        return cursors.get("next") or None

    def _iter_pages(
        self, campaign_id: str, count: int, max_pages: int
    ) -> Iterator[list[dict[str, Any]]]:
        """从最新往前翻页，逐页产出帖子。到末页或超出上限即停。"""
        cursor: str | None = None
        for page in range(1, max_pages + 1):
            data = self.posts_page(campaign_id, count, cursor)
            posts = data.get("data") or []
            if not posts:
                return
            yield posts
            cursor = self._next_cursor(data)
            if not cursor:
                log.debug("第 %d 页后已到末页", page)
                return

    def collect_new(
        self,
        campaign_id: str,
        seen_ids: set[str],
        max_pages: int = 5,
        count: int = 100,
    ) -> list[dict[str, Any]]:
        """从最新往前翻，直到某一页已无新帖（说明新区已翻完）。

        帖子按 `-published_at` 排序，新帖必在头部；翻到「整页都见过」即可停。
        """
        fresh: list[dict[str, Any]] = []
        for page, posts in enumerate(self._iter_pages(campaign_id, count, max_pages), 1):
            page_fresh = [p for p in posts if str(p.get("id")) not in seen_ids]
            fresh.extend(page_fresh)
            if not page_fresh:
                log.info("第 %d 页已无新帖，回溯结束", page)
                break
            if len(posts) < count:
                break                                   # 最后一页
        return fresh

    def warmup(self, campaign_id: str, max_pages: int = 40, count: int = 100) -> list[dict[str, Any]]:
        """首次运行：把作者的历史帖子**全量**取回（用作基线）。

        与 GameBanana/Nexus 不同 —— 那边首轮只取头部当基线，这里按用户要求
        把全部历史都归档进 CSV（好处：总表一开始就是完整的，便于回看检索），
        但首轮**不推送通知**（见 poller）。
        """
        out: list[dict[str, Any]] = []
        for page, posts in enumerate(self._iter_pages(campaign_id, count, max_pages), 1):
            out.extend(posts)
            log.info("  第 %d 页取到 %d 条（累计 %d）", page, len(posts), len(out))
            if len(posts) < count:
                break
        return out
