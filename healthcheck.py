#!/usr/bin/env python3
"""每日健康巡检：一条微信汇总三个来源的状态。

为什么需要它：程序已经出过两次**静默故障** ——
  1) GameBanana 的 HTML 生成不出来，且不报错
  2) 历史条目被反复当成新 mod 推送
两次都是人工检查才发现的，系统一次都没主动说过话。这个巡检就是补上这一环。

检查项：
  - 数据新鲜度：距上次"有新 mod"过了几天（超过阈值 → 警告）
  - 文件完整性：all_mods.csv / index.html / 当日 CSV / images 是否都在
  - 服务状态：systemd 是否 active
  - GameBanana：读本机推上来的状态文件；文件过期 → 说明本机没开机

由 systemd timer 每天定时调用（见 deploy/kekehxl-healthcheck.timer）。
"""

from __future__ import annotations

import configparser
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from kekehxl_watcher.notify import Notifier  # noqa: E402
from patreon_watcher.client import ApiError, PatreonClient  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("health")

# (来源名, 配置文件, systemd 服务名)
SERVER_SOURCES = [
    ("可可站", BASE_DIR / "config.ini", "kekehxl-watcher"),
    ("NexusMods", BASE_DIR / "config.nexus.ini", "nexus-watcher"),
    ("arca.live", BASE_DIR / "config.arca.ini", "arca-watcher"),
    ("Patreon", BASE_DIR / "config.patreon.ini", "patreon-watcher"),
    # 爱发电：按作者分目录 + 匿名接口，没有登录态可查，用通用的文件/新鲜度检查即可
    ("爱发电", BASE_DIR / "config.afdian.ini", "afdian-watcher"),
]
GB_STATUS = BASE_DIR / "status" / "gb_status.json"

STALE_DAYS = 7           # 超过这么多天没新 mod 就告警
GB_STALE_HOURS = 6       # GameBanana 状态文件超过这么多小时没更新 → 本机没开机


def service_active(name: str) -> bool:
    try:
        r = subprocess.run(["systemctl", "is-active", name], capture_output=True, text=True, timeout=15)
        return r.stdout.strip() == "active"
    except Exception:  # noqa: BLE001
        return False


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {}


def _hours_since(iso) -> float | None:
    try:
        return (datetime.now() - datetime.fromisoformat(iso)).total_seconds() / 3600
    except (TypeError, ValueError):
        return None


def _age_text(hours: float) -> str:
    if hours < 1:
        return f"{hours * 60:.0f} 分钟前"
    if hours < 48:
        return f"{hours:.1f} 小时前"
    return f"{hours / 24:.1f} 天前"


def _freshness(st: dict) -> str:
    """状态行尾部的「轮询新鲜度」。

    两个时间戳分工不同，必须分开看：
      - last_poll（每轮都写）：服务是否还在跑
      - last_new_at（只在入库时写）：站点是否长期没出新品

    合并成一个字段就会把「站点安静」误报成「服务停摆」——2026-10-12 可可站
    连续两天没新品，旧逻辑据此报了「34.5 小时未轮询」，实际每 10 分钟都在跑。
    """
    parts: list[str] = []

    poll_h = _hours_since(st.get("last_poll"))
    if poll_h is None:
        parts.append("⚠️ 无轮询记录")
    else:
        parts.append(f"{_age_text(poll_h)}轮询过" + (" ⚠️" if poll_h > 24 else ""))

    new_h = _hours_since(st.get("last_new_at"))
    if new_h is not None:
        parts.append(
            f"上次有新 mod {_age_text(new_h)}" + (" ⚠️" if new_h > STALE_DAYS * 24 else "")
        )
    return "，" + " · ".join(parts)


def _units(out_dir: Path) -> list[Path]:
    """把一个来源的产出目录拆成若干「单元」。

    ⚠️ 为什么需要这层：Patreon 改成了**每个作者一套产出**
    （`out/Patreon/<vanity>/` 各有一份 CSV / images / index.html），
    于是 `out/Patreon/` 底下**直接没有 `W-*.csv` 了** —— 旧逻辑在这里会报
    「无每日 CSV、无总表」❌，把好好的归档误报成故障。
    这里统一成「有产出的目录才算单元」，两种布局都吃得下。
    """
    def has_产出(d: Path) -> bool:
        return bool(list(d.glob("W-*.csv"))) or (d / "all_mods.csv").exists()

    if has_产出(out_dir):
        return [out_dir]
    subs = [
        d for d in sorted(out_dir.iterdir())
        if d.is_dir() and not d.name.startswith(".") and has_产出(d)
    ]
    return subs or [out_dir]


def _read_states(state_file: Path) -> dict:
    """读来源状态；多作者来源（Patreon）聚合出一份「代表状态」。

    多作者时状态是 `state.patreon.<vanity>.json` 一批文件。这里对
    `last_poll` / `last_new_at` 取**最新的那个** —— 日报要回答的是
    「这个来源还在跑吗」，多个作者里只要有一个跑通就说明服务活着。
    """
    if state_file.exists():
        return read_json(state_file)
    # `state.patreon.*.json`：⚠️ 必须排除 state.patreon.<作者>.refill.json
    # （回填记录，不是状态）。靠点数区分：作者状态比基础名多恰好一个点。
    want_dots = state_file.name.count(".") + 1
    merged: dict = {}
    for p in sorted(state_file.parent.glob(f"{state_file.stem}.*{state_file.suffix}")):
        if p.name.count(".") != want_dots:
            continue
        st = read_json(p)
        for k in ("last_poll", "last_new_at"):
            v = st.get(k)
            if v and (merged.get(k) is None or str(v) > str(merged[k])):
                merged[k] = v
    return merged


def check_source(name: str, cfg_path: Path, service: str) -> list[str]:
    lines: list[str] = []
    cfg = configparser.ConfigParser()
    # 与 patreon_watcher.poller.load_config 同理：键名大小写要在 read 之前定死，
    # 否则 `[creators]` 的 vanity 会被小写化（这里虽然只读 storage/site，但保持一致）
    cfg.optionxform = str  # type: ignore[assignment]
    if not cfg_path.exists():
        return [f"❌ **{name}**：找不到配置 {cfg_path.name}"]
    cfg.read(cfg_path, encoding="utf-8")

    out_root = Path(cfg["storage"].get("out_dir", "out"))
    if not out_root.is_absolute():
        out_root = BASE_DIR / out_root
    out_dir = out_root / cfg["site"].get("source_name", name)
    encoding = cfg["storage"].get("csv_encoding", "utf-8-sig")

    # 服务状态
    active = service_active(service)
    svc = "✅" if active else "❌ 服务未运行"
    if not out_dir.exists():
        return [f"❌ **{name}**：归档目录不存在 {out_dir}"]

    # 文件完整性（跨单元聚合：Patreon 是每作者一个单元）
    units = _units(out_dir)
    csvs = [c for u in units for c in u.glob("W-*.csv")]
    thumbs = [
        t for u in units
        for t in ((u / "images").glob("*") if (u / "images").exists() else [])
    ]
    missing_total = [u.name for u in units if not (u / "all_mods.csv").exists()]
    missing_index = [u.name for u in units if not (u / "index.html").exists()]
    problems = []
    if not csvs:
        problems.append("无每日 CSV")
    if missing_total:
        problems.append(f"{len(missing_total)} 个单元无总表")
    if missing_index:
        problems.append(f"{len(missing_index)} 个单元无 index.html")
    if csvs and not thumbs:
        problems.append("无预览图")
    files = "✅" if not problems else "❌ " + "、".join(problems)

    # 数据新鲜度：last_poll（服务是否在跑）+ last_new_at（站点是否在出货）
    state_file = BASE_DIR / cfg["storage"].get("state_file", "state.json")
    st = _read_states(state_file)
    fresh = _freshness(st)

    total = 0
    for u in units:
        total_file = u / "all_mods.csv"
        if total_file.exists():
            total += sum(1 for _ in open(total_file, encoding=encoding)) - 1

    unit_hint = f" · {len(units)} 个作者" if len(units) > 1 else ""
    lines.append(
        f"{'✅' if active and not problems else '⚠️'} **{name}**：{svc} · 文件 {files}{unit_hint}"
    )
    lines.append(f"   累计 {total} 条 · 每日表 {len(csvs)} 个 · 图 {len(thumbs)} 张{fresh}")
    return lines


def check_patreon_auth(cfg_path: Path) -> list[str]:
    """Patreon 登录态探针（不是检查文件，是**主动打一次接口**）。

    ⚠️ 必须单独查：session 过期后 Patreon **不报错**，只是悄悄把预览图换成模糊版。
    服务 active、last_poll 新鲜、CSV/图/HTML 齐全 —— 全都正常。唯一能提前发现
    的就是这个探针。这是继「HTML 生成不出来」「历史被当新帖重推」之后的
    **第三种静默故障**。
    """
    try:
        cfg = configparser.ConfigParser()
        cfg.read(cfg_path, encoding="utf-8")
        sess_file = cfg["auth"].get("session_file", "").strip() if cfg.has_section("auth") else ""
    except Exception as exc:  # noqa: BLE001
        return [f"⚠️ **Patreon 登录态**：配置读取失败 {exc}"]

    if not sess_file:
        return ["⚠️ **Patreon 登录态**：未配置 session —— 预览图为模糊（见 README）"]

    path = Path(sess_file)
    if not path.is_absolute():
        path = BASE_DIR / path
    # 探针只要一个是/否，超时和重试都压到最小，别拖慢整条日报
    client = PatreonClient(timeout=15, retry=1, session_file=path)
    if not client.session_configured:
        return [f"⚠️ **Patreon 登录态**：凭据文件读不到内容（{path.name}）"]
    try:
        user = client.current_user()
    except ApiError as exc:
        # 网络问题 ≠ 凭据失效，别让一次抖动把人叫去换 cookie
        return [f"⚠️ **Patreon 登录态**：探测失败（网络原因）{exc}"]
    if user:
        return [
            f"✅ **Patreon 登录态**：有效"
            f"（user {user.get('id')} · can_see_nsfw={user.get('can_see_nsfw')}）"
        ]
    return [
        "❌ **Patreon 登录态失效**：预览图已退化为模糊！"
        "更新 patreon_session.txt 后重启 patreon-watcher，"
        "并重跑 patreon_refresh_previews.py 回填这段期间的图"
    ]


def check_gamebanana() -> list[str]:
    if not GB_STATUS.exists():
        return ["⚠️ **GameBanana**：没有收到本机状态文件（本机采集任务可能没在跑）"]
    st = read_json(GB_STATUS)
    ts = st.get("updated_at", "")
    try:
        age_h = (datetime.now() - datetime.fromisoformat(ts)).total_seconds() / 3600
    except ValueError:
        return ["⚠️ **GameBanana**：状态文件时间格式异常"]

    total = st.get("total", "?")
    last_new = st.get("last_new_at") or "（尚无）"
    if age_h > GB_STALE_HOURS:
        return [
            f"⚠️ **GameBanana**：状态文件已 {age_h/24:.1f} 天未更新 —— 本机可能一直没开机",
            f"   累计 {total} 条 · 上次有新 mod：{last_new}",
        ]
    return [
        f"✅ **GameBanana**：本机 {age_h:.1f} 小时前跑过 · {_service_word(age_h)}",
        f"   累计 {total} 条 · 上次有新 mod：{last_new}",
    ]


def _service_word(age_h: float) -> str:
    return "运行正常" if age_h <= GB_STALE_HOURS else "可能停摆"


def _serverchan_key() -> str:
    """Server酱 SendKey：优先环境变量，其次项目里的真实配置。

    不要硬编码进源码 —— 仓库是公开的。服务器上 config.ini 有 [notify] 段，
    本机则读 config.gb.ini。都没有时 Notifier 会自动禁用推送，巡检照常输出。
    """
    key = os.environ.get("SERVERCHAN_KEY", "").strip()
    if key:
        return key
    for name in ("config.gb.ini", "config.ini"):
        path = BASE_DIR / name
        if not path.exists():
            continue
        try:
            cfg = configparser.ConfigParser()
            cfg.read(path, encoding="utf-8")
            value = (
                cfg["notify"].get("serverchan_key", "").strip()
                if cfg.has_section("notify")
                else ""
            )
        except (OSError, configparser.Error):
            continue
        if value:
            return value
    return ""


def main() -> int:
    notifier = Notifier(
        key=_serverchan_key(),
        enabled=True,
    )
    lines: list[str] = []
    for name, cfg_path, service in SERVER_SOURCES:
        try:
            lines += check_source(name, cfg_path, service)
            if name == "Patreon":
                # 附加探针：Patreon 的模糊降级是静默的，文件检查看不出来
                lines += check_patreon_auth(cfg_path)
        except Exception as exc:  # noqa: BLE001 - 单个来源出错不应中断整体巡检
            lines.append(f"❌ **{name}**：巡检出错 {exc}")
    try:
        lines += check_gamebanana()
    except Exception as exc:  # noqa: BLE001
        lines.append(f"❌ **GameBanana**：巡检出错 {exc}")

    problems = sum(1 for ln in lines if ln.startswith("⚠️") or ln.startswith("❌"))
    title = "Mod 监测日报 · 全部正常" if problems == 0 else f"Mod 监测日报 · {problems} 项需注意"
    body = "### 各来源状态\n\n" + "\n".join(lines)
    body += f"\n\n---\n巡检时间：{datetime.now().strftime('%Y-%m-%d %H:%M')}"

    ok = notifier.send(title, body)
    log.info("巡检完成，%d 项需注意，推送%s", problems, "成功" if ok else "失败")
    for ln in lines:
        log.info("  %s", ln)
    return 0


if __name__ == "__main__":
    sys.exit(main())
