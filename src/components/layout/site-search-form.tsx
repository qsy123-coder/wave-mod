"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

/**
 * 顶部搜索框。
 *
 * 这里**刻意不用 `useSearchParams()`**：Next 文档明写，路由被预渲染时调用它会让
 * 组件树一直到最近的 Suspense 边界为止都变成客户端渲染 —— 预渲染 HTML 里留下的
 * 是那个边界的 fallback。而 header 是三个 layout 共用的，一旦如此，**每个页面的
 * HTML 里都会出现骨架屏而不是导航栏**（2026-09-24 起页面要能静态化，这条成了硬约束）。
 *
 * 它原本拿 URL 参数做两件事，改成了不依赖渲染期 URL 的写法：
 *   1. 预填输入框 —— 见下面 useUrlQuery；
 *   2. 提交时保留当前的其它筛选 —— 提交本来就是事件，直接读 `window.location`。
 */

/**
 * 订阅地址栏变化。
 *
 * 刻意是空操作：客户端导航（`router.push`）不派发任何可监听的事件，要真正实时
 * 同步就得挂到路由内部去。**这与改动前的行为一致** —— 原来的
 * `useState(searchParams.get("query"))` 同样只在首次渲染取值，之后地址栏再变
 * 输入框也不会跟着动。留个空函数是为了让 useSyncExternalStore 的契约完整。
 */
function subscribeToUrl(): () => void {
  return () => {};
}

/** 服务端（以及水合首帧）快照：空串，与预渲染出的 HTML 一致 */
function getServerUrlQuery(): string {
  return "";
}

function getUrlQuery(): string {
  return new URLSearchParams(window.location.search).get("query") ?? "";
}

/**
 * 输入框里应该显示的内容 = 用户没改过就用地址栏上的 query，改过就用用户输入的。
 *
 * 用 `useSyncExternalStore` 而不是「挂载后 setState 预填」：后者是同步的
 * set-state-in-effect（eslint 的 react-hooks/set-state-in-effect 会报错），
 * 而且要多一次级联渲染。这个原语正是为「渲染期需要读组件外部的值」而设的：
 * 水合时先用服务端快照（空串，与 HTML 一致，因此不会水合不匹配），
 * 水合完成后 React 会自己比对真实快照并按需重渲染。
 *
 * 返回的第二个元素刻意允许为 `null`（而不是空串）：「用户还没改过」与
 * 「用户主动清空了输入框」是两种状态，前者要跟随地址栏，后者不该被覆盖。
 */
function useUrlQuery() {
  const urlQuery = useSyncExternalStore(subscribeToUrl, getUrlQuery, getServerUrlQuery);
  const [draft, setDraft] = useState<string | null>(null);

  return [draft ?? urlQuery, setDraft] as const;
}

export function SiteSearchForm() {
  const router = useRouter();
  const [query, setQuery] = useUrlQuery();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const params = new URLSearchParams(window.location.search);
    const trimmedQuery = query.trim();

    if (trimmedQuery) {
      params.set("query", trimmedQuery);
    } else {
      params.delete("query");
    }

    params.delete("page");

    const search = params.toString();
    router.push(search ? `/mods?${search}` : "/mods");
  };

  return (
    <form
      onSubmit={handleSubmit}
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
