"""附件文件名带版本号（`gamebanana_watcher.downloader`）。

站点「可下载文件」栏的版本号来自 `_aFiles[]._sVersion`；文件自身没写时回退
Mod 级 `_sVersion`（Hiyuki 的 fix 包就是这样显示 1.1 的）。图片没有版本，
不能因为空版本被拼上「未命名」。

跑法（工作目录 = tools/wuwa_mod_crawl）：

    python -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gamebanana_watcher import downloader as d  # noqa: E402


class _FakeClient:
    def __init__(self, detail: dict):
        self.detail = detail

    def mod_profile(self, mid):  # noqa: ARG002
        return self.detail


class VersionTag(unittest.TestCase):
    def test_numeric_gets_v_prefix(self):
        self.assertEqual(d._version_tag("0.9"), "v0.9")
        self.assertEqual(d._version_tag("1.2"), "v1.2")

    def test_existing_v_prefix_kept(self):
        self.assertEqual(d._version_tag("v1.2"), "v1.2")
        self.assertEqual(d._version_tag("V2.61"), "V2.61")

    def test_word_versions_are_not_prefixed(self):
        self.assertEqual(d._version_tag("Base"), "Base")
        self.assertEqual(d._version_tag("NSFW"), "NSFW")

    def test_empty_is_empty_not_unnamed(self):
        self.assertEqual(d._version_tag(""), "")
        self.assertEqual(d._version_tag(None), "")


class PlanItemNames(unittest.TestCase):
    def _plan(self, detail: dict):
        entry = {"mod_id": "729537", "name": "", "files": [], "images": []}
        with tempfile.TemporaryDirectory() as tmp:
            d._plan_item(
                _FakeClient(detail),
                entry,
                Path(tmp),
                set(),
                set(),
                d.DownloadSettings(images=False, files=True),
            )
        return entry

    def test_file_versions_and_mod_level_fallback(self):
        entry = self._plan({
            "_sName": "Hiyuki Chronopattern Hyoshura",
            "_sVersion": "1.1",
            "_aFiles": [
                {"_sDownloadUrl": "https://gb/dl/1", "_sFile": "main.rar", "_sVersion": "1.2"},
                {"_sDownloadUrl": "https://gb/dl/2", "_sFile": "fix.rar", "_sVersion": None},
            ],
        })
        names = [f["file"] for f in entry["files"]]
        self.assertEqual(
            names,
            [
                "Hiyuki Chronopattern Hyoshura_1 v1.2.rar",
                "Hiyuki Chronopattern Hyoshura_2 v1.1.rar",
            ],
        )

    def test_no_version_keeps_plain_name(self):
        entry = self._plan({
            "_sName": "Sweet SuiSui",
            "_sVersion": "",
            "_aFiles": [
                {"_sDownloadUrl": "https://gb/dl/3", "_sFile": "sweet.zip", "_sVersion": None},
            ],
        })
        self.assertEqual(entry["files"][0]["file"], "Sweet SuiSui.zip")
        self.assertEqual(entry["files"][0]["version"], "")


if __name__ == "__main__":
    unittest.main()
