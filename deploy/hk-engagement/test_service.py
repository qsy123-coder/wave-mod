"""香港计数服务的纯逻辑单测（不启动 HTTP、不写盘）。

运行：
    python -m unittest discover -s deploy/hk-engagement -p "test_*.py"
"""

from __future__ import annotations

import importlib.util
import os
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
_SPEC = importlib.util.spec_from_file_location("hk_service", os.path.join(HERE, "service.py"))
service = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(service)


class DrivePlatformTest(unittest.TestCase):
    def test_aliases_share_one_bucket(self):
        cases = {
            "夸克": "夸克",
            "夸克网盘": "夸克",
            "Quark": "夸克",
            "迅雷网盘": "迅雷",
            "Xunlei": "迅雷",
            "百度网盘": "百度网盘",
            "阿里云盘": "阿里云盘",
            "蓝奏云": "蓝奏云",
            "天翼云盘": "天翼云盘",
            "一二网盘": "115",
            "移动云": "移动云盘",
            "咪咕": "123云盘",
        }
        for raw, expected in cases.items():
            self.assertEqual(service.normalize_drive_platform(raw), expected, raw)

    def test_unknown_platform_keeps_name_without_suffix(self):
        self.assertEqual(service.normalize_drive_platform("某某盘网盘"), "某某盘")
        self.assertEqual(service.normalize_drive_platform("  Some Drive  "), "Some Drive")

    def test_empty_platform_is_rejected(self):
        self.assertEqual(service.normalize_drive_platform("   "), "")
        self.assertEqual(service.normalize_drive_platform(None), "")


class DriveClickTest(unittest.TestCase):
    def setUp(self):
        service._state = {"version": 1, "mods": {}, "visits": {}, "driveClicks": {}}

    def test_same_device_same_day_same_platform_counts_once(self):
        first = service.apply_drive_click("夸克", "device-aaaa", "2026-11-01", "2026-11-01")
        second = service.apply_drive_click("夸克", "device-aaaa", "2026-11-01", "2026-11-01")

        self.assertEqual(first["total"], 1)
        self.assertEqual(second["total"], 1)
        self.assertEqual(second["today"], 1)

    def test_platforms_are_independent(self):
        service.apply_drive_click("夸克", "device-aaaa", "2026-11-01", "2026-11-01")
        result = service.apply_drive_click("迅雷", "device-aaaa", "2026-11-01", "2026-11-01")

        self.assertEqual(result["total"], 1)
        self.assertEqual(service._state["driveClicks"]["夸克"]["total"], 1)
        self.assertEqual(service._state["driveClicks"]["迅雷"]["total"], 1)

    def test_new_day_counts_again(self):
        service.apply_drive_click("夸克", "device-aaaa", "2026-10-31", "2026-11-01")
        result = service.apply_drive_click("夸克", "device-aaaa", "2026-11-01", "2026-11-01")

        self.assertEqual(result["total"], 2)

    def test_older_days_are_frozen_to_integers(self):
        service.apply_drive_click("夸克", "device-aaaa", "2026-10-30", "2026-11-01")
        service.apply_drive_click("夸克", "device-bbbb", "2026-10-30", "2026-11-01")

        self.assertEqual(service._state["driveClicks"]["夸克"]["days"]["2026-10-30"], 2)

    def test_yesterday_keeps_device_list_for_late_requests(self):
        service.apply_drive_click("夸克", "device-aaaa", "2026-10-31", "2026-11-01")
        service.apply_drive_click("夸克", "device-aaaa", "2026-10-31", "2026-11-01")

        value = service._state["driveClicks"]["夸克"]["days"]["2026-10-31"]
        self.assertIsInstance(value, list)
        self.assertEqual(len(value), 1)


class SanitizeTest(unittest.TestCase):
    def test_aliases_merge_and_bad_rows_are_dropped(self):
        raw = {
            "夸克网盘": {
                "total": 2,
                "days": {"2026-11-01": ["a", "a", "b"], "not-a-date": ["x"]},
            },
            "Quark": {"total": 1, "days": {"2026-11-01": ["b", "c"]}},
            "": {"total": 99, "days": {}},
        }

        sanitized = service._sanitize_drive_clicks(raw)

        self.assertEqual(list(sanitized), ["夸克"])
        self.assertEqual(sanitized["夸克"]["total"], 3)
        self.assertEqual(sanitized["夸克"]["days"], {"2026-11-01": ["a", "b", "c"]})


class StatsPayloadTest(unittest.TestCase):
    def setUp(self):
        service._state = {"version": 1, "mods": {}, "visits": {}, "driveClicks": {}}

    def test_sorts_by_total_and_filters_range(self):
        service.apply_drive_click("夸克", "device-a", "2026-10-28", "2026-10-28")
        service.apply_drive_click("迅雷", "device-a", "2026-10-28", "2026-10-28")
        service.apply_drive_click("迅雷", "device-b", "2026-10-28", "2026-10-28")
        # 区间外的点击只影响 total，不出现在 days 里
        service._state["driveClicks"]["迅雷"]["total"] = 10

        # 只读 10-29 当天：10-28 的点击只留在 total 里，不出现在 days 中
        rows = service.drive_stats_payload(1, "2026-10-29")

        self.assertEqual([row["platform"] for row in rows], ["迅雷", "夸克"])
        self.assertEqual(rows[0]["total"], 10)
        self.assertEqual(rows[0]["days"], [])
        self.assertEqual(rows[1]["days"], [])


if __name__ == "__main__":
    unittest.main()
