"""作者改帖换掉 kio 码后，下载器要重新抓正文换链接（回归 2026-11-27）。

场景（帖子 190464881，청초 에이메스 팬스 이식）：

  1. 采集时正文里的码是 `diG-l98bNXPEb3l0tvg6ib`；
  2. 作者 15:46 编辑帖子，换成 `atdDddLT2YLgfWaDF3g6ib`；
  3. 下载器拿着 state 里的旧码请求 kio，回
     `collection:invalid_protector_config: invalid password`；
  4. 旧逻辑直接写「需手动」并永久卡住，新码其实用频道密码 Eldwh 就能打开。

修复后：下载前先校验 kio 码，判定为「链接失效」就重新拉帖子页、按正文里的
新码重新规划，并且不重下已经完成的预览图。

跑法（工作目录 = tools/wuwa_mod_crawl）：

    F:\\Anaconda\\python.exe -m unittest tests.test_arca_stale_kio_relink -v
"""

from __future__ import annotations

import base64
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from arca_watcher import downloader as d  # noqa: E402

OLD_CODE = "diG-l98bNXPEb3l0tvg6ib"
OLD_LINK = f"https://kio.ac/c/{OLD_CODE}"
NEW_CODE = "atdDddLT2YLgfWaDF3g6ib"
NEW_LINK = f"https://kio.ac/c/{NEW_CODE}"
B64 = base64.b64encode(NEW_LINK.encode()).decode()

PAGE = f"""
<html><body>
<div class="article-body"><div class="fr-view article-content">
  <p>직검 메인딜 에뮁이랑 히유키 이식</p>
  <p>ㅂㅂㄱㄹ ㅎㄷ</p>
  <p>{B64}</p>
  <p><img src="//ac.arca.live/20261127sac/aaa.png?expires=1&amp;key=k" /></p>
</div></div>
<div class="vote-area"></div>
</body></html>
"""


class FakeKio:
    """只认新码；旧码按线上原始错误拒绝。"""

    def __init__(self, fresh_code: str = NEW_CODE) -> None:
        self.fresh_code = fresh_code
        self.resolve_calls: list[str] = []

    def resolve(self, code: str, password: str):  # noqa: ARG002 - 接口签名需要
        self.resolve_calls.append(code)
        if code != self.fresh_code:
            raise d._ApiError(
                "collection:invalid_protector_config", "invalid password"
            )
        return {
            "token": "tok",
            "root": b"root",
            "name": "Qingxiao_AemeathOutfit.zip",
            "segment_size": 16777216,
        }

    def directory(self, token, root):  # noqa: ARG002
        return {
            "files": [
                {
                    "id": b"\x01" * 16,
                    "name": "Qingxiao_AemeathOutfit.zip",
                    "size": 54676617,
                }
            ],
            "children": [],
        }

    def walk_deep(self, token, tree):  # noqa: ARG002
        return [
            (
                "Qingxiao_AemeathOutfit.zip",
                {
                    "id": b"\x01" * 16,
                    "name": "Qingxiao_AemeathOutfit.zip",
                    "size": 54676617,
                },
            )
        ]


def _entry(*, code: str = OLD_CODE, link: str = OLD_LINK) -> dict:
    return {
        "article_id": "190464881",
        "title": "청초 에이메스 팬스 이식",
        "author": "혐끼선봉자",
        "category": "명조 모드",
        "day": "2026-11-27",
        "page_url": "https://arca.live/b/thingzyoa/190464881",
        "links": [link],
        "planned": True,
        "status": "partial",
        "base": "청초 에이메스 팬스 이식",
        "manual": [
            {"link": link, "reason": "kio 合集打不开（invalid password）"}
        ],
        "images": [
            {
                "src": "/20261127sac/aaa.png",
                "url": "https://ac-o.arca.live/20261127sac/aaa.png?expires=1&key=k",
                "file": "청초 에이메스 팬스 이식_1.png",
                "status": "done",
            }
        ],
        "mods": [
            {
                "type": "kio",
                "link": link,
                "code": code,
                "segment_size": 16777216,
                "collection": "old.zip",
                "files": [
                    {
                        "id": "01" * 16,
                        "name": "old.zip",
                        "path": "old.zip",
                        "size": 1,
                        "status": "pending",
                    }
                ],
            }
        ],
    }


def _settings() -> d.ArcaDownloadSettings:
    return d.ArcaDownloadSettings(
        images=True,
        files=True,
        password="Eldwh",
        request_timeout=5,
        delay_seconds=0,
    )


class StaleKioClassifyTests(unittest.TestCase):
    def test_invalid_password_is_stale(self) -> None:
        exc = d._ApiError("collection:invalid_protector_config", "invalid password")
        self.assertTrue(d._is_stale_kio_error(exc))

    def test_collection_not_found_is_stale(self) -> None:
        self.assertTrue(d._is_stale_kio_error(d._ApiError("collection:not_found", "")))

    def test_rate_limit_is_not_stale(self) -> None:
        self.assertFalse(d._is_stale_kio_error(d._ApiError("http_503", "")))
        self.assertFalse(d._is_stale_kio_error(d._ApiError("http_429", "")))

    def test_network_error_is_not_stale(self) -> None:
        self.assertFalse(
            d._is_stale_kio_error(d.requests.ConnectionError("boom"))
        )


class RefreshStaleKioTests(unittest.TestCase):
    def test_replans_with_fresh_link(self) -> None:
        entry = _entry()
        kio = FakeKio()
        with mock.patch.object(d, "_fetch_post", return_value=PAGE):
            changed = d._refresh_stale_kio(
                entry, _settings(), sess=None, kio=kio, nahida=None,
                link_client=None, link_resolver=None, owners={}, taken=set(),
            )

        self.assertTrue(changed)
        self.assertEqual(kio.resolve_calls, [OLD_CODE, NEW_CODE])
        self.assertEqual(entry["links"], [NEW_LINK])
        self.assertEqual(entry["manual"], [])
        self.assertEqual(entry["mods"][0]["code"], NEW_CODE)
        self.assertEqual(entry["mods"][0]["collection"], "Qingxiao_AemeathOutfit.zip")
        self.assertEqual(entry["status"], "pending")
        # 预览图已经下完：重新规划不能把它打回 pending
        self.assertEqual(entry["images"][0]["status"], "done")

    def test_healthy_code_is_left_alone(self) -> None:
        entry = _entry(code=NEW_CODE, link=NEW_LINK)
        kio = FakeKio()
        with mock.patch.object(
            d, "_fetch_post", side_effect=AssertionError("不该重新抓帖子页")
        ):
            changed = d._refresh_stale_kio(
                entry, _settings(), sess=None, kio=kio, nahida=None,
                link_client=None, link_resolver=None, owners={}, taken=set(),
            )

        self.assertFalse(changed)
        self.assertEqual(kio.resolve_calls, [NEW_CODE])
        self.assertEqual(entry["mods"][0]["code"], NEW_CODE)

    def test_dead_link_still_ends_up_manual(self) -> None:
        """正文仍写旧码时重新规划不会伪造成功，跑完下载阶段仍回到 manual。"""
        entry = _entry()
        dead_page = PAGE.replace(B64, base64.b64encode(OLD_LINK.encode()).decode())
        kio = FakeKio()
        with mock.patch.object(d, "_fetch_post", return_value=dead_page):
            changed = d._refresh_stale_kio(
                entry, _settings(), sess=None, kio=kio, nahida=None,
                link_client=None, link_resolver=None, owners={}, taken=set(),
            )

        self.assertTrue(changed)
        self.assertEqual(entry["mods"], [])
        self.assertTrue(entry["manual"])
        # 规划阶段因为还有预览图会先记 pending；下载阶段没有待办项，
        # 收尾时按 manual 落库（`_process_queue_inner` 末尾）。
        self.assertFalse(d._has_pending(entry))


if __name__ == "__main__":
    unittest.main()
