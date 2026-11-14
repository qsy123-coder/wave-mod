"""更新条目的增量下载（`gamebanana_watcher.downloader`）。

跑法（工作目录 = tools/wuwa_mod_crawl）：

    python -m unittest discover -s tests -v

覆盖 2026-11-14 那次「今天又下一遍昨天那套图」的回归：
  - requeue_updates 记下 prev_images / prev_files，重复触发不清空
  - _plan_item 同一个 URL 直接复用，只有新增项待下载
  - _process_queue_inner 落到 <来源>/更新/，且只调一次下载
"""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gamebanana_watcher import downloader as d  # noqa: E402


class _FakeClient:
    def __init__(self, detail: dict):
        self.detail = detail

    def mod_profile(self, mid):  # noqa: ARG002 - 接口签名需要
        return self.detail


class _FakeNotifier:
    def send(self, *args, **kwargs):  # noqa: ARG002
        return True


def _detail(images: list[str], files: list[tuple[str, str]]) -> dict:
    return {
        "_sName": "Quiet HUD (UI toggles)",
        "_sProfileUrl": "https://gamebanana.com/mods/642123",
        "_aPreviewContent": {
            "screenshots": [{"_sFile": f, "_sBaseUrl": "https://img"} for f in images]
        },
        "_aFiles": [
            {"_sDownloadUrl": url, "_sFile": name, "_nFilesize": 10}
            for url, name in files
        ],
    }


def _seed_state(path: Path) -> None:
    state = {
        "version": 1,
        "items": {
            "642123": {
                "mod_id": "642123",
                "name": "Quiet HUD (UI toggles)",
                "status": "done",
                "day": "2026-11-13",
                "planned": True,
                "image_base": "Quiet HUD (UI toggles)",
                "file_base": "Quiet HUD (UI toggles)",
                "images": [
                    {"url": "https://img/a.jpg", "src": "a.jpg", "status": "done",
                     "file": "Quiet HUD (UI toggles)_1.jpg"},
                    {"url": "https://img/b.jpg", "src": "b.jpg", "status": "done",
                     "file": "Quiet HUD (UI toggles)_2.jpg"},
                ],
                "files": [
                    {"url": "https://gb/dl/1", "src": "old.zip", "status": "done",
                     "size": 10, "file": "Quiet HUD (UI toggles)_1.zip"},
                    {"url": "https://gb/dl/2", "src": "opt.zip", "status": "done",
                     "size": 10, "file": "Quiet HUD (UI toggles)_2.zip"},
                ],
            }
        },
        "paused": None,
    }
    path.write_text(json.dumps(state), encoding="utf-8")


class RequeueUpdatesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="gbtest_"))
        self.state_path = self.tmp / "state.gb_downloads.json"
        _seed_state(self.state_path)

    def tearDown(self):
        import shutil

        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_records_previous_assets(self):
        changed = d.requeue_updates(["642123"], self.state_path)
        self.assertEqual(changed, ["642123"])
        entry = json.loads(self.state_path.read_text(encoding="utf-8"))["items"]["642123"]
        self.assertTrue(entry["is_update"])
        self.assertEqual(entry["update_of"], "2026-11-13")
        self.assertEqual(len(entry["prev_images"]), 2)
        self.assertEqual(len(entry["prev_files"]), 2)
        self.assertNotIn("images", entry)
        self.assertNotIn("files", entry)
        self.assertFalse(entry["planned"])

    def test_requeue_before_download_keeps_previous_assets(self):
        """下载任务还没跑，采集又触发一轮 requeue：复用清单不能被清空。"""
        d.requeue_updates(["642123"], self.state_path)
        d.requeue_updates(["642123"], self.state_path)
        entry = json.loads(self.state_path.read_text(encoding="utf-8"))["items"]["642123"]
        self.assertEqual(len(entry["prev_images"]), 2)
        self.assertEqual(len(entry["prev_files"]), 2)


class PlanItemTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="gbtest_"))
        self.state_path = self.tmp / "state.gb_downloads.json"
        _seed_state(self.state_path)
        d.requeue_updates(["642123"], self.state_path)
        self.entry = json.loads(
            self.state_path.read_text(encoding="utf-8")
        )["items"]["642123"]
        self.settings = d.DownloadSettings()

    def tearDown(self):
        import shutil

        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_only_new_items_pending(self):
        detail = _detail(
            ["a.jpg", "b.jpg", "c.jpg"],
            [("https://gb/dl/1", "old.zip"),
             ("https://gb/dl/2", "opt.zip"),
             ("https://gb/dl/3", "new.zip")],
        )
        d._plan_item(_FakeClient(detail), self.entry, self.tmp, set(), set(), self.settings)

        imgs = {x["url"]: x for x in self.entry["images"]}
        self.assertEqual(imgs["https://img/a.jpg"]["status"], "done")
        self.assertTrue(imgs["https://img/a.jpg"]["reused"])
        self.assertEqual(imgs["https://img/a.jpg"]["file"], "Quiet HUD (UI toggles)_1.jpg")
        self.assertEqual(imgs["https://img/c.jpg"]["status"], "pending")

        files = {x["url"]: x for x in self.entry["files"]}
        self.assertEqual(files["https://gb/dl/1"]["status"], "done")
        self.assertEqual(files["https://gb/dl/3"]["status"], "pending")
        self.assertEqual(self.entry["reused"], 4)
        self.assertEqual(self.entry["status"], "pending")

    def test_all_reused_marks_done(self):
        detail = _detail(
            ["a.jpg", "b.jpg"],
            [("https://gb/dl/1", "old.zip")],
        )
        d._plan_item(_FakeClient(detail), self.entry, self.tmp, set(), set(), self.settings)
        self.assertEqual(self.entry["status"], "done")
        self.assertEqual(self.entry["reused"], 3)


class QueueTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix="gbtest_"))
        self.dest = self.tmp / "dest"
        self.out = self.tmp / "_Mod每日汇总" / "GameBanana"
        self.dest.mkdir(parents=True)
        self.out.mkdir(parents=True)
        self.state_path = self.tmp / "state.gb_downloads.json"
        _seed_state(self.state_path)
        d.requeue_updates(["642123"], self.state_path)

    def tearDown(self):
        import shutil

        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_update_lands_in_update_subdir_and_downloads_only_new(self):
        calls = {"img": [], "file": []}
        orig = (d._download_image_worker, d._download_file, d._ensure_fast_proxy, d._free_gb)
        orig_sleep = d.time.sleep

        def fake_img(url, dest_path, *a, **k):  # noqa: ARG001
            calls["img"].append(str(dest_path))
            Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
            Path(dest_path).write_bytes(b"x")
            return True

        def fake_file(sess, url, dest_path, **k):  # noqa: ARG001
            calls["file"].append(str(dest_path))
            Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
            Path(dest_path).write_bytes(b"y")
            return True

        d._download_image_worker = fake_img
        d._download_file = fake_file
        d._ensure_fast_proxy = lambda state, settings: None
        d._free_gb = lambda p: 999.0
        d.time.sleep = lambda s: None
        try:
            settings = d.DownloadSettings(
                dest_dir=str(self.dest),
                folder_prefix="W-",
                update_subdir="更新",
                min_free_gb=0,
                delay_seconds=0,
                proxy=None,
                image_workers=1,
            )
            detail = _detail(
                ["a.jpg", "b.jpg", "c.jpg"],
                [("https://gb/dl/1", "old.zip"), ("https://gb/dl/3", "new.zip")],
            )
            stats = d._process_queue_inner(
                _FakeClient(detail), settings, self.state_path, self.out,
                _FakeNotifier(), max_items=5,
            )
        finally:
            (d._download_image_worker, d._download_file,
             d._ensure_fast_proxy, d._free_gb) = orig
            d.time.sleep = orig_sleep

        self.assertEqual(len(calls["img"]), 1)
        self.assertEqual(len(calls["file"]), 1)
        self.assertIn("GameBanana\\更新", calls["img"][0])
        self.assertIn("GameBanana\\更新", calls["file"][0])
        self.assertEqual(stats["done"], 1)

        entry = json.loads(self.state_path.read_text(encoding="utf-8"))["items"]["642123"]
        self.assertEqual(entry["status"], "done")
        self.assertEqual(entry["reused"], 3)   # 2 图 + 1 个旧附件


if __name__ == "__main__":
    unittest.main()
