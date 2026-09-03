"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function SiteSearchForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("query") ?? "");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();

        const params = new URLSearchParams(searchParams.toString());
        const trimmedQuery = query.trim();

        if (trimmedQuery) {
          params.set("query", trimmedQuery);
        } else {
          params.delete("query");
        }

        params.delete("page");
        router.push(params.toString() ? `/mods?${params.toString()}` : "/mods");
      }}
      className="neo-card flex w-full min-w-0 items-center gap-2 px-3 py-2.5"
      style={{ background: "var(--neo-search)" }}
    >
      <Search className="size-4 text-black" />
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="搜索角色 / 标题 / 描述 / 标签"
        className="min-w-0 flex-1 bg-transparent text-sm font-bold text-black placeholder:text-black/55 outline-none"
      />
      <button
        type="submit"
        className="inline-flex shrink-0 items-center gap-1 border-[3px] border-black bg-[#ffd84f] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.1em] text-black shadow-[3px_3px_0px_0px_#000] transition hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_#000]"
      >
        搜索
      </button>
    </form>
  );
}
