"""从商品 JSON 抽取汇总所需的元数据。

站点商品的网盘信息全部写在 excerpt.rendered（HTML）里，形如：
    MEGA盘： <a ...>点击获取</a>
    百度盘： <a ...>点击获取</a>
    夸克盘： <a href="https://pan.quark.cn/s/b78091c13d26">点击获取</a>
    解压码 ：kekehxl   提取码 ：keke
"""

from __future__ import annotations

import html as html_mod
import re
from typing import Any

# 夸克分享链接（本站固定形如 https://pan.quark.cn/s/xxxxxxxxxxxx）
RE_QUARK = re.compile(r"https?://pan\.quark\.cn/s/[A-Za-z0-9]+")
# 提取码 / 解压码（中英文冒号都兼容，允许中间有空格）
RE_EXTRACT_CODE = re.compile(r"提取码\s*[:：]\s*([A-Za-z0-9]+)")
RE_UNZIP_CODE = re.compile(r"解压码\s*[:：]\s*([A-Za-z0-9]+)")


def clean_html(raw: str) -> str:
    """HTML → 纯文本（保留链接文本，便于阅读与正则匹配）。"""
    text = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", raw)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>", "\n", text)
    text = re.sub(r"(?s)<[^>]+>", " ", text)
    text = html_mod.unescape(text)
    text = text.replace("\xa0", " ")
    return re.sub(r"[ \t]+", " ", text).strip()


def extract_quark_url(raw_excerpt: str) -> str:
    m = RE_QUARK.search(raw_excerpt)
    return m.group(0) if m else ""


def featured_image_url(item: dict[str, Any]) -> str:
    """从 _embed=wp:featuredmedia 的内联媒体里取缩略图地址。

    优先取中等尺寸（够用作缩略图且省流量），没有则退回原图。
    """
    embedded = (item.get("_embedded") or {}).get("wp:featuredmedia") or []
    if not embedded:
        return ""
    media = embedded[0]
    sizes = (media.get("media_details") or {}).get("sizes") or {}
    for key in ("medium", "medium_large", "thumbnail"):
        url = (sizes.get(key) or {}).get("source_url")
        if url:
            return str(url)
    return str(media.get("source_url", "") or "")


def parse_product(
    item: dict[str, Any],
    tag_map: dict[int, str],
    category_name: str,
    source_name: str = "",
) -> dict[str, str] | None:
    """把单个商品 JSON 转成一行 CSV 记录；非鸣潮 mod 或无夸克链接时返回 None。"""
    raw_excerpt = (item.get("excerpt") or {}).get("rendered", "") or ""

    quark_url = extract_quark_url(raw_excerpt)
    if not quark_url:
        return None

    plain = clean_html(raw_excerpt)
    m_code = RE_EXTRACT_CODE.search(plain)
    m_unzip = RE_UNZIP_CODE.search(plain)
    extract_code = m_code.group(1) if m_code else ""
    unzip_code = m_unzip.group(1) if m_unzip else ""

    tags = item.get("product_tag") or []
    tag_names = [tag_map.get(int(t), "") for t in tags]
    tag_names = [t for t in tag_names if t]

    title = (item.get("title") or {}).get("rendered", "") or ""
    date_raw = item.get("date", "") or ""

    return {
        "日期": date_raw[:10],
        "来源": source_name,
        "mod名称": html_mod.unescape(title).strip(),
        "夸克链接": quark_url,
        "提取码": extract_code,
        "解压码": unzip_code,
        "分类": category_name,
        "角色标签": "/".join(tag_names),
        "网站页面链接": item.get("link", ""),
        "预览图": "",                 # 由 gallery.download_images 回填成本地相对路径
        "_img_url": featured_image_url(item),   # 下划线开头，不写入 CSV
        "product_id": str(item.get("id", "")),
        "发布时间": date_raw,
    }


def parse_all(
    items: list[dict[str, Any]],
    tag_map: dict[int, str],
    category_name: str,
    source_name: str = "",
) -> list[dict[str, str]]:
    rows = []
    for item in items:
        row = parse_product(item, tag_map, category_name, source_name)
        if row:
            rows.append(row)
    return rows
