#!/usr/bin/env python3
"""验证 Notifier 的两条路径：
  A. 正常直连能发出推送（不应触发代理兜底）
  B. 直连抛 ConnectionError（模拟 DNS 挂掉）时自动改走代理并发出

用法： F:\\Anaconda\\python.exe -I local/verify_notify_proxy_fallback.py
会真的发 2 条测试推送（各消耗 1 次 PushPlus 额度）。
"""

from __future__ import annotations

import configparser
import logging
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import requests  # noqa: E402

from kekehxl_watcher.notify import Notifier  # noqa: E402


def build() -> Notifier:
    cfg = configparser.ConfigParser()
    cfg.read(ROOT / "config.gb.ini", encoding="utf-8")
    notify = cfg["notify"]
    net = cfg["net"] if cfg.has_section("net") else None
    proxy = (net.get("proxy", "") if net else "").strip()
    if not proxy.startswith("http"):
        proxy = "http://127.0.0.1:7897"
    return Notifier(
        key=notify.get("serverchan_key", ""),
        token=notify.get("pushplus_token", ""),
        enabled=notify.getboolean("enabled", True),
        proxy=proxy,
    )


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    print("=== A. 直连路径 ===")
    n1 = build()
    ok_a = n1.send("Mod 监测 · 通知链路自检 A", "直连路径：能看到这条说明直连正常。")
    print(f"A 结果: {ok_a}\n")

    print("=== B. 直连失败 → 代理兜底 ===")
    n2 = build()

    def boom(*_a, **_k):
        raise requests.ConnectionError(
            "Failed to resolve 'www.pushplus.plus' ([Errno 11001] getaddrinfo failed) [simulated]"
        )

    n2.session.post = boom
    ok_b = n2.send("Mod 监测 · 通知链路自检 B", "代理兜底路径：直连被模拟成 DNS 失败，这条能收到就说明兜底生效。")
    print(f"B 结果: {ok_b}\n")

    print(f"总结: A={ok_a} B={ok_b} -> {'PASS' if (ok_a and ok_b) else 'FAIL'}")
    sys.exit(0 if (ok_a and ok_b) else 1)


if __name__ == "__main__":
    main()
