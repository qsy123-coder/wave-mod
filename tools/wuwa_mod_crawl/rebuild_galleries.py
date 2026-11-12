#!/usr/bin/env python3
"""按现有 CSV 重建所有 HTML 表格与网盘链接 txt（不抓取、不推送）。

用途：改了表格样式/字段后，让已有归档立即生效，无需等下一轮采集。

    python3 rebuild_galleries.py
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from afdian_watcher.poller import GALLERY_SPEC as AFDIAN_SPEC  # noqa: E402
from afdian_watcher.poller import load_config as load_afdian_config  # noqa: E402
from arca_watcher.poller import GALLERY_SPEC as ARCA_SPEC  # noqa: E402
from arca_watcher.poller import load_config as load_arca_config  # noqa: E402
from gamebanana_watcher.poller import GALLERY_SPEC as GB_SPEC  # noqa: E402
from gamebanana_watcher.poller import load_config as load_gb_config  # noqa: E402
from kekehxl_watcher.gallery import rebuild_gallery  # noqa: E402
from kekehxl_watcher.poller import GALLERY_SPEC as KEEKEXL_SPEC  # noqa: E402
from kekehxl_watcher.poller import load_config as load_kekehxl_config  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("rebuild")

JOBS = (
    (load_kekehxl_config, KEEKEXL_SPEC),
    (load_arca_config, ARCA_SPEC),
    (load_gb_config, GB_SPEC),
    (load_afdian_config, AFDIAN_SPEC),
)


def main() -> int:
    for load_cfg, spec in JOBS:
        try:
            cfg = load_cfg()
        except SystemExit:
            log.warning("找不到配置文件，跳过")
            continue

        source_name = cfg["site"].get("source_name", "未命名")
        # 支持绝对路径（GameBanana 直接写本地目录）
        out_root = Path(cfg["storage"].get("out_dir", "out"))
        if not out_root.is_absolute():
            out_root = BASE_DIR / out_root
        out_dir = out_root / source_name

        if not out_dir.exists():
            log.warning("%s：归档目录不存在，跳过 (%s)", source_name, out_dir)
            continue

        n = rebuild_gallery(out_dir, source_name, **spec)
        links = out_dir / "网盘链接.txt"
        extra = ""
        if links.exists():
            extra = f"，网盘链接 {len(links.read_text(encoding='utf-8').splitlines())} 条"
        log.info("%s：重建 %d 个当日表%s", source_name, n, extra)
    return 0


if __name__ == "__main__":
    sys.exit(main())
