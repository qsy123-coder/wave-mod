"use client";

import { useState } from "react";
import { X } from "lucide-react";

type ChapterEditorModalProps = {
  chapterKey: string;
  chapterTitle: string;
  onSave: (key: string, title: string) => void;
  onClose: () => void;
};

/**
 * Modal for editing chapter key (ID) + title.
 * Replaces the old `window.prompt` approach so both fields can be edited together.
 */
export function ChapterEditorModal({
  chapterKey,
  chapterTitle,
  onSave,
  onClose,
}: ChapterEditorModalProps) {
  const [key, setKey] = useState(chapterKey);
  const [title, setTitle] = useState(chapterTitle);
  const [keyError, setKeyError] = useState("");
  const [titleError, setTitleError] = useState("");

  const handleSave = () => {
    let valid = true;

    // Validate key: digits only (e.g. 00) or section-sub format (e.g. 03-1)
    if (!/^\d{1,4}(-\d{1,4})?$/.test(key.trim())) {
      setKeyError("编号格式：数字（如 00、01）或 数字-数字（如 03-1）");
      valid = false;
    } else {
      setKeyError("");
    }

    // Validate title
    if (!title.trim()) {
      setTitleError("标题不能为空");
      valid = false;
    } else {
      setTitleError("");
    }

    if (!valid) return;
    onSave(key.trim(), title.trim());
  };

  return (
    <div
      className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000]">
        {/* Header */}
        <div
          className="flex items-center justify-between border-b-4 border-black px-5 py-3"
          style={{ background: "var(--neo-accent)" }}
        >
          <h2 className="text-lg font-black">编辑章节</h2>
          <button
            type="button"
            onClick={onClose}
            className="border-[3px] border-black bg-white p-1 shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            aria-label="关闭"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5">
          {/* Chapter Key */}
          <div>
            <label className="text-xs font-black uppercase tracking-[0.12em] text-black/50">
              章节编号
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                setKeyError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") onClose();
              }}
              className={`mt-1 w-full border-[3px] px-3 py-2 text-sm font-bold outline-none ${
                keyError ? "border-red-500" : "border-black"
              }`}
              placeholder="00"
              autoFocus
            />
            {keyError && (
              <p className="mt-0.5 text-[11px] font-bold text-red-500">
                {keyError}
              </p>
            )}
          </div>

          {/* Chapter Title */}
          <div>
            <label className="text-xs font-black uppercase tracking-[0.12em] text-black/50">
              章节标题
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setTitleError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") onClose();
              }}
              className={`mt-1 w-full border-[3px] px-3 py-2 text-sm font-bold outline-none ${
                titleError ? "border-red-500" : "border-black"
              }`}
              placeholder="需要的工具和软件"
            />
            {titleError && (
              <p className="mt-0.5 text-[11px] font-bold text-red-500">
                {titleError}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t-4 border-black px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="border-[3px] border-black bg-white px-5 py-2 text-sm font-black shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="border-[3px] border-black px-5 py-2 text-sm font-black shadow-[3px_3px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
            style={{ background: "var(--neo-accent)" }}
          >
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
