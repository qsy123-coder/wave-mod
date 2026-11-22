"""arca 正文外链提取的回归：base64 链接被段落拼接截断。

2026-11-22 的帖子 189953854（쇄명 수사키）正文是：

    <p>aHR0cHM6Ly9raW8uYWMvYy9hdUxQX2xaTUtwS0JEMzhaVG1hNmli</p><p>1주일</p>

旧实现只把 <br> 换成换行，两段被拼成 `…Nmli1주일`，贪婪正则吞掉 `1`，
长度 53 不是 4 的倍数 → 解码失败 → 只下到 4 张预览图、0 个 mod 文件。

跑法（工作目录 = tools/wuwa_mod_crawl）：

    F:\\Anaconda\\python.exe -m unittest tests.test_arca_link_extract -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from arca_watcher import downloader as d  # noqa: E402

BASE64 = "aHR0cHM6Ly9raW8uYWMvYy9hdUxQX2xaTUtwS0JEMzhaVG1hNmli"
EXPECTED = "https://kio.ac/c/auLP_lZMKpKBD38ZTma6ib"


class PostTextTests(unittest.TestCase):
    def test_block_tags_become_line_breaks(self) -> None:
        body = f"<p>{BASE64}</p><p>1주일</p>"
        text = d._post_text(body)
        self.assertIn(BASE64, text)
        self.assertNotIn(BASE64 + "1", text)

    def test_extracts_kio_link_from_separate_paragraphs(self) -> None:
        body = f"<p>{BASE64}</p><p>1주일</p>"
        self.assertEqual(d._extract_links(d._post_text(body)), [EXPECTED])


class Base64Tests(unittest.TestCase):
    def test_recovers_link_when_next_paragraph_is_fused(self) -> None:
        # 模拟旧 _post_text 的产物：base64 和下一段首字无缝相连
        text = f"{BASE64}1주일비번"
        self.assertEqual(d._decode_base64_urls(text), [EXPECTED])

    def test_plain_url_untouched(self) -> None:
        self.assertEqual(d._extract_links(f"받아 {EXPECTED}"), [EXPECTED])


if __name__ == "__main__":
    unittest.main()
