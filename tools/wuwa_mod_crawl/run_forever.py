#!/usr/bin/env python3
"""常驻轮询（由 systemd 拉起）。

用法：
    python3 run_forever.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from kekehxl_watcher.poller import run_forever

if __name__ == "__main__":
    sys.exit(run_forever())
