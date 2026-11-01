#!/usr/bin/env python3
"""从本地汇总目录的 all_mods.csv 反推各来源的 state*.json（去重状态）。

用途：服务器重建 / 换机时，旧机器的 state 文件随实例一起丢了，但本地汇总目录里
留着全部历史 CSV。直接空 state 起服会把历史条目当新 Mod 重推一遍，所以先按 CSV
里的 id 列造好 seen_ids，再部署。

用法（在仓库根目录执行）：

    python deploy/rebuild_state_from_csv.py \
        --summary-dir "D:/.../A_每日更新/_Mod每日汇总" \
        --out-dir deploy/state_rebuilt

产出：state.json / state.arca.json / state.nexus.json /
      state.patreon.<作者>.json / state.afdian.<slug>.json
"""

from __future__ import annotations

import argparse
import configparser
import csv
import json
from datetime import datetime
from pathlib import Path

# 来源 → (配置文件、汇总子目录、去重 id 列)。Patreon/爱发电 按作者分目录，单独处理。
SOURCES = [
    ("config.ini", "可可站", "product_id"),
    ("config.arca.ini", "arca.live", "article_id"),
    ("config.nexus.ini", "NexusMods", "mod_id"),
]


def _read_cfg(path: Path) -> configparser.ConfigParser:
    cp = configparser.ConfigParser()
    cp.optionxform = str  # 作者 slug / vanity 大小写敏感
    cp.read(path, encoding="utf-8")
    return cp


def _ids_from_csv(path: Path, id_field: str) -> tuple[list[str], str | None]:
    """返回 (去重后的 id 列表, 最新一条的首次发现时间)。"""
    if not path.exists():
        return [], None
    ids: list[str] = []
    seen: set[str] = set()
    latest: str | None = None
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        for row in csv.DictReader(fh):
            mid = (row.get(id_field) or "").strip()
            if mid and mid not in seen:
                seen.add(mid)
                ids.append(mid)
            found = (row.get("首次发现时间") or "").strip()
            if found and (latest is None or found > latest):
                latest = found
    return ids, latest


def _state(ids: list[str], latest: str | None) -> dict:
    last_new = None
    if latest:
        try:
            last_new = datetime.strptime(latest, "%Y-%m-%d %H:%M:%S").isoformat(
                timespec="seconds"
            )
        except ValueError:
            last_new = None
    return {
        "seen_ids": sorted(ids),
        "last_poll": datetime.now().isoformat(timespec="seconds"),
        "last_new_at": last_new,
        "initialized": True,
    }


def _write(path: Path, state: dict) -> None:
    path.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"  {path.name}: {len(state['seen_ids'])} 个 id, last_new_at={state['last_new_at']}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--summary-dir", required=True, type=Path)
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--repo", default=Path(__file__).resolve().parent.parent, type=Path)
    args = ap.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)

    # 单来源
    for cfg_name, subdir, id_field in SOURCES:
        cp = _read_cfg(args.repo / cfg_name)
        state_name = cp["storage"].get("state_file", "state.json")
        ids, latest = _ids_from_csv(args.summary_dir / subdir / "all_mods.csv", id_field)
        print(f"{subdir}:")
        _write(args.out_dir / state_name, _state(ids, latest))

    # Patreon / 爱发电：按作者各一个 state
    for cfg_name, subdir, prefix in (
        ("config.patreon.ini", "Patreon", "state.patreon"),
        ("config.afdian.ini", "爱发电", "state.afdian"),
    ):
        cp = _read_cfg(args.repo / cfg_name)
        base = cp["storage"].get("state_file", f"{prefix}.json")
        stem = Path(base).stem  # state.patreon / state.afdian
        creators = cp["creators"] if cp.has_section("creators") else {}
        print(f"{subdir}（{len(creators)} 个作者）:")
        for key in creators:
            if key.startswith(";"):
                continue
            ids, latest = _ids_from_csv(
                args.summary_dir / subdir / key / "all_mods.csv", "mod_id"
            )
            _write(args.out_dir / f"{stem}.{key}.json", _state(ids, latest))


if __name__ == "__main__":
    main()
