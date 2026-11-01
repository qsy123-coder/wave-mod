#!/usr/bin/env python3
"""Nexus Mods 单次采集（用于测试或调试）。

用法：
    python3 run_nexus_once.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from nexus_watcher.poller import run_once

if __name__ == "__main__":
    sys.exit(run_once())
