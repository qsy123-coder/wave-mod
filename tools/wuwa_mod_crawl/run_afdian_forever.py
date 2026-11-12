#!/usr/bin/env python3
"""爱发电常驻轮询（由 systemd 拉起）。

用法：
    python3 run_afdian_forever.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from afdian_watcher.poller import run_forever

if __name__ == "__main__":
    sys.exit(run_forever())
