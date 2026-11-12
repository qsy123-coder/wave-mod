"""GameBanana 记录 → CSV 行。"""

from __future__ import annotations

import html as html_mod
from datetime import datetime, timezone
from typing import Any

# 缩略图尺寸优先级：530 够清晰又不太大
_IMG_SIZE_KEYS = ("_sFile530", "_sFile220", "_sFile")


def ts_to_iso(ts: Any) -> str:
    """unix 时间戳 → ISO(UTC)。站点给的是 UTC 秒级时间戳。"""
    try:
        return datetime.fromtimestamp(int(ts), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError, OSError):
        return ""


def preview_images(rec: dict[str, Any]) -> list[dict[str, Any]]:
    """收集记录里的预览图（兼容 apiv11 与 apiv13 两种结构）。

    - apiv11 / ProfilePage：`_aPreviewMedia._aImages` 或 `_aPreviewContent.screenshots`
    - apiv13 Subfeed：`_aPreviewContent` 是按类型分组的 dict（`screenshot` 单图）
    """
    images: list[dict[str, Any]] = []

    media = rec.get("_aPreviewMedia") or {}
    images.extend(x for x in (media.get("_aImages") or []) if isinstance(x, dict))

    content = rec.get("_aPreviewContent") or {}
    for value in content.values():
        if isinstance(value, list):
            images.extend(x for x in value if isinstance(x, dict))
        elif isinstance(value, dict):
            images.append(value)

    # 按原图文件名去重（ProfilePage 可能同时给 screenshot/screenshots）
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for img in images:
        key = str(img.get("_sFile") or "") or str(img.get("_sBaseUrl") or "")
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        unique.append(img)
    return unique


def pick_image(rec: dict[str, Any]) -> str:
    """取一张预览图 URL（优先 530 尺寸）。"""
    for img in preview_images(rec):
        base = (img.get("_sBaseUrl") or "").rstrip("/")
        if not base:
            continue
        for key in _IMG_SIZE_KEYS:
            name = img.get(key)
            if name:
                return f"{base}/{name}"
    return ""


def parse_record(rec: dict[str, Any], source_name: str) -> dict[str, str] | None:
    """单条记录 → 一行；无 id 的丢弃。"""
    mid = rec.get("_idRow")
    if not mid:
        return None

    added = ts_to_iso(rec.get("_tsDateAdded"))
    submitter = rec.get("_aSubmitter") or {}
    root_cat = rec.get("_aRootCategory") or {}
    sub_cat = rec.get("_aSubCategory") or {}

    return {
        "日期": added[:10],
        "来源": source_name,
        "名称": html_mod.unescape(str(rec.get("_sName", "") or "")).strip(),
        "作者": str(submitter.get("_sName", "") or "").strip(),
        "分类": str(root_cat.get("_sName", "") or "").strip(),
        "子分类": str(sub_cat.get("_sName", "") or "").strip(),
        "版本": str(rec.get("_sVersion", "") or "").strip(),
        "页面链接": str(rec.get("_sProfileUrl", "") or "").strip(),
        "点赞": str(rec.get("_nLikeCount", "") or ""),
        "浏览": str(rec.get("_nViewCount", "") or ""),
        "评论": str(rec.get("_nPostCount", "") or ""),
        "预览图": "",                                  # 由 gallery.download_images 回填
        "_img_url": pick_image(rec),                   # 下划线开头，不写入 CSV
        "mod_id": str(mid),
        "发布时间": added,
    }


def parse_all(records: list[dict[str, Any]], source_name: str) -> list[dict[str, str]]:
    rows = []
    for rec in records:
        row = parse_record(rec, source_name)
        if row:
            rows.append(row)
    return rows
