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
        className="w-full bg-transparent text-sm font-bold text-black placeholder:text-black/55 outline-none"
      />
    </form>
  );
}
