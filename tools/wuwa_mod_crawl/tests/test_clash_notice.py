"""看板「Clash 出站超时」告警只认下载相关域名。

Clash 的 sidecar 日志里混着迅雷、QQ 心跳、Google 的 dial timeout，早期实现
只要看到 `i/o timeout` 就报警，导致看板长期挂着一条和下载无关的告警。
"""
from __future__ import annotations

import importlib
import sys
import time
from datetime import datetime
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
if str(BASE) not in sys.path:
    sys.path.insert(0, str(BASE))

web_status = importlib.import_module("web_status")


def _write_sidecar(appdata: Path, hosts: list[str]) -> None:
    sidecar = appdata / "io.github.clash-verge-rev.clash-verge-rev" / "logs" / "sidecar"
    sidecar.mkdir(parents=True, exist_ok=True)
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = []
    for host in hosts:
        lines.append(
            f'[{now}.000] time="x" level=warning msg="[TCP] dial ofm-lb '
            f'127.0.0.1:61098 --> {host}:443 error: failed to create session: '
            f'dial tcp 1.2.3.4:21021: i/o timeout"'
        )
    (sidecar / "sidecar_latest.log").write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_unrelated_host_timeout_is_ignored(tmp_path, monkeypatch):
    _write_sidecar(tmp_path, ["www.gstatic.com", "api-shoulei-ssl.xunlei.com"])
    monkeypatch.setenv("APPDATA", str(tmp_path))
    assert web_status._clash_proxy_notice() == ""


def test_download_host_timeout_is_reported(tmp_path, monkeypatch):
    _write_sidecar(tmp_path, ["www.gstatic.com", "filecache52.gamebanana.com"])
    monkeypatch.setenv("APPDATA", str(tmp_path))
    notice = web_status._clash_proxy_notice()
    assert "GameBanana" in notice and "arca" in notice


def test_stale_sidecar_log_is_ignored(tmp_path, monkeypatch):
    _write_sidecar(tmp_path, ["files.gamebanana.com"])
    log = (tmp_path / "io.github.clash-verge-rev.clash-verge-rev" / "logs"
           / "sidecar" / "sidecar_latest.log")
    old = time.time() - 3600
    log.touch()
    import os
    os.utime(log, (old, old))
    monkeypatch.setenv("APPDATA", str(tmp_path))
    assert web_status._clash_proxy_notice() == ""
