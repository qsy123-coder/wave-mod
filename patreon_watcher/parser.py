"""Patreon 帖子记录 → CSV 行。

帖子的可用字段（匿名能读到的）：
    id / title / published_at / url / like_count / comment_count /
    post_type / image.{url,thumb_url,large_url}

拿不到的：正文、附件下载链接 —— campaign 标了 `is_nsfw` 时
`current_user_can_view` 恒为 False，`included` 里 media 的 `url` 全是 None。
"""

from __future__ import annotations

import base64
import html as html_mod
import json
import urllib.parse
from typing import Any

# 预览图尺寸优先级：url 是 620 宽的常规图，够清晰又不太大
_IMG_SIZE_KEYS = ("url", "large_url", "thumb_url")


def _decode_transform(seg: str) -> dict[str, Any] | None:
    """把 URL 路径里的一段当作 base64 解成 JSON 对象；解不出返回 None。

    path 里绝大多数段（post id、uuid、文件名）都解不出 JSON，属正常，
    所以这里静默失败、只找那段像参数的。
    """
    seg = urllib.parse.unquote(seg)
    if not seg:
        return None
    for decoder in (base64.urlsafe_b64decode, base64.b64decode):
        try:
            raw = decoder(seg + "=" * (-len(seg) % 4))
            obj = json.loads(raw.decode("utf-8"))
        except Exception:  # noqa: BLE001 - 解不出就是普通路径段
            continue
        if isinstance(obj, dict):
            return obj
    return None


def blur_amount(url: str) -> int:
    """解析图片 URL 里 CDN 变换参数中的模糊半径 `b`；解析不出返回 0。

    实测（2026-10-15，见 client.py 顶部结论）：
        - 匿名 / 帖子标了 NSFW：该段解出 {"b":70,"w":620}，b=70 → 70px 模糊
        - 带有效 session：      {"w":620}，b 缺省 = 0 = 清晰

    ⚠️ CDN **忽略** `&w=2560` / `&blur=0` 这类查询参数（返回字节数与原来
    一模一样），改 base64 段或整段删除又会因 `token-hash` 签名不匹配而 403 ——
    所以「糊不糊」**只能**读这段 base64 判断。

    ⚠️ 别用文件大小当判据：糊图 48KB、清晰图 272KB 只是这两个方案的巧合，
    换个尺寸就不成立了。
    """
    for part in urllib.parse.urlparse(url).path.split("/"):
        obj = _decode_transform(part)
        if obj and ("b" in obj or "w" in obj):
            try:
                return int(obj.get("b") or 0)
            except (TypeError, ValueError):
                return 0
    return 0


def image_is_blurred(url: str) -> bool:
    """图片 URL 是否带模糊参数。空 URL 不算模糊（「没图」是另一套逻辑）。"""
    return bool(url) and blur_amount(url) > 0


def pick_image(attrs: dict[str, Any]) -> str:
    """取一张预览图 URL。

    纯文本公告帖（`text_only`）可能没有 image，或 image 里 url 为 None ——
    实测确实存在（"Regarding ... Mod Texture Failure"），故逐级回落。
    """
    image = attrs.get("image") or {}
    for key in _IMG_SIZE_KEYS:
        url = str(image.get(key) or "").strip()
        if url:
            return url
    return ""


def parse_post(
    post: dict[str, Any],
    source_name: str,
    author: str,
) -> dict[str, str] | None:
    """单条帖子 → 一行；无 id 的丢弃。"""
    pid = post.get("id")
    if not pid:
        return None

    attrs = post.get("attributes") or {}
    published = str(attrs.get("published_at") or "")

    return {
        "日期": published[:10],
        "来源": source_name,
        "名称": html_mod.unescape(str(attrs.get("title") or "")).strip(),
        "作者": author,
        "类型": str(attrs.get("post_type") or "").strip(),
        "页面链接": str(attrs.get("url") or "").strip(),
        "点赞": str(attrs.get("like_count") if attrs.get("like_count") is not None else ""),
        "评论": str(attrs.get("comment_count") if attrs.get("comment_count") is not None else ""),
        "预览图": "",                                   # 由 gallery.download_images 回填
        "_img_url": pick_image(attrs),                  # 下划线开头，不写入 CSV
        "mod_id": str(pid),
        "发布时间": published,
    }


def parse_all(
    posts: list[dict[str, Any]],
    source_name: str,
    author: str,
) -> list[dict[str, str]]:
    rows = []
    for post in posts:
        row = parse_post(post, source_name, author)
        if row:
            rows.append(row)
    return rows
