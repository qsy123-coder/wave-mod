"""GameBanana apiv11 客户端（纯 HTTP，无浏览器）。

实测结论：
  - 家宽直连可用但**很慢**（20~80 KB/s）；走本机 Clash 约 450~620 KB/s（快约 8 倍）
  - 机房代理出口会被 503 拒绝，所以代理由 `proxy.resolve_proxy()` 探测后显式设置，
    不用 requests 的 trust_env（Windows 注册表会把 https 代理写成 https://，握手必挂）
  - `_sSort=new` 才是"最新发布优先"（默认排序是按活跃度，不是发布时间）
  - 每页 15 条，图片在 `_aPreviewMedia._aImages[0]`，另有 100/220/530 三个尺寸变体
"""

from __future__ import annotations

import logging
import time
from typing import Any

import requests

log = logging.getLogger("gamebanana")

API = "https://gamebanana.com/apiv11"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
)
PER_PAGE = 15  # 接口固定每页 15 条


class ApiError(RuntimeError):
    """接口返回异常（被封、路径变更等）。"""


class GameBananaClient:
    def __init__(
        self,
        game_id: int = 20357,
        timeout: int = 30,
        retry: int = 3,
        proxy: str | None = None,
    ) -> None:
        self.game_id = game_id
        self.timeout = timeout
        self.retry = retry
        self.session = requests.Session()
        # 不让 requests 自己去读系统代理：注册表把 https 代理写成 https://127.0.0.1:7897，
        # 会去和本地明文代理做 TLS 握手（ProxyError / FileNotFoundError）。
        # 代理由 proxy.resolve_proxy() 探测后**显式**设置。
        self.session.trust_env = False
        self.session.proxies = {}
        if proxy:
            self.session.proxies = {"http": proxy, "https": proxy}
            log.info("GameBanana 走代理：%s", proxy)
        self.session.headers.update({"User-Agent": UA, "Accept": "application/json"})

    def _get(self, url: str, **kwargs: Any) -> requests.Response:
        """代理挂了就自动降级直连（直连也能用，只是慢）。"""
        try:
            return self.session.get(url, **kwargs)
        except requests.exceptions.ProxyError as exc:
            if not self.session.proxies:
                raise
            log.warning("代理不可用，本轮改用直连：%s", str(exc)[:150])
            self.session.proxies = {}
            return self.session.get(url, **kwargs)

    def subfeed(self, page: int = 1, sort: str = "new") -> dict[str, Any]:
        url = f"{API}/Game/{self.game_id}/Subfeed"
        params = {"_nPage": page, "_sSort": sort}
        last: Exception | None = None
        for attempt in range(1, self.retry + 1):
            try:
                resp = self._get(url, params=params, timeout=self.timeout)
            except requests.RequestException as exc:
                last = exc
                log.warning("请求异常（第 %d/%d 次）：%s", attempt, self.retry, exc)
                time.sleep(2 * attempt)
                continue

            if resp.status_code == 503 or "error code" in resp.text[:80]:
                raise ApiError(
                    "接口返回 503/风控错误 —— 当前代理出口可能被 GameBanana 封了；"
                    "可把 config.gb.ini 的 [net] proxy 改成 off 走直连"
                )
            if resp.status_code != 200:
                last = ApiError(f"HTTP {resp.status_code}")
                time.sleep(2 * attempt)
                continue
            try:
                data = resp.json()
            except ValueError as exc:
                raise ApiError("返回非 JSON（可能被 Cloudflare 拦截）") from exc
            if "_aRecords" not in data:
                raise ApiError(f"返回结构异常，键：{list(data)[:6]}")
            return data
        raise ApiError(f"请求失败：{last}")

    def mod_profile(self, mod_id: str | int) -> dict[str, Any]:
        """单个 Mod 的详情页数据（下载原图/附件用）。

        关键字段：`_aPreviewMedia._aImages[]._sFile`（原图文件名）、
        `_aFiles[]._sDownloadUrl` / `_nFilesize`。
        """
        url = f"{API}/Mod/{mod_id}/ProfilePage"
        last: Exception | None = None
        for attempt in range(1, self.retry + 1):
            try:
                resp = self._get(url, timeout=self.timeout)
            except requests.RequestException as exc:
                last = exc
                log.warning("Mod %s 详情请求异常（第 %d/%d 次）：%s", mod_id, attempt, self.retry, exc)
                time.sleep(2 * attempt)
                continue
            if resp.status_code == 404:
                raise ApiError(f"Mod {mod_id} 不存在（404）")
            if resp.status_code != 200:
                last = ApiError(f"Mod {mod_id} 详情 HTTP {resp.status_code}")
                time.sleep(2 * attempt)
                continue
            try:
                return resp.json()
            except ValueError as exc:
                raise ApiError(f"Mod {mod_id} 详情返回非 JSON") from exc
        raise ApiError(f"Mod {mod_id} 详情请求失败：{last}")

    @staticmethod
    def _keep(rec: dict[str, Any], model_types: set[str]) -> bool:
        """Subfeed 里混着 Question/Tutorial/Tool 等非 mod 内容，按需过滤。"""
        return not model_types or str(rec.get("_sModelName", "")) in model_types

    def collect_new(
        self,
        seen_ids: set[str],
        model_types: set[str] | None = None,
        max_pages: int = 20,
    ) -> list[dict[str, Any]]:
        """从最新往前翻页，直到某一页**过滤后**已无新条目（说明新区已翻完）。

        注意：过滤必须发生在"是否已见"判断之前 —— 否则被过滤掉的
        Question/Tutorial 永远不会进 seen_ids，会导致每轮都翻满 max_pages。
        """
        fresh: list[dict[str, Any]] = []
        for page in range(1, max_pages + 1):
            recs = self.subfeed(page).get("_aRecords") or []
            if not recs:
                break
            kept = [r for r in recs if self._keep(r, model_types or set())]
            page_fresh = [r for r in kept if str(r.get("_idRow")) not in seen_ids]
            fresh.extend(page_fresh)
            if not page_fresh:
                log.info("第 %d 页已无新提交，回溯结束", page)
                break
            if len(recs) < PER_PAGE:
                break                                  # 最后一页
        return fresh

    def warmup(
        self,
        model_types: set[str] | None = None,
        pages: int = 5,
    ) -> list[dict[str, Any]]:
        """首次运行：只取头部若干页，全部标记为已见，避免把 6000+ 历史当成新 mod。"""
        out: list[dict[str, Any]] = []
        for page in range(1, pages + 1):
            recs = self.subfeed(page).get("_aRecords") or []
            if not recs:
                break
            out.extend(r for r in recs if self._keep(r, model_types or set()))
        return out
