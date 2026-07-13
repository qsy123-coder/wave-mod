"use client";

import { useActionState } from "react";
import { Check, Edit3, X } from "lucide-react";

import { updateProfileAction } from "@/actions/user/profile-actions";
import type { CreatorProfile } from "@/lib/mods";

import { panel } from "./profile-shared";

export function ProfileEditForm({
  profile,
  gameProfileHref,
}: {
  profile: CreatorProfile;
  gameProfileHref: string;
}) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, {
    error: "",
    success: "",
  });

  return (
    <form action={formAction} className="space-y-4">
      {/* 名字 */}
      <div>
        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-black">
          显示名称
        </label>
        <input
          name="displayName"
          defaultValue={profile.displayName}
          maxLength={32}
          required
          className="w-full border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black outline-none focus:border-[var(--neo-accent)]"
        />
      </div>

      {/* Bio */}
      <div>
        <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.14em] text-black">
          个人简介
        </label>
        <textarea
          name="bio"
          defaultValue={profile.bio ?? ""}
          maxLength={200}
          rows={3}
          placeholder="介绍一下你自己……"
          className="w-full resize-none border-2 border-black bg-white px-3 py-2 text-sm font-bold text-black outline-none focus:border-[var(--neo-accent)]"
        />
        <p className="mt-1 text-right text-[9px] font-bold text-black">
          最多 200 字
        </p>
      </div>

      {/* 按钮 */}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-1.5 border-2 border-black bg-[var(--neo-accent)] px-4 py-2 text-[11px] font-black uppercase text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 disabled:opacity-60"
        >
          <Check className="size-3.5" />
          {isPending ? "保存中…" : "保存"}
        </button>
        <a
          href={gameProfileHref}
          className="inline-flex items-center gap-1.5 border-2 border-black bg-white px-4 py-2 text-[11px] font-black uppercase text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5"
        >
          <X className="size-3.5" />
          取消
        </a>
      </div>

      {/* 反馈 */}
      {state.error && (
        <p className="rounded border-2 border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-400">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="rounded border-2 border-green-500/30 bg-green-500/10 px-3 py-2 text-xs font-bold text-green-400">
          {state.success}
        </p>
      )}
    </form>
  );
}

/** 编辑按钮 — 跳转到编辑模式 */
export function ProfileEditButton({ editHref }: { editHref: string }) {
  return (
    <a
      href={editHref}
      className="inline-flex items-center gap-1.5 border-2 border-black bg-black/5 px-3 py-2 text-[10px] font-black uppercase text-black shadow-[3px_3px_0_0_#000] transition hover:-translate-y-0.5 pointer-events-auto"
    >
      <Edit3 className="size-3" />
      编辑资料
    </a>
  );
}
