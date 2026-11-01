"""爱发电帖子记录 → CSV 行。

匿名能拿到的字段（见 client.py 顶部）：
    post_id / publish_time / title / cover / pics / min_price /
    like_count / comment_count / is_public

拿不到的：付费帖（`min_price > 0`）的正文和配图 —— 匿名请求下 `content` /
`preview_text` / `pics` 都是空的，`cover` 也多数为空。
"""

from __future__ import annotations

import html as html_mod
from datetime import datetime, timedelta, timezone
from typing import Any

from .client import POST_URL

# 爱发电是国内站，publish_time 是**北京时间**的 unix 秒
CST = timezone(timedelta(hours=8))


def pick_image(post: dict[str, Any]) -> str:
    """取一张预览图 URL；没有就返回空串。

    优先级：`cover`（帖子封面，最像"预览图"）→ `pics[0]`。
    ⚠️ 付费帖这两个通常都是空的，属正常，不要当故障。
    """
    cover = str(post.get("cover") or "").strip()
    if cover:
        return cover
    pics = post.get("pics") or []
    if isinstance(pics, list):
        for p in pics:
            if isinstance(p, str) and p.strip():
                return p.strip()
    return ""


def _unix_to_iso(ts: Any) -> str:
    """unix 秒 → `YYYY-MM-DD HH:MM:SS`（按**北京时间**解）。

    ⚠️ 别按 UTC 解：`publish_time` 是北京时间的墙上时间对应的 unix 秒
    （实测 1787571085 = 2026-08-24 19:31，与帖子上显示的一致）。
    按 UTC 解会整体差 8 小时，晚上发的帖会落到前一天，「每日表」就分错了 ——
    输出格式与其它来源保持一致（`YYYY-MM-DD HH:MM:SS`，`日期` 取前 10 位）。
    """
    try:
        return (
            datetime.fromtimestamp(int(ts), tz=CST)
            .strftime("%Y-%m-%d %H:%M:%S")
        )
    except (TypeError, ValueError, OSError):
        return ""


def parse_post(
    post: dict[str, Any],
    source_name: str,
    author: str,
) -> dict[str, str] | None:
    """单条帖子 → 一行；无 post_id 的丢弃。"""
    pid = post.get("post_id")
    if not pid:
        return None

    published = _unix_to_iso(post.get("publish_time"))
    return {
        "日期": published[:10],
        "来源": source_name,
        "名称": html_mod.unescape(str(post.get("title") or "")).strip(),
        "作者": author,
        "价格": str(post.get("min_price") if post.get("min_price") is not None else ""),
        "页面链接": POST_URL.format(post_id=pid),
        "点赞": str(post.get("like_count") if post.get("like_count") is not None else ""),
        "评论": str(post.get("comment_count") if post.get("comment_count") is not None else ""),
        "预览图": "",                                   # 由 gallery.download_images 回填
        "_img_url": pick_image(post),                   # 下划线开头，不写入 CSV
        "mod_id": str(pid),
        "发布时间": published,
    }
