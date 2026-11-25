#!/usr/bin/env python3
"""看几个 GameBanana 帖子的附件版本 / 下载地址，用于确认「更新」到底有没有换文件。"""

from __future__ import annotations

import datetime
import json
import sys

import requests

PROXY = "http://127.0.0.1:7897"
MOD_IDS = [729537, 726401, 744914, 703789]


def session() -> requests.Session:
    s = requests.Session()
    s.trust_env = False
    s.proxies = {"http": PROXY, "https": PROXY}
    return s


def main() -> None:
    s = session()
    for mid in MOD_IDS:
        d = s.get(f"https://gamebanana.com/apiv11/Mod/{mid}/ProfilePage", timeout=30).json()
        mod_ts = d.get("_tsDateModified") or 0
        print(f"=== {mid} {d.get('_sName')}")
        print(f"    mod modified: {datetime.datetime.fromtimestamp(mod_ts)}")
        for f in d.get("_aFiles") or []:
            added = datetime.datetime.fromtimestamp(f.get("_tsDateAdded") or 0)
            print(f"    ver={f.get('_sVersion')!r:12} desc={str(f.get('_sDescription'))[:34]!r:36}")
            print(f"      file={f.get('_sFile')}  added={added}")
            print(f"      url={(f.get('_sDownloadUrl') or '')[:100]}")
        print()


if __name__ == "__main__":
    sys.exit(main())
