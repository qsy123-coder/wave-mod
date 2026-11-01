#!/usr/bin/env python3
"""发一条测试推送，验证 PushPlus token / Server酱 SendKey 是否可用。

用法：
    python push_test.py              # 读 config.ini
    python push_test.py config.gb.ini

注意：PushPlus 失败时会自动用 Server酱 兜底，会消耗 1 次 Server酱额度。
"""

from __future__ import annotations

import configparser
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from kekehxl_watcher.notify import Notifier  # noqa: E402


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "config.ini")
    if not path.exists():
        raise SystemExit(f"找不到配置文件 {path}")
    cfg = configparser.ConfigParser()
    cfg.read(path, encoding="utf-8")
    if not cfg.has_section("notify"):
        raise SystemExit(f"{path} 缺少 [notify] 段")
    notify = cfg["notify"]
    notifier = Notifier(
        key=notify.get("serverchan_key", ""),
        token=notify.get("pushplus_token", ""),
        enabled=notify.getboolean("enabled", True),
    )
    if not notifier.enabled:
        raise SystemExit("通知已禁用，或 token / SendKey 都没配")
    ok = notifier.send(
        "Mod 监测 · 测试推送",
        "如果你在微信里看到这条，说明推送通道配置正常。",
    )
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
