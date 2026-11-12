#!/usr/bin/env python3
"""GameBanana 常驻轮询（可选；默认用任务计划每 15 分钟跑一次即可）。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from gamebanana_watcher.poller import run_forever

if __name__ == "__main__":
    sys.exit(run_forever())
