"""爱发电（afdian.com）JSON 接口客户端（纯 HTTP，**匿名**，跑在首尔服务器）。

爱发电没有官方开放 API，这里用的是**前端 SPA 自己调的那几个接口** —— 全部匿名可用。

实测结论（2026-10-15，首尔服务器）：

  - 站点是**纯 Vue SPA，没有 SSR**：`https://afdian.com/a/<slug>` 返回的是 19KB 空壳，
    `<title>` 都是"爱发电 · 连接创作者与粉丝的会员制平台"，**HTML 里没有任何帖子数据**。
    所以纯 HTTP 抓页面是白费功夫 —— 必须先定位它前端调的接口。
    定位方法：用项目现成的有头浏览器（`arca_watcher.browser.browser_page` + xvfb）
    打开创作者页，监听 `response` 事件把 `/api/` 调用打出来。见 README「爱发电」一节。

  - **搜索创作者**：`GET /api/creator/list?q=<关键词>&page=N`
    返回 `data.list[]`，每项有 `name` / `url_slug` / `user_id` / `creator.doing`，
    `data.has_more` 表示还有下一页。
    ⚠️ **别用 `/api/creator/search`** —— 那个返回
    `{"ec":40100,"em":"该功能需要登录查看"}`，很容易让人直接判定"爱发电搜不了"。

  - **作者资料**：`GET /api/user/get-profile-by-slug?url_slug=<slug>`
    → `data.user.{user_id, name, url_slug, creator.doing}`

  - **帖子列表**：`GET /api/post/get-list?user_id=<uid>&type=old&publish_sn=<游标>&per_page=5`
    → `data.{list, has_more}`。
    ⚠️ **翻页是游标 `publish_sn`，不是 `page`** —— 传 `page=1/2/3` 会**一直返回同一页**，
    很容易误判成"这个作者只有 5 条帖"。游标取上一页最后一条的 `publish_sn`。
    起始值传 `0`。`per_page` 实测被服务端锁死在 **5**（传 100 也只返回 5 条）。

  - **帖子字段**：`post_id` / `publish_time`(unix 秒) / `title` / `content` /
    `preview_text` / `pics` / `cover` / `is_public` / `min_price` /
    `like_count` / `comment_count` / `type` / `cate`
  - **帖子链接**：`https://afdian.com/p/<post_id>`
    （`/post/<id>` 是"页面不存在"，别用；格式从创作者页上的 `<a href>` 实测得来）

  - ⚠️ **付费帖拿不到正文和图片**：`min_price > 0` 的帖 `is_public=0`，匿名请求下
    `content` / `preview_text` / `pics` 都被抽空（实测抽查 5 条只有 1 条有 `cover`）。
    只能拿到标题、发布时间、帖子链接、点赞评论数 —— 所以这个来源是**纯发现源**，
    和 Patreon 受限期一个性质。
"""

from __future__ import annotations

import logging
import time
from typing import Any, Iterator

import requests

log = logging.getLogger("afdian")

API = "https://afdian.com"
POST_URL = "https://afdian.com/p/{post_id}"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)
# 服务端实测锁死 5 条/页（传更大也只给 5）
PAGE_SIZE = 5


class ApiError(RuntimeError):
    """接口返回异常（被拦、路径变更、作者不存在等）。"""


class AfdianClient:
    def __init__(self, timeout: int = 30, retry: int = 3) -> None:
        self.timeout = timeout
        self.retry = retry
        self.session = requests.Session()
        # 直连：与其它来源同理，环境里的代理出口反而容易被风控
        self.session.trust_env = False
        self.session.headers.update({"User-Agent": UA, "Accept": "application/json"})

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

            if resp.status_code != 200:
                last = ApiError(f"HTTP {resp.status_code}")
                time.sleep(2 * attempt)
                continue
            try:
                data = resp.json()
            except ValueError as exc:
                raise ApiError("返回非 JSON（可能被拦或路径变更）") from exc
            # 爱发电用 `ec` 表达业务错误：200=成功，40100=需要登录
            ec = data.get("ec")
            if ec not in (200, "200", None):
                raise ApiError(f"ec={ec}: {data.get('em')}")
            return data.get("data") or {}
        raise ApiError(f"请求失败：{last}")

    # ---------- 作者 ----------

    def resolve_creator(self, slug: str) -> dict[str, str] | None:
        """slug（afdian.com/a/<slug> 里那截）→ {user_id, name, doing}；查不到返回 None。"""
        data = self._get("/api/user/get-profile-by-slug", {"url_slug": slug})
        user = data.get("user") or {}
        uid = user.get("user_id")
        if not uid:
            return None
        return {
            "user_id": str(uid),
            "name": str(user.get("name") or slug),
            "doing": str((user.get("creator") or {}).get("doing") or ""),
        }

    def search_creators(self, keyword: str, page: int = 1) -> list[dict[str, str]]:
        """按关键词搜作者（给找作者用，运行时不调）。返回 [{name, url_slug, user_id, doing}]。"""
        data = self._get("/api/creator/list", {"q": keyword, "page": str(page)})
        out = []
        for c in data.get("list") or []:
            out.append({
                "name": str(c.get("name") or ""),
                "url_slug": str(c.get("url_slug") or ""),
                "user_id": str(c.get("user_id") or ""),
                "doing": str((c.get("creator") or {}).get("doing") or ""),
            })
        return out

    # ---------- 帖子 ----------

    def posts_page(self, user_id: str, cursor: str | int = 0) -> dict[str, Any]:
        """取一页帖子。`cursor` 传 0 表示从最新开始，之后传上一页最后一条的 `publish_sn`。

        ⚠️ 游标参数名是 `publish_sn` 不是 `page`（见文件头）。多余的空参数照抄前端，
        少传实测也能返回，但保持一致更稳。
        """
        return self._get("/api/post/get-list", {
            "user_id": str(user_id),
            "type": "old",
            "publish_sn": str(cursor),
            "per_page": str(PAGE_SIZE),
            "group_id": "",
            "all": "1",
            "is_public": "",
            "plan_id": "",
            "title": "",
            "name": "",
        })

    def _iter_pages(self, user_id: str, max_pages: int) -> Iterator[list[dict[str, Any]]]:
        """从最新往前翻页，逐页产出帖子。到末页或无 `has_more` 即停。"""
        cursor: str | int = 0
        for page in range(1, max_pages + 1):
            data = self.posts_page(user_id, cursor)
            posts = data.get("list") or []
            if not posts:
                return
            yield posts
            if not data.get("has_more"):
                log.debug("第 %d 页后已到末页", page)
                return
            # ⚠️ 游标没前进就停，否则会无限翻同一页（接口异常时保命用）
            nxt = posts[-1].get("publish_sn")
            if not nxt or str(nxt) == str(cursor):
                log.warning("第 %d 页游标没前进（%s），停止翻页", page, nxt)
                return
            cursor = nxt

    def collect_new(
        self, user_id: str, seen_ids: set[str], max_pages: int = 5
    ) -> list[dict[str, Any]]:
        """从最新往前翻，直到某一页已无新帖（说明新区已翻完）。

        帖子按时间倒序，新帖必在头部；翻到「整页都见过」即可停。
        """
        fresh: list[dict[str, Any]] = []
        for page, posts in enumerate(self._iter_pages(user_id, max_pages), 1):
            page_fresh = [p for p in posts if str(p.get("post_id")) not in seen_ids]
            fresh.extend(page_fresh)
            if not page_fresh:
                log.info("第 %d 页已无新帖，回溯结束", page)
                break
            if len(posts) < PAGE_SIZE:
                break                                   # 最后一页
        return fresh

    def warmup(self, user_id: str, max_pages: int = 40) -> list[dict[str, Any]]:
        """首次运行：把作者的历史帖子**全量**取回（用作基线）。

        与其它来源一致 —— 首轮把全部历史归档进 CSV（总表一开始就完整），
        但**不推送通知**（见 poller）。
        """
        out: list[dict[str, Any]] = []
        for page, posts in enumerate(self._iter_pages(user_id, max_pages), 1):
            out.extend(posts)
            log.info("  第 %d 页取到 %d 条（累计 %d）", page, len(posts), len(out))
            if len(posts) < PAGE_SIZE:
                break
        return out
