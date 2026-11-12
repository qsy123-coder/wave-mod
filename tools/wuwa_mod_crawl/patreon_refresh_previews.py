#!/usr/bin/env python3
"""回填 Patreon 预览图：把已归档的**模糊图**换成清晰图（**必须跑在首尔服务器**）。

## 为什么需要单独一个脚本

1. 带 session 之前落盘的预览图，是 **Patreon 服务端烤糊的**（URL 里带 CDN 变换
   参数 `{"b":70,"w":620}`，改不了也绕不过，见 patreon_watcher/client.py 顶部）。
   session 配好之后**新帖**会自动清晰，但**历史图永远不会自动更新** ——
   `gallery.download_images()` 命中 `images/<id>.*` 就直接跳过，坏数据被 glob 钉死。
2. CSV 里只存本地路径，**不存原始图片 URL**（`_img_url` 下划线开头不落 CSV），
   而 CDN 链接是带 token 的签名链、几小时就失效 —— 所以只能重新遍历作者的
   帖子，建立 `mod_id → 新图 URL` 的映射。

## 用法

    python3 patreon_refresh_previews.py --dry-run   # 只报告，不动任何文件
    python3 patreon_refresh_previews.py             # 正式回填
    python3 patreon_refresh_previews.py --force     # 忽略已回填记录，全部重做

## 安全设计（顺序即防护）

    1. 闸门 A（全局一次）：session 无效 → 直接退出，一张都不碰
    2. 建 mod_id → 新图 URL 映射（CSV 不存 URL，签名链也早失效，只能重遍历帖子）
    3. 闸门 B（逐作者）：新 URL 自己就带模糊参数 → 判定 session 没真生效 → 该作者跳过
    4. 旧图是**改名挪走**不是删除 —— 任何时刻磁盘上都有图
    5. 只挪「确实要替换」的那些；下不回来的从备份**原样还原**（宁可留糊图，不留破图）
    6. 回写 CSV 的「预览图」列（CDN 按 URL 后缀取名，后缀变了就不同步会破图）

**按作者循环**：每个作者一套 `images/` + CSV，所以备份目录和回填记录也按作者区分
（名字从 state 文件名派生，见 `BAK_SUFFIX`）。某个作者失败不影响其余作者。
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import sys
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from kekehxl_watcher.gallery import IMG_DIR, download_images, rebuild_gallery  # noqa: E402
from patreon_watcher.client import ApiError  # noqa: E402
from patreon_watcher.parser import image_is_blurred, pick_image  # noqa: E402
from patreon_watcher.poller import GALLERY_SPEC, build, load_config  # noqa: E402

log = logging.getLogger("patreon.refresh")

# ⚠️ 备份目录和回填记录**不能放在 out/ 里**。
# 本机 sync.ps1 用 `find . -type f` 递归扫整个 out/，放在里面会被一并同步到
# 用户的本地汇总目录（实测踩过：31 张糊图 + 一个 .json 混进了 A_每日更新）。
# 所以放到程序目录，且**按作者区分** —— 每个作者各一套，固定同名会互相覆盖。
# 两者都从 state 文件名派生：
#   state.patreon.Puddingow.json
#     → state.patreon.Puddingow.refill.json   已回填记录（幂等用）
#     → state.patreon.Puddingow.blurred_bak/  旧糊图备份（可回滚）
BAK_SUFFIX = ".blurred_bak"
MARKER_SUFFIX = ".refill.json"


def _campaign_id(client, store, spec: dict[str, str]) -> str:
    """作者 → campaign id：config 优先，其次 state 缓存，最后按 vanity 问接口。"""
    vanity = spec["vanity"]
    cached = (store.state.get("campaigns") or {}).get(vanity) or {}
    cid = spec["campaign_id"] or str(cached.get("id") or "")
    if cid:
        return cid
    info = client.resolve_campaign(vanity)
    if not info:
        raise SystemExit(f"找不到作者 {vanity} —— vanity 是否写错？")
    return info["id"]


def build_url_map(client, store, meta, spec: dict[str, str]) -> dict[str, str]:
    """遍历**一个作者**的全部历史帖 → {mod_id: 预览图 URL}。"""
    cid = _campaign_id(client, store, spec)
    posts = client.warmup(
        cid, max_pages=meta["first_run_max_pages"], count=meta["page_size"]
    )
    log.info("%s：取到 %d 条帖子", spec["vanity"], len(posts))
    out: dict[str, str] = {}
    for post in posts:
        pid = str(post.get("id") or "")
        url = pick_image(post.get("attributes") or {})
        if pid and url:
            out[pid] = url
    return out


def _files_for(images_dir: Path, mod_id: str) -> list[Path]:
    return [p for p in images_dir.glob(f"{mod_id}.*") if p.is_file()]


def sync_csv_preview_paths(
    out_dir: Path, id_to_rel: dict[str, str], encoding: str, dry_run: bool
) -> int:
    """把 CSV 里「预览图」列改成实际落盘的文件名。返回改动的行数。

    ⚠️ 必须做：`gallery._ext_from()` 按 URL 后缀决定扩展名，签名链后缀若与旧文件
    不同（.png → .jpg），CSV 里还写着旧名字，rebuild 出来的 HTML 就是破图。
    """
    paths = sorted(out_dir.glob("W-*.csv")) + [out_dir / "all_mods.csv"]
    changed_total = 0
    for path in paths:
        if not path.exists():
            continue
        try:
            with path.open("r", encoding=encoding, newline="") as fh:
                reader = csv.DictReader(fh)
                fieldnames = reader.fieldnames
                rows = list(reader)
        except OSError as exc:
            log.warning("读不出 %s：%s", path.name, exc)
            continue
        if not fieldnames or not rows:
            continue
        changed = 0
        for row in rows:
            rel = id_to_rel.get(str(row.get("mod_id", "")))
            if rel and (row.get("预览图") or "") != rel:
                row["预览图"] = rel
                changed += 1
        if changed:
            if not dry_run:
                with path.open("w", encoding=encoding, newline="") as fh:
                    writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
                    writer.writeheader()
                    writer.writerows(rows)
            changed_total += changed
            log.info("%s：更新预览图路径 %d 行", path.name, changed)
    return changed_total


def _human(n: int) -> str:
    return f"{n / 1024:.0f}KB" if n < 1024 * 1024 else f"{n / 1024 / 1024:.1f}MB"


def refresh_one(
    client, store, meta, spec: dict[str, str], *, dry_run: bool, force: bool
) -> dict[str, int]:
    """回填**一个作者**的模糊预览图。返回统计字典。"""
    vanity = spec["vanity"]
    out_dir: Path = store.out_dir
    images_dir = out_dir / IMG_DIR
    encoding = store.encoding
    # 放到程序目录（与 state 同级）、且按作者区分 —— 见文件头 BAK_SUFFIX 处的说明
    state_dir: Path = store.state_file.parent
    stem = store.state_file.stem
    bak_dir = state_dir / f"{stem}{BAK_SUFFIX}"
    marker = state_dir / f"{stem}{MARKER_SUFFIX}"
    stats = {"replaced": 0, "restored": 0, "skipped": 0, "pending": 0, "old": 0, "new": 0}

    if not images_dir.exists():
        log.info("%s：没有 images/ 目录，跳过", vanity)
        return stats

    # ---------- 建映射 ----------
    existing_ids = {p.stem for p in images_dir.glob("*") if p.is_file()}
    url_map = build_url_map(client, store, meta, spec)

    # 只关心「本地确实有文件」的那些
    targets = {pid: url_map[pid] for pid in existing_ids if pid in url_map}
    no_url = len(existing_ids) - len(targets)
    if no_url:
        log.warning("%s：%d 个已归档 id 在接口里找不到图（text_only 公告等），保持原样", vanity, no_url)

    # ---------- 闸门 B：清晰度 ----------
    sharp = {pid: u for pid, u in targets.items() if not image_is_blurred(u)}
    still_blurred = len(targets) - len(sharp)
    log.info("%s：目标 %d 张 → 清晰 %d / 仍模糊 %d", vanity, len(targets), len(sharp), still_blurred)
    if still_blurred:
        log.warning(
            "%s：仍有 %d 张的新 URL 带模糊参数（多半是 current_user_can_view=False 的"
            "付费限定帖），这些保持原样不动",
            vanity, still_blurred,
        )
    if targets and not sharp:
        log.error(
            "%s：闸门 B 未通过 —— 所有新 URL 仍带模糊参数，session 看着有效但没真正解开，"
            "该作者不删不备份、跳过",
            vanity,
        )
        return stats

    # ---------- 跳过已回填过的（幂等）----------
    done: set[str] = set()
    if marker.exists() and not force:
        try:
            done = set(json.loads(marker.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            done = set()
    pending = [
        pid for pid in sharp if force or pid not in done or not _files_for(images_dir, pid)
    ]
    stats["skipped"] = len(sharp) - len(pending)
    stats["pending"] = len(pending)
    stats["old"] = sum(f.stat().st_size for pid in pending for f in _files_for(images_dir, pid))

    if dry_run:
        log.info(
            "%s：[dry-run] 将替换 %d 张（现占 %s），已回填过跳过 %d 张",
            vanity, stats["pending"], _human(stats["old"]), stats["skipped"],
        )
        return stats

    if not pending:
        return stats

    # ---------- 挪走旧图（改名，不删）----------
    bak_dir.mkdir(parents=True, exist_ok=True)
    moved: dict[str, list[str]] = {}
    for pid in pending:
        for path in _files_for(images_dir, pid):
            stats["old"] += path.stat().st_size
            path.replace(bak_dir / path.name)          # replace 会覆盖同名备份
            moved.setdefault(pid, []).append(path.name)

    # ---------- 下载新图 ----------
    rows: list[dict[str, Any]] = [{"mod_id": pid, "_img_url": sharp[pid]} for pid in pending]
    got = download_images(rows, out_dir, id_field="mod_id", url_field="_img_url",
                          session=client.session)
    log.info("%s：下载完成 %d/%d 张", vanity, got, len(pending))

    # ---------- 下不回来的，从备份还原（宁可留糊图，不留破图）----------
    id_to_rel: dict[str, str] = {}
    replaced: list[str] = []
    restored: list[str] = []
    for pid in pending:
        files = _files_for(images_dir, pid)
        if files:
            id_to_rel[pid] = f"{IMG_DIR}/{files[0].name}"
            replaced.append(pid)
            continue
        # 下载失败：把旧图挪回来，宁可留糊图也不留破图（CSV 里指着它）
        for name in moved.get(pid, []):
            (bak_dir / name).replace(images_dir / name)
        back = _files_for(images_dir, pid)
        if back:
            id_to_rel[pid] = f"{IMG_DIR}/{back[0].name}"
            restored.append(pid)
    stats["replaced"], stats["restored"] = len(replaced), len(restored)
    if restored:
        log.warning("%s：%d 张下载失败，已用旧图还原（仍是模糊的）：%s",
                    vanity, len(restored), ", ".join(restored[:10]))

    # ---------- 回写 CSV + 重建表格 ----------
    stats["new"] = sum(
        f.stat().st_size for pid in id_to_rel for f in _files_for(images_dir, pid)
    )
    sync_csv_preview_paths(out_dir, id_to_rel, encoding, dry_run=False)
    try:
        rebuild_gallery(out_dir, f"{meta['source_name']} · {vanity}", **GALLERY_SPEC)
    except Exception as exc:  # noqa: BLE001 - 表格失败不应抹掉已完成的图
        log.warning("%s：HTML 表格生成失败：%s", vanity, exc)

    # ---------- 记录 ----------
    # 只把「真换成清晰图」的记进 marker；还原回糊图的下次还会重试
    done |= set(replaced)
    marker.write_text(json.dumps(sorted(done), ensure_ascii=False), encoding="utf-8")

    log.info("%s：替换 %d 张，失败还原 %d，跳过 %d，%s → %s",
             vanity, stats["replaced"], stats["restored"], stats["skipped"],
             _human(stats["old"]), _human(stats["new"]))
    return stats


def main() -> int:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    )
    ap = argparse.ArgumentParser(description="回填 Patreon 模糊预览图")
    ap.add_argument("--dry-run", action="store_true", help="只报告，不动任何文件")
    ap.add_argument("--force", action="store_true", help="忽略已回填记录，全部重做")
    ap.add_argument("--creator", default="", help="只处理某个作者（vanity），默认全部")
    args = ap.parse_args()

    client, stores, _notifier, meta = build(load_config())

    # ---------- 闸门 A：登录态（全局，一次）----------
    # 单看接口返回没用 —— session 过期时 URL 只是悄悄带回了 b 参数，
    # 所以这里先确认登录态，再让每个作者自己做闸门 B。
    if not client.session_configured:
        log.error("未配置 session（config 的 [auth] session_file）—— 一张都不碰，退出")
        return 2
    try:
        user = client.current_user()
    except ApiError as exc:
        log.error("登录态探测失败（网络原因）：%s —— 一张都不碰，退出", exc)
        return 2
    if not user:
        log.error("session 无效/已过期（401 LoginRequired）—— 一张都不碰，退出")
        return 2
    log.info("登录态 OK（user %s · can_see_nsfw=%s）", user.get("id"), user.get("can_see_nsfw"))

    specs = meta["creators"]
    if args.creator:
        specs = [s for s in specs if s["vanity"] == args.creator]
        if not specs:
            log.error("config 里没有作者 %s", args.creator)
            return 2

    total = {"replaced": 0, "restored": 0, "skipped": 0, "pending": 0, "old": 0, "new": 0}
    for spec in specs:
        store = stores[spec["vanity"]]
        try:
            st = refresh_one(client, store, meta, spec, dry_run=args.dry_run, force=args.force)
        except Exception as exc:  # noqa: BLE001 - 单个作者失败不应中断其余作者
            log.exception("%s 回填失败，跳过：%s", spec["vanity"], exc)
            continue
        for k in total:
            total[k] += st[k]

    log.info("=" * 64)
    if args.dry_run:
        log.info("[dry-run] 合计：待替换 %d 张（现占 %s）—— 未改动任何文件",
                 total["pending"], _human(total["old"]))
    else:
        log.info(
            "全部完成：%d 个作者 · 替换 %d 张，失败还原 %d 张，跳过(已回填过) %d 张",
            len(specs), total["replaced"], total["restored"], total["skipped"],
        )
        log.info("图片合计 %s → %s", _human(total["old"]), _human(total["new"]))
        log.info("旧图备份在程序目录（state.patreon.*.blurred_bak/）—— 确认无误后可删")
    return 0


if __name__ == "__main__":
    sys.exit(main())
