"use client";

import { useEffect, useState } from "react";

/**
 * 把频繁变化的值收敛成「安静下来 delay 毫秒之后的那一个」。
 *
 * 用在搜索联想上：每敲一个字都去问一次服务端，而那个接口要在内存里扫全表
 * （约 5292 条 filter + 相关度排序，见 public.ts），必须等用户停下来再发。
 *
 * 连续输入只会触发最后一次 —— 值每变一次，上一次的定时器就在 cleanup 里被清掉。
 *
 * `paused` 是给**中文输入法**用的：拼音合成期间 `onChange` 一样会一路触发
 * （"q" → "qi" → "qia"…），不挡住的话会拿这些半成品去搜。暂停期间不推进，
 * 解除暂停时依赖变化会让 effect 重跑一次，于是**合成结束后那次取数一定会发出** ——
 * 这一步不能省，否则用户打完字反而什么都搜不到。
 */
export function useDebouncedValue<T>(value: T, delay: number, options: { paused?: boolean } = {}): T {
  const { paused = false } = options;
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (paused) return;

    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [paused, value, delay]);

  return debounced;
}
