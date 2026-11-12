#!/usr/bin/env python3
"""arca.live 常驻轮询（由 systemd 经 xvfb-run 拉起）。"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from arca_watcher.poller import run_forever

if __name__ == "__main__":
    sys.exit(run_forever())
