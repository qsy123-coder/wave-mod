"""arca.live 频道抓取与解析。

已实测的页面结构（每个帖子是一个 <a class="vrow">）：
    <a class="vrow column" href="/b/thingzyoa/140970881?category=WWMI&p=1">
      <span class="vcol col-id">…编号或「공지」…</span>
      <span class="vcol col-title">标题</span>
      <span class="vcol col-author">作者</span>
      <span class="vcol col-time"><time datetime="2026-10-10T11:22:30.000Z">…</time></span>
      <span class="vcol col-view">浏览量</span>
      <span class="vcol col-rate">推荐数</span>
    </a>
置顶公告的 class 含 `notice`，需排除。
"""

from __future__ import annotations

import base64
import logging
import re
from typing import Any

from .browser import check_ok, goto

log = logging.getLogger("arca")

# 分类 slug → 显示名（来自频道页分类下拉；用户只要 Mod 相关三类）
CATEGORIES: dict[str, str] = {
    "modRecom": "모드 추천",      # Mod 推荐
    "WWMI": "명조 모드",          # 鸣潮 Mod
    "enFielMd": "엔드필드 모드",  # 终末地 Mod
}

# 在页面内用 JS 抽取，避免依赖 lxml/bs4 且比正则更稳
_EXTRACT_JS = """
() => {
  const clean = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const out = [];
  for (const a of document.querySelectorAll('a.vrow[href*="/b/"]')) {
    const cls = (a.className || '').toString();
    if (cls.includes('notice')) continue;               // 跳过置顶公告
    const href = a.getAttribute('href') || '';
    const m = href.match(/\\/b\\/[^\\/]+\\/(\\d+)/);
    if (!m) continue;
    const txt = (sel) => { const e = a.querySelector(sel); return e ? clean(e.innerText) : ''; };

    // 标题：只取 .title 内的文字，避开分类徽章与评论数
    const titleEl = a.querySelector('.col-title .title') || a.querySelector('.col-title');
    const title = titleEl ? clean(titleEl.innerText) : '';
    // 该帖自身所属分类（比"从哪个页面抓到"更准确）
    const badge = a.querySelector('.col-title .badges .badge');
    const ownCat = badge ? clean(badge.innerText) : '';

    const t = a.querySelector('time');
    const img = a.querySelector('img');
    let thumb = img ? (img.getAttribute('src') || '') : '';
    if (thumb.startsWith('//')) thumb = 'https:' + thumb;

    out.push({
      article_id: m[1],
      title: title,
      own_category: ownCat,
      author: txt('.col-author'),
      time: t ? (t.getAttribute('datetime') || '') : '',
      views: txt('.col-view'),
      rate: txt('.col-rate'),
      thumb: thumb,
      href: href,
    });
  }
  return out;
}
"""


def parse_iso(ts: str) -> tuple[str, str]:
    """ISO 时间戳 → (YYYY-MM-DD, 原始)。站点给的是 UTC（…Z）。"""
    if not ts:
        return "", ""
    return ts[:10], ts


# ---------- 帖内下载链接提取 ----------
#
# 该站发帖人习惯把下载地址 **base64 编码**后贴在正文里（防爬/防屏蔽），例如：
#     ㅂㅂㄱㄹ aHR0cHM6Ly9uYWhpZGEubGl2ZS9ha2FzaGEvbGluay9JdVk0QmwyNElFRHo=
#     解码 → https://nahida.live/akasha/link/IuY4Bl24IEDz
# 所以要同时收集「明文 URL」和「base64 解码出来的 URL」。

_RE_PLAIN_URL = re.compile(r"https?://[^\s\"'<>)\]}]+")
_RE_B64 = re.compile(r"[A-Za-z0-9+/]{16,}={0,2}")

# 站内资源/图片不算下载链接
_RE_INTERNAL = re.compile(r"(ac-?o?\.arca\.live|arca\.live/(b|api|static|u)/|\.(jpg|jpeg|png|gif|webp|svg|css|js)(\?|$))", re.I)

# 正文容器（按优先级）
_POST_BODY_JS = """
() => {
  for (const s of ['.article-body', '.fr-view', '.article-content']) {
    const e = document.querySelector(s);
    if (e && e.innerText && e.innerText.trim().length > 0) return e.innerText;
  }
  return '';
}
"""


def decode_base64_urls(text: str) -> list[str]:
    """从文本里挑出 base64 片段，解出其中的 URL。"""
    out: list[str] = []
    for m in _RE_B64.finditer(text):
        token = m.group(0)
        # 去掉可能的尾部填充错位，逐个试
        for cand in (token, token.rstrip("=")):
            pad = "=" * (-len(cand) % 4)
            try:
                raw = base64.b64decode(cand + pad, validate=True)
                dec = raw.decode("utf-8")
            except Exception:  # noqa: BLE001 - 不是 base64 就跳过
                continue
            if dec.startswith(("http://", "https://")) and dec.isprintable():
                out.append(dec.strip())
                break
    return out


def extract_links(text: str) -> list[str]:
    """正文 → 去重后的下载链接列表（明文 + base64 解码，排除站内资源）。"""
    urls = list(_RE_PLAIN_URL.findall(text)) + decode_base64_urls(text)
    seen: set[str] = set()
    out: list[str] = []
    for u in urls:
        u = u.rstrip(".,;、。)\"'")
        if not u or u in seen or _RE_INTERNAL.search(u):
            continue
        seen.add(u)
        out.append(u)
    return out


def fetch_post_links(page, base_url: str, article_id: str, *, limit: int = 8) -> str:
    """打开单个帖子，取正文并抽出下载链接（返回空格分隔的字符串，失败返回空串）。"""
    url = f"{base_url}/b/thingzyoa/{article_id}"
    try:
        goto(page, url, wait_after=2.5)
        check_ok(page)
        body = page.evaluate(_POST_BODY_JS) or ""
    except Exception as exc:  # noqa: BLE001 - 单帖失败不应中断整轮
        log.warning("帖子 %s 取正文失败：%s", article_id, exc)
        return ""
    links = extract_links(str(body))[:limit]
    if links:
        log.info("帖子 %s 抽出 %d 个链接", article_id, len(links))
    return " ".join(links)


def fetch_category(page, base_url: str, board: str, slug: str, name: str) -> list[dict[str, str]]:
    """抓取某个分类的第 1 页（按 등록순 = 最新排序）。"""
    url = f"{base_url}/b/{board}?category={slug}"
    goto(page, url)
    check_ok(page)

    items: list[dict[str, Any]] = page.evaluate(_EXTRACT_JS)
    rows: list[dict[str, str]] = []
    seen: set[str] = set()
    for it in items:
        aid = str(it.get("article_id", ""))
        if not aid or aid in seen:
            continue
        seen.add(aid)
        date_str, raw_time = parse_iso(str(it.get("time", "")))
        # 优先用帖子自身分类徽章，取不到再退回"从哪个分类页抓到"
        own_cat = str(it.get("own_category", "")).strip()
        rows.append(
            {
                "日期": date_str,
                "标题": str(it.get("title", "")).strip(),
                "作者": str(it.get("author", "")).strip(),
                "分类": own_cat or name,
                "帖子链接": f"{base_url}{it.get('href', '')}".split("?")[0],
                "浏览量": str(it.get("views", "")).strip(),
                "推荐数": str(it.get("rate", "")).strip(),
                "下载链接": "",                        # 由 fetch_post_links 回填（进正文提取）
                "预览图": "",                          # 由 gallery.download_images 回填
                "_img_url": str(it.get("thumb", "")).strip(),   # 下划线开头，不写入 CSV
                "article_id": aid,
                "发布时间": raw_time,
            }
        )
    log.info("[%s] 抓取到 %d 条（已排除置顶）", name, len(rows))
    return rows
