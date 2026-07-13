"use client";

import { useMotionValue, useSpring } from "framer-motion";
import { useCallback } from "react";

/**
 * 封装 Framer Motion useMotionValue + useSpring，提供命令式 set/get API。
 *
 * 替代参考项目 chenglou.me 中的手写 Spring 物理引擎，
 * 使用 Framer Motion 内建弹簧物理（stiffness + damping + mass）。
 *
 * @param initialValue 初始值
 * @param config 弹簧配置，默认与参考项目一致：stiffness=290, damping=30
 * @returns [springValue, { set, get }]
 */
export function useSpringValue(
  initialValue: number,
  config?: { stiffness?: number; damping?: number; mass?: number },
) {
  const motionValue = useMotionValue(initialValue);
  const springValue = useSpring(motionValue, {
    stiffness: config?.stiffness ?? 290,
    damping: config?.damping ?? 30,
    mass: config?.mass ?? 1,
  });

  const set = useCallback(
    (value: number) => {
      motionValue.set(value);
    },
    [motionValue],
  );

  const get = useCallback((): number => {
    return motionValue.get();
  }, [motionValue]);

  return { springValue, set, get, motionValue } as const;
}
