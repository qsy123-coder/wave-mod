#!/usr/bin/env python3
"""GameBanana 单次采集（由 Windows 任务计划调用）。

本机直接运行，无需 xvfb / 浏览器 / 智能代理。
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gamebanana_watcher.poller import run_once

if __name__ == "__main__":
    sys.exit(run_once())
