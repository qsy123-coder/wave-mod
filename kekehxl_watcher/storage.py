"""CSV 归档与状态存储（**各来源共用**的通用模块）。

产出：
    out/W-YYYY.M.D.csv   —— 按站点发布日期分类的每日汇总
    out/all_mods.csv     —— 全量总表（追加去重，永不删除历史行）
    out/_新发现.log      —— 新发现的追加日志

不同来源的字段不同，通过 ``columns`` 参数传入各自的列定义（见下方 ``KEEKEXL_COLUMNS``
与 ``arca_watcher.columns.ARCA_COLUMNS``）。``id_field`` 指定去重所用的字段名。
"""

from __future__ import annotations

import csv
import json
import logging
from datetime import datetime
from pathlib import Path
from typing import Any

log = logging.getLogger("storage")

# 可可站（kekehxl）的列定义
KEEKEXL_COLUMNS = [
    "日期",
    "来源",
    "mod名称",
    "夸克链接",
    "提取码",
    "解压码",
    "分类",
    "角色标签",
    "网站页面链接",
    "预览图",
    "product_id",
    "发布时间",
    "首次发现时间",
]

# 向后兼容旧名字
COLUMNS = KEEKEXL_COLUMNS


class Store:
    def __init__(
        self,
        out_dir: str | Path,
        state_file: str | Path,
        encoding: str = "utf-8-sig",
        columns: list[str] | None = None,
        id_field: str = "product_id",
    ) -> None:
        self.out_dir = Path(out_dir)
        self.out_dir.mkdir(parents=True, exist_ok=True)
        self.state_file = Path(state_file)
        self.encoding = encoding
        self.columns = list(columns) if columns else list(KEEKEXL_COLUMNS)
        self.id_field = id_field
        self.state: dict[str, Any] = self._load_state()

    # ---------- state ----------

    def _load_state(self) -> dict[str, Any]:
        if self.state_file.exists():
            try:
                return json.loads(self.state_file.read_text(encoding="utf-8"))
            except (json.JSONDecodeError, OSError) as exc:
                log.warning("状态文件损坏，重建：%s", exc)
        return {"seen_ids": [], "last_poll": None, "last_new_at": None, "initialized": False}

    def save_state(self) -> None:
        self.state_file.write_text(
            json.dumps(self.state, ensure_ascii=False, indent=1), encoding="utf-8"
        )

    @property
    def seen_ids(self) -> set[str]:
        return set(str(x) for x in self.state.get("seen_ids", []))

    def mark_polled(self) -> None:
        """记录「这一轮确实跑通了」，每轮都调用。

        与 last_new_at 分开是有原因的：站点可能连续多天没有新 mod，但服务其实
        一直健康。若只靠「上次入库时间」判断轮询新鲜度，健康巡检会把这种情况
        误报成 ⚠️（2026-10-12 可可站就被报成「34.5 小时未轮询」，实测每 10 分钟
        都在跑）。
        """
        self.state["last_poll"] = datetime.now().isoformat(timespec="seconds")

    def mark_seen(self, ids: list[str], *, new: bool = True) -> None:
        """把 ids 记为已见。

        new=False 用于「标记已见但确实没入库」的场合（首次基线把历史条目标成已见、
        抓到条目但全被过滤掉）—— 此时只刷新 last_poll，不动 last_new_at，
        否则日报会把「基线建立」或「全是旧货」谎报成「刚刚有新 mod」。
        """
        merged = self.seen_ids | {str(i) for i in ids}
        self.state["seen_ids"] = sorted(merged)
        now = datetime.now().isoformat(timespec="seconds")
        self.state["last_poll"] = now
        if new:
            self.state["last_new_at"] = now

    # ---------- CSV ----------

    def _csv_path(self, date_str: str) -> Path:
        """按用户既有习惯命名：W-YYYY.M.D（月/日不补零，如 W-2026.10.8）。"""
        try:
            y, m, d = (int(x) for x in date_str.split("-"))
            name = f"W-{y}.{m}.{d}"
        except ValueError:
            name = f"W-{date_str.replace('-', '.')}"
        return self.out_dir / f"{name}.csv"

    def _read_existing_ids(self, path: Path) -> set[str]:
        if not path.exists():
            return set()
        try:
            with path.open("r", encoding=self.encoding, newline="") as fh:
                return {row.get(self.id_field, "") for row in csv.DictReader(fh)}
        except OSError:
            return set()

    def _write_rows(self, path: Path, rows: list[dict[str, str]]) -> None:
        """把 rows 与文件中已有内容按 id_field 合并去重后重写。"""
        existing: dict[str, dict[str, str]] = {}
        if path.exists():
            try:
                with path.open("r", encoding=self.encoding, newline="") as fh:
                    for row in csv.DictReader(fh):
                        if row.get(self.id_field):
                            existing[row[self.id_field]] = row
            except OSError:
                pass
        for row in rows:
            existing[row[self.id_field]] = row

        ordered = sorted(
            existing.values(),
            key=lambda r: (r.get("发布时间", ""), r.get(self.id_field, "")),
        )
        with path.open("w", encoding=self.encoding, newline="") as fh:
            writer = csv.DictWriter(fh, fieldnames=self.columns, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(ordered)

    def archive(self, rows: list[dict[str, str]]) -> dict[str, int]:
        """写入每日 CSV + 总表 + 新发现日志。返回统计信息。"""
        if not rows:
            return {"daily": 0, "total": 0}

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for row in rows:
            row["首次发现时间"] = now

        # 按日期分组写每日 CSV
        by_date: dict[str, list[dict[str, str]]] = {}
        for row in rows:
            by_date.setdefault(row["日期"], []).append(row)
        for date_str, group in by_date.items():
            self._write_rows(self._csv_path(date_str), group)

        # 总表
        self._write_rows(self.out_dir / "all_mods.csv", rows)

        # 新发现日志（通用：按 columns 顺序输出除时间外的字段）
        log_path = self.out_dir / "_新发现.log"
        with log_path.open("a", encoding="utf-8") as fh:
            for row in rows:
                body = " | ".join(
                    f"{c}:{row.get(c, '')}" for c in self.columns if c != "首次发现时间"
                )
                fh.write(f"[{now}] {body}\n")

        log.info("已归档 %d 条新 mod（涉及 %d 个日期）", len(rows), len(by_date))
        return {"daily": len(rows), "total": len(rows)}
