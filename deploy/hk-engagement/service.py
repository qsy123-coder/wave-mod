#!/usr/bin/env python3
"""WaveMod 互动计数服务（跑在香港反代机上）。

为什么会有这个服务
------------------
2026-10-24 Supabase 免费出口额度第三次被打穿，网关对 REST/Auth/Storage 一律回 402。
计数因此**既读不出来也写不进去**：前台退回 2026-10-02 的基线，新 mod 显示 0；
用户点浏览/下载只在前端加了一次，刷新即丢。

计数本来就不需要关系库：它只是一个「按设备去重」的累加器。这里把它放回自己的
服务器上，状态落本地 JSON（原子写入 + 定时镜像 COS），与 Supabase 彻底解耦。

与 TypeScript 侧的分工
----------------------
本服务只存**增量**（点赞过的设备、收藏过的设备、浏览/下载计数与当天去重表），
不读 `data/engagement-baseline.json`，也不做「浏览量 × 65%」这类展示口径。
展示口径仍然只在 `src/lib/engagement/store-core.ts` 一处：应用拿到 increments 后
用 `computeCountsFromIncrements` 合成最终数字。这样换存储不会让计数悄悄偏掉。

状态格式与 store-core.ts 的 EngagementState 完全一致，迁移/回滚都是直接拷 JSON。

接口（全部要求 X-Wavemod-Key 头）
--------------------------------
POST /read       {ids:[uuid…], deviceId?}
                 → {counts:{id:{likes,favorites,views,downloads}}, mine:{id:{liked,favorited}}}
POST /apply      {modId, action, deviceId, day:"YYYY-MM-DD"}
                 → {increments:{likes,favorites,views,downloads}, mine:{liked,favorited}}
GET  /favorited?deviceId=…  → {ids:[…]}   （最近收藏在前）
GET  /export                → 完整 state（备份/迁移用）
GET  /health                → {ok, mods, updatedAt, bytes}

⚠️ 只监听 127.0.0.1，由 nginx 的 `/__engagement/` 反代；不要直接暴露端口。
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import shutil
import threading
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

STATE_PATH = os.environ.get("ENGAGEMENT_STATE_PATH", "/var/lib/wavemod-engagement/state.json")
HOST = os.environ.get("ENGAGEMENT_HOST", "127.0.0.1")
PORT = int(os.environ.get("ENGAGEMENT_PORT", "8791"))
SECRET = os.environ.get("ENGAGEMENT_REMOTE_SECRET", "").strip()

# 单次 read 的 id 上限。热度排序会一次传整表（当前约 5.5k），留一倍余量。
MAX_IDS = 12_000
MAX_BODY_BYTES = 4 * 1024 * 1024

# 上海日历日；应用总会带上 day，这里只做格式校验与兜底。
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MOD_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
DEVICE_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
ACTIONS = {"like", "unlike", "favorite", "unfavorite", "view", "download"}

# 浏览/下载去重表只保留最近两天（与 store.ts 的 VIEW_DAY_KEEP 一致）
DAY_KEEP = 2

# COS 镜像：同一份状态每 5 分钟最多传一次，失败只记日志
COS_MIN_INTERVAL = 300
COS_KEY = "engagement/live.json"

_lock = threading.RLock()
_state = {"version": 1, "mods": {}}
_updated_at = 0
_last_backup_at = 0
_last_mirror_at = 0
_mirroring = False


# ---------------------------------------------------------------------------
# 状态解析与落盘
# ---------------------------------------------------------------------------
def _empty_entry() -> dict:
    return {
        "likedBy": [],
        "favoritedBy": [],
        "favoritedAt": {},
        "views": 0,
        "viewDays": {},
        "downloadDays": {},
        "downloads": 0,
    }


def _str_list(value) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str) and item]


def _count(value) -> int:
    if isinstance(value, bool):
        return 0
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return number if number > 0 else 0


def _day_buckets(value) -> dict[str, list[str]]:
    buckets: dict[str, list[str]] = {}
    if not isinstance(value, dict):
        return buckets
    for day, devices in value.items():
        if not isinstance(day, str) or not DAY_RE.match(day):
            continue
        parsed = _str_list(devices)
        if parsed:
            buckets[day] = parsed
    return buckets


def _sanitize_entry(value) -> dict:
    """宽进严出：坏字段丢掉，好字段救回来 —— 与 store-core.parseState 同一条原则。"""
    entry = _empty_entry()
    if not isinstance(value, dict):
        return entry

    entry["likedBy"] = _str_list(value.get("likedBy"))
    entry["favoritedBy"] = _str_list(value.get("favoritedBy"))

    favorited_at = value.get("favoritedAt")
    if isinstance(favorited_at, dict):
        entry["favoritedAt"] = {
            device: at
            for device, at in favorited_at.items()
            if isinstance(device, str) and isinstance(at, str) and at
        }

    entry["views"] = _count(value.get("views"))
    entry["downloads"] = _count(value.get("downloads"))
    entry["viewDays"] = _day_buckets(value.get("viewDays"))
    entry["downloadDays"] = _day_buckets(value.get("downloadDays"))
    return entry


def load_state() -> None:
    global _state, _updated_at
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except FileNotFoundError:
        raw = None
    except Exception as error:  # noqa: BLE001
        # 文件存在却读不出来时**拒绝启动**：以空状态继续会在下一次写入时
        # 把整份计数覆盖成 0，这比服务起不来更难查。
        raise SystemExit(f"状态文件无法解析，拒绝以空状态启动（{STATE_PATH}）: {error}")

    mods = raw.get("mods") if isinstance(raw, dict) else None
    state = {"version": 1, "mods": {}}
    if isinstance(mods, dict):
        for mod_id, value in mods.items():
            if isinstance(mod_id, str) and MOD_ID_RE.match(mod_id):
                state["mods"][mod_id] = _sanitize_entry(value)

    _state = state
    _updated_at = int(time.time() * 1000)
    print(f"[engagement-service] 已载入 {len(state['mods'])} 条资源 / {STATE_PATH}", flush=True)


def _save_locked() -> None:
    global _updated_at, _last_backup_at
    directory = os.path.dirname(STATE_PATH) or "."
    os.makedirs(directory, exist_ok=True)

    # 每小时留一份 .bak：原子替换能防半截文件，但防不了「逻辑写坏」。
    now = time.time()
    if os.path.exists(STATE_PATH) and now - _last_backup_at > 3600:
        try:
            shutil.copy2(STATE_PATH, f"{STATE_PATH}.bak")
            _last_backup_at = now
        except OSError as error:
            print(f"[engagement-service] 备份失败: {error}", flush=True)

    tmp_path = f"{STATE_PATH}.tmp"
    with open(tmp_path, "w", encoding="utf-8") as handle:
        json.dump(_state, handle, ensure_ascii=False, separators=(",", ":"))
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(tmp_path, STATE_PATH)

    # rename 之后再 fsync 目录，确保目录项也落盘（掉电时 rename 不会白做）
    try:
        dir_fd = os.open(directory, os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except OSError:
        pass

    _updated_at = int(now * 1000)


def _state_bytes() -> bytes:
    return json.dumps(_state, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


# ---------------------------------------------------------------------------
# 计数逻辑（与 store-core.ts 的 applyAction 保持同语义）
# ---------------------------------------------------------------------------
def _slot(mod_id: str) -> dict:
    entry = _state["mods"].get(mod_id)
    if entry is None:
        entry = _empty_entry()
        _state["mods"][mod_id] = entry
    return entry


def _toggle(bucket: list[str], device_id: str) -> bool:
    if device_id in bucket:
        bucket.remove(device_id)
        return False
    bucket.append(device_id)
    return True


def _prune(days: dict[str, list[str]], today: str) -> None:
    today_date = date.fromisoformat(today)
    keep = {(today_date - timedelta(days=offset)).isoformat() for offset in range(DAY_KEEP)}
    for day in list(days.keys()):
        if day not in keep:
            del days[day]


def _prune_all(today: str) -> None:
    for entry in _state["mods"].values():
        _prune(entry["viewDays"], today)
        _prune(entry["downloadDays"], today)


def apply_action(action: str, mod_id: str, device_id: str, day: str) -> dict:
    entry = _slot(mod_id)

    if action == "like":
        _toggle(entry["likedBy"], device_id)
    elif action == "unlike":
        if device_id in entry["likedBy"]:
            entry["likedBy"].remove(device_id)
    elif action == "favorite":
        active = _toggle(entry["favoritedBy"], device_id)
        if active:
            entry["favoritedAt"][device_id] = (
                datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
            )
        else:
            entry["favoritedAt"].pop(device_id, None)
    elif action == "unfavorite":
        if device_id in entry["favoritedBy"]:
            entry["favoritedBy"].remove(device_id)
        entry["favoritedAt"].pop(device_id, None)
    elif action == "view":
        bucket = entry["viewDays"].setdefault(day, [])
        if device_id not in bucket:
            bucket.append(device_id)
            entry["views"] += 1
    elif action == "download":
        bucket = entry["downloadDays"].setdefault(day, [])
        if device_id not in bucket:
            bucket.append(device_id)
            entry["downloads"] += 1
    else:
        raise ValueError("unknown action")

    # 与 fsWriteEngagement 一致：每次写都顺手裁一次全站去重表
    _prune_all(day)

    return _increments(entry)


def _increments(entry: dict | None) -> dict:
    if entry is None:
        return {"likes": 0, "favorites": 0, "views": 0, "downloads": 0}
    return {
        "likes": len(entry["likedBy"]),
        "favorites": len(entry["favoritedBy"]),
        "views": entry["views"],
        "downloads": entry["downloads"],
    }


def _mine(entry: dict | None, device_id: str) -> dict:
    if not entry or not device_id:
        return {"liked": False, "favorited": False}
    return {
        "liked": device_id in entry["likedBy"],
        "favorited": device_id in entry["favoritedBy"],
    }


# ---------------------------------------------------------------------------
# COS 镜像（SigV5，纯标准库）
# ---------------------------------------------------------------------------
def _cos_put(body: bytes) -> None:
    secret_id = os.environ.get("COS_SECRET_ID", "").strip()
    secret_key = os.environ.get("COS_SECRET_KEY", "").strip()
    bucket = os.environ.get("COS_BUCKET", "").strip()
    region = os.environ.get("COS_REGION", "").strip()
    if not (secret_id and secret_key and bucket and region):
        return

    now = int(time.time())
    sign_time = f"{now - 60};{now + 600}"

    # COS 签名 v5 分两层（见官方 cos_auth.py）：
    #   format_str  = "method\nuri\nparams\nheaders\n"
    #   str_to_sign = "sha1\n{sign_time}\n{sha1(format_str)}\n"
    #   sign_key    = HMAC-SHA1(secret_key, sign_time)
    #   signature   = HMAC-SHA1(sign_key, str_to_sign)
    # 直接把 format_str 喂给最后一层会一直 403 SignatureDoesNotMatch ——
    # 2026-10-24 踩过：COS 返回的 XML 里 <StringToSign> 就是正确的那串。
    format_str = f"put\n/{COS_KEY}\n\n\n"
    format_digest = hashlib.sha1(format_str.encode()).hexdigest()
    string_to_sign = f"sha1\n{sign_time}\n{format_digest}\n"
    sign_key = hmac.new(secret_key.encode(), sign_time.encode(), hashlib.sha1).hexdigest()
    signature = hmac.new(sign_key.encode(), string_to_sign.encode(), hashlib.sha1).hexdigest()
    authorization = (
        f"q-sign-algorithm=sha1&q-ak={secret_id}&q-sign-time={sign_time}"
        f"&q-key-time={sign_time}&q-header-list=&q-url-param-list=&q-signature={signature}"
    )

    url = f"https://{bucket}.cos.{region}.myqcloud.com/{COS_KEY}"
    request = urllib.request.Request(
        url,
        data=body,
        method="PUT",
        headers={"Authorization": authorization, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f"COS HTTP {response.status}")


def _mirror_async() -> None:
    global _last_mirror_at, _mirroring
    now = time.time()
    if _mirroring or now - _last_mirror_at < COS_MIN_INTERVAL:
        return
    _last_mirror_at = now
    _mirroring = True
    with _lock:
        body = _state_bytes()

    def run() -> None:
        global _mirroring, _last_mirror_at
        try:
            _cos_put(body)
        except Exception as error:  # noqa: BLE001 - 镜像失败绝不影响计数
            print(f"[engagement-service] COS 镜像失败（计数不受影响）: {error}", flush=True)
            _last_mirror_at = 0
        finally:
            _mirroring = False

    threading.Thread(target=run, daemon=True).start()


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
def _json_response(handler: BaseHTTPRequestHandler, status: int, payload: dict) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    try:
        handler.send_response(status)
        handler.send_header("Content-Type", "application/json; charset=utf-8")
        handler.send_header("Content-Length", str(len(body)))
        handler.send_header("Cache-Control", "no-store")
        handler.end_headers()
        handler.wfile.write(body)
    except (BrokenPipeError, ConnectionResetError):
        # 调用方超时断开是常态（Vercel 5s 截止），不是错误
        pass


def _authorized(handler: BaseHTTPRequestHandler) -> bool:
    provided = handler.headers.get("X-Wavemod-Key", "")
    return bool(SECRET) and hmac.compare_digest(provided, SECRET)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "wavemod-engagement/1"

    def log_message(self, fmt, *args):  # noqa: A003 - 覆盖基类，避免每请求打一行
        if self.command == "POST" and self.path != "/health":
            return
        print(f"[engagement-service] {self.address_string()} {fmt % args}", flush=True)

    def _read_json(self) -> dict | None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return None
        if length <= 0 or length > MAX_BODY_BYTES:
            return None
        try:
            payload = json.loads(self.rfile.read(length))
        except Exception:  # noqa: BLE001
            return None
        return payload if isinstance(payload, dict) else None

    def do_GET(self):  # noqa: N802
        if not _authorized(self):
            _json_response(self, 401, {"error": "unauthorized"})
            return

        parsed = urllib.parse.urlparse(self.path)
        query = urllib.parse.parse_qs(parsed.query)

        if parsed.path == "/health":
            with _lock:
                size = len(_state_bytes())
                payload = {
                    "ok": True,
                    "mods": len(_state["mods"]),
                    "updatedAt": _updated_at,
                    "bytes": size,
                }
            _json_response(self, 200, payload)
            return

        if parsed.path == "/export":
            # 在锁内做一次拷贝：解锁后再序列化会把并发写入的半截状态发出去
            with _lock:
                payload = json.loads(_state_bytes())
            _json_response(self, 200, payload)
            return

        if parsed.path == "/favorited":
            device_id = (query.get("deviceId") or [""])[0]
            if not DEVICE_RE.match(device_id):
                _json_response(self, 400, {"error": "bad deviceId"})
                return
            with _lock:
                rows = [
                    (mod_id, entry["favoritedAt"].get(device_id, ""))
                    for mod_id, entry in _state["mods"].items()
                    if device_id in entry["favoritedBy"]
                ]
            rows.sort(key=lambda item: item[1], reverse=True)
            _json_response(self, 200, {"ids": [mod_id for mod_id, _ in rows]})
            return

        _json_response(self, 404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        if not _authorized(self):
            _json_response(self, 401, {"error": "unauthorized"})
            return

        payload = self._read_json()
        if payload is None:
            _json_response(self, 400, {"error": "bad json"})
            return

        if self.path == "/read":
            ids = payload.get("ids")
            device_id = payload.get("deviceId") or ""
            if not isinstance(ids, list) or not ids or len(ids) > MAX_IDS:
                _json_response(self, 400, {"error": "bad ids"})
                return
            if device_id and not DEVICE_RE.match(device_id):
                _json_response(self, 400, {"error": "bad deviceId"})
                return

            counts = {}
            mine = {}
            with _lock:
                for mod_id in ids:
                    if not isinstance(mod_id, str) or not MOD_ID_RE.match(mod_id):
                        continue
                    entry = _state["mods"].get(mod_id)
                    counts[mod_id] = _increments(entry)
                    if device_id:
                        mine[mod_id] = _mine(entry, device_id)
            _json_response(self, 200, {"counts": counts, "mine": mine})
            return

        if self.path == "/apply":
            mod_id = payload.get("modId")
            action = payload.get("action")
            device_id = payload.get("deviceId")
            day = payload.get("day")

            if not isinstance(mod_id, str) or not MOD_ID_RE.match(mod_id):
                _json_response(self, 400, {"error": "bad modId"})
                return
            if action not in ACTIONS:
                _json_response(self, 400, {"error": "bad action"})
                return
            if not isinstance(device_id, str) or not DEVICE_RE.match(device_id):
                _json_response(self, 400, {"error": "bad deviceId"})
                return
            if not isinstance(day, str) or not DAY_RE.match(day):
                _json_response(self, 400, {"error": "bad day"})
                return

            with _lock:
                increments = apply_action(action, mod_id, device_id, day)
                try:
                    _save_locked()
                except OSError as error:
                    # 内存已更新，用户这次操作仍然生效；但必须留痕，否则又会变成
                    # 「重启后数字凭空少一截」且没人知道为什么。
                    print(f"[engagement-service] 写盘失败（本次只在内存生效）: {error}", flush=True)
                entry = _state["mods"].get(mod_id)
                mine = _mine(entry, device_id)
            _mirror_async()
            _json_response(self, 200, {"increments": increments, "mine": mine})
            return

        _json_response(self, 404, {"error": "not found"})


def main() -> None:
    if not SECRET:
        raise SystemExit("缺少 ENGAGEMENT_REMOTE_SECRET，拒绝启动（否则接口等于裸奔）")
    load_state()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.daemon_threads = True
    print(f"[engagement-service] listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
