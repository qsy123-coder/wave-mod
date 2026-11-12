"""Nexus Mods API 记录 → CSV 行。

字段取自 v1 的 ModInfoResponse：mod_id / name / author / version / category_id /
picture_url / endorsement_count / mod_downloads / created_time / contains_adult_content。
"""

from __future__ import annotations

import html as html_mod
from typing import Any


def parse_mod(
    mod: dict[str, Any],
    cat_map: dict[int, str],
    source_name: str,
    domain: str,
) -> dict[str, str] | None:
    """单个 mod → 一行；无 mod_id 的丢弃。"""
    mid = mod.get("mod_id")
    if not mid:
        return None

    # created_time 形如 2026-10-12T00:54:42.000+00:00（UTC），取前 10 位作日期
    created = str(mod.get("created_time") or "")
    try:
        cat_name = cat_map.get(int(mod.get("category_id") or 0), "")
    except (TypeError, ValueError):
        cat_name = ""

    return {
        "日期": created[:10],
        "来源": source_name,
        "名称": html_mod.unescape(str(mod.get("name") or "")).strip(),
        "作者": str(mod.get("author") or mod.get("uploaded_by") or "").strip(),
        "分类": cat_name,
        "版本": str(mod.get("version") or "").strip(),
        "页面链接": f"https://www.nexusmods.com/{domain}/mods/{mid}",
        "点赞": str(mod.get("endorsement_count") or ""),
        "下载量": str(mod.get("mod_downloads") or ""),
        "成人内容": "是" if mod.get("contains_adult_content") else "",
        "预览图": "",                                   # 由 gallery.download_images 回填
        "_img_url": str(mod.get("picture_url") or ""),  # 下划线开头，不写入 CSV
        "mod_id": str(mid),
        "发布时间": created,
    }


def parse_all(
    mods: list[dict[str, Any]],
    cat_map: dict[int, str],
    source_name: str,
    domain: str,
) -> list[dict[str, str]]:
    rows = []
    for mod in mods:
        row = parse_mod(mod, cat_map, source_name, domain)
        if row:
            rows.append(row)
    return rows
