"use client";

import { useState, useCallback } from "react";
import { X, Plus, Trash2 } from "lucide-react";

// ── Types ──

export interface TextChapterData {
  intro: string;
  tools: ToolEntryData[];
}

export interface ToolEntryData {
  name: string;
  url: string;
  description: string;
  required: boolean;
  cloud_baidu: string;
  cloud_quark: string;
}

type TextChapterEditorModalProps = {
  data: TextChapterData;
  onSave: (data: TextChapterData) => void;
  onClose: () => void;
};

// ── Component ──

export function TextChapterEditorModal({
  data,
  onSave,
  onClose,
}: TextChapterEditorModalProps) {
  const [intro, setIntro] = useState(data.intro);
  const [tools, setTools] = useState<ToolEntryData[]>(
    data.tools.length > 0
      ? data.tools
      : [
          {
            name: "",
            url: "",
            description: "",
            required: false,
            cloud_baidu: "",
            cloud_quark: "",
          },
        ],
  );

  const addTool = useCallback(() => {
    setTools((prev) => [
      ...prev,
      {
        name: "",
        url: "",
        description: "",
        required: false,
        cloud_baidu: "",
        cloud_quark: "",
      },
    ]);
  }, []);

  const removeTool = useCallback((index: number) => {
    setTools((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateTool = useCallback(
    (index: number, field: keyof ToolEntryData, value: string | boolean) => {
      setTools((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], [field]: value };
        return updated;
      });
    },
    [],
  );

  const handleSave = () => {
    onSave({ intro, tools: tools.filter((t) => t.name.trim()) });
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto border-4 border-black bg-white shadow-[8px_8px_0px_0px_#000]">
        {/* Header */}
        <div
          className="flex items-center justify-between border-b-4 border-black px-5 py-3"
          style={{ background: "var(--neo-accent)" }}
        >
          <h2 className="text-lg font-black">编辑文字章节内容</h2>
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
          {/* Intro */}
          <div>
            <label className="text-xs font-black uppercase tracking-[0.12em] text-black/50">
              说明文字
            </label>
            <textarea
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              rows={5}
              className="mt-1 w-full border-[3px] border-black px-3 py-2 text-sm font-bold outline-none"
              placeholder="输入章节说明文字..."
            />
          </div>

          {/* Tools */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-[0.12em] text-black/50">
                工具下载列表
              </label>
              <button
                type="button"
                onClick={addTool}
                className="inline-flex items-center gap-1 border-[2px] border-black px-2 py-0.5 text-[10px] font-black shadow-[2px_2px_0px_0px_#000] transition active:translate-x-[1px] active:translate-y-[1px] active:shadow-none"
              >
                <Plus className="size-3" /> 添加工具
              </button>
            </div>

            <div className="space-y-3">
              {tools.map((tool, i) => (
                <div
                  key={i}
                  className="space-y-2 border-2 border-black/20 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black text-black/40">
                      #{i + 1}
                    </span>
                    <input
                      type="text"
                      value={tool.name}
                      onChange={(e) => updateTool(i, "name", e.target.value)}
                      className="flex-1 border-[2px] border-black px-2 py-1 text-xs font-bold outline-none"
                      placeholder="工具名称 *"
                    />
                    <label className="flex items-center gap-1 text-[10px] font-bold whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={tool.required}
                        onChange={(e) =>
                          updateTool(i, "required", e.target.checked)
                        }
                        className="size-3 accent-black"
                      />
                      必装
                    </label>
                    <button
                      type="button"
                      onClick={() => removeTool(i)}
                      className="text-red-400 hover:text-red-600"
                      aria-label={`删除工具 ${tool.name || i + 1}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={tool.url}
                    onChange={(e) => updateTool(i, "url", e.target.value)}
                    className="w-full border-[2px] border-black/30 px-2 py-1 text-[11px] outline-none"
                    placeholder="下载链接 *"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tool.cloud_baidu}
                      onChange={(e) =>
                        updateTool(i, "cloud_baidu", e.target.value)
                      }
                      className="flex-1 border-[2px] border-black/30 px-2 py-1 text-[11px] outline-none"
                      placeholder="百度网盘链接（选填）"
                    />
                    <input
                      type="text"
                      value={tool.cloud_quark}
                      onChange={(e) =>
                        updateTool(i, "cloud_quark", e.target.value)
                      }
                      className="flex-1 border-[2px] border-black/30 px-2 py-1 text-[11px] outline-none"
                      placeholder="夸克网盘链接（选填）"
                    />
                  </div>
                </div>
              ))}
            </div>

            {tools.length === 0 && (
              <p className="py-4 text-center text-xs font-bold text-black/30">
                暂无工具条目，点击「添加工具」开始
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
