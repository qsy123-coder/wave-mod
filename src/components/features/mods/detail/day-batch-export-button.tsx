"use client";

import { useState } from "react";
import { Archive } from "lucide-react";
import { toast } from "sonner";

import type { SiteMod } from "@/lib/mods-domain/types";

import { exportDayShareImages } from "./export-day-share-images";

type DayBatchExportButtonProps = {
  /** 当天全部公开 mod（已按 created_at 倒序），直接作为 client props 传入 */
  mods: SiteMod[];
  /** 日期键 YYYY-MM-DD，用于 zip 文件名 */
  dateKey: string;
};

/**
 * 每日更新每个日期分组标题旁的「批量导出」按钮。
 *
 * 一键把当天所有 mod 的分享面板逐张渲染成 PNG 打包成 zip。逐张生成期间按钮禁用并
 * 显示「导出中…」，结束后按成功/失败数给 toast；失败不中断整批。
 */
export function DayBatchExportButton({ mods, dateKey }: DayBatchExportButtonProps) {
  const [working, setWorking] = useState(false);

  if (mods.length === 0) return null;

  const handleExport = async () => {
    if (working) return;
    setWorking(true);
    try {
      const { ok, failed } = await exportDayShareImages(mods, dateKey);
      if (failed === 0) {
        toast.success(`已导出 ${ok} 张分享图`);
      } else {
        toast.success(`已导出 ${ok} 张，失败 ${failed} 张`);
      }
    } catch {
      toast.error("批量导出失败，请重试");
    } finally {
      setWorking(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={working}
      aria-label={`批量导出 ${dateKey} 的分享图`}
      className="shrink-0 border-4 border-black bg-[var(--neo-accent)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition hover:-translate-y-0.5 active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Archive className="mr-1 inline size-3.5" strokeWidth={3} />
      {working ? "导出中…" : "批量导出"}
    </button>
  );
}
