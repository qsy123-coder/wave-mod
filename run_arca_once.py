#!/usr/bin/env python3
"""arca.live 单次采集（测试用）。需在 xvfb 下运行：xvfb-run -a python3 run_arca_once.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from arca_watcher.poller import run_once

if __name__ == "__main__":
    sys.exit(run_once())
