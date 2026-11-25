#!/usr/bin/env python3
"""把已经下载、但文件名缺版本号（或误带 " v未命名"）的文件改名并同步 state。

2026-11-25 的版本号命名改动上线前下载的文件没有版本号；当天第一版对没有
版本的图片错误地加了 " v未命名"。本脚本按站点当前版本号重算文件名。

用法：
    python -I local/fix_downloaded_names_versions.py --dry-run
    python -I local/fix_downloaded_names_versions.py --day=2026-11-25 --apply
    python -I local/fix_downloaded_names_versions.py --all --apply
"""

from __future__ import annotations

import argparse
import configparser
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from gamebanana_watcher import downloader as D  # noqa: E402
from gamebanana_watcher.poller import build as build_poller  # noqa: E402

STATE = ROOT / "state.gb_downloads.json"
BAD_TAG = " v未命名"


def load_state() -> dict:
    return json.loads(STATE.read_text(encoding="utf-8"))


def save_state(state: dict) -> None:
    tmp = STATE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, STATE)


def candidate_dirs(dest_root: Path, day: str, source_name: str, prefix: str) -> list[Path]:
    """条目的文件可能落在日期目录，也可能在它的「更新」子目录里（同一 Mod 两边都有）。"""
    day_dir = dest_root / D.day_folder(day, prefix) / source_name
    return [day_dir, day_dir / "更新"]


def find_file(dirs: list[Path], name: str) -> Path | None:
    for d in dirs:
        p = d / name
        if p.exists():
            return p
    return None


def plan_images(item: dict, dirs: list[Path]) -> list[tuple[Path, Path]]:
    moves: list[tuple[Path, Path]] = []
    for img in item.get("images") or []:
        name = str(img.get("file") or "")
        if BAD_TAG not in name:
            continue
        new = re.sub(r" v未命名(\.[^.]+)$", r"\1", name)
        src = find_file(dirs, name)
        if src is not None:
            moves.append((src, src.with_name(new)))
        img["file"] = new
    return moves


def plan_files(
    item: dict, dirs: list[Path], versions: dict[str, str], mod_ver: str
) -> list[tuple[Path, Path]]:
    """附件按 base + 序号 + 版本 + 扩展名重算，同时补 version 字段。"""
    moves: list[tuple[Path, Path]] = []
    base = str(item.get("file_base") or "").strip()
    for f in item.get("files") or []:
        name = str(f.get("file") or "")
        if not name:
            continue
        url = str(f.get("url") or "")
        ver = versions.get(url) or mod_ver
        f["version"] = ver
        ext = os.path.splitext(name)[1]
        if not base or not ext:
            continue
        stem = name[: len(name) - len(ext)]
        if not stem.startswith(base):
            print(f"    ! 文件名与 file_base 对不上，跳过：{name}")
            continue
        # 尾部可能是「_2 v旧版本」/「_2 v未命名」/「 v1.2」/ 空，统一剥掉重算
        tail = re.fullmatch(r"(_\d+)?(?: .+)?", stem[len(base):])
        if not tail:
            print(f"    ! 文件名结构无法解析，跳过：{name}")
            continue
        suffix = tail.group(1) or ""
        tag = D._version_tag(ver)
        new = f"{base}{suffix} {tag}{ext}" if tag else f"{base}{suffix}{ext}"
        if new == name:
            continue
        src = find_file(dirs, name)
        if src is not None:
            moves.append((src, src.with_name(new)))
        elif not any((d / new).exists() for d in dirs):
            print(f"    ! 源文件不存在，跳过：{name}")
            continue
        f["file"] = new
    return moves


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", default="", help="只处理某个归档日，如 2026-11-25")
    ap.add_argument("--all", action="store_true", help="处理全部条目")
    ap.add_argument("--apply", action="store_true", help="真正改名（默认 dry-run）")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    apply = args.apply and not args.dry_run

    state = load_state()
    items = state.get("items") or {}
    targets: list[tuple[str, dict]] = []
    for mid, it in items.items():
        day = str(it.get("day") or it.get("date") or "")
        if args.all or (args.day and day.startswith(args.day)):
            targets.append((mid, it))
        elif not args.day and not args.all and day == "2026-11-25":
            targets.append((mid, it))
    if not targets:
        print("没有匹配的条目")
        return

    cfg = configparser.ConfigParser()
    cfg.read(ROOT / "config.gb.ini", encoding="utf-8")
    client, _store, _notifier, pmeta = build_poller(cfg)
    dest_root = Path(pmeta["download"].dest_dir)
    source_name = pmeta["source_name"]
    prefix = pmeta["download"].folder_prefix

    total = 0
    for mid, item in targets:
        name = str(item.get("name") or "")
        day = str(item.get("day") or "")
        dirs = candidate_dirs(dest_root, day, source_name, prefix)
        if not any(d.exists() for d in dirs):
            print(f"[{mid}] {name}: 找不到目录，跳过")
            continue
        try:
            detail = client.mod_profile(int(mid))
        except Exception as exc:  # noqa: BLE001
            print(f"[{mid}] {name}: 拉取详情失败，跳过（{exc}）")
            continue
        mod_ver = str(detail.get("_sVersion") or "").strip()
        versions = {
            str(f.get("_sDownloadUrl") or ""): str(f.get("_sVersion") or "").strip()
            for f in (detail.get("_aFiles") or [])
        }

        moves = plan_images(item, dirs) + plan_files(item, dirs, versions, mod_ver)
        print(f"[{mid}] {name} -> {len(moves)} 个文件改名")
        for src, dst in moves:
            print(f"    {src.name}  ->  {dst.name}")
            if apply:
                src.rename(dst)
        total += len(moves)

    print(f"\n合计 {total} 个文件；模式：{'APPLY' if apply else 'DRY-RUN'}")
    if apply and total:
        save_state(state)
        print("state.gb_downloads.json 已更新")


if __name__ == "__main__":
    main()
