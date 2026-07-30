"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type NavigationLoadingContextType = {
  /** 当前是否正在导航加载中（骨架屏 + 进度条显示中） */
  isLoading: boolean;
  /** 标记导航开始（点击筛选/排序时调用） */
  startLoading: () => void;
  /** 标记导航结束（服务端数据到达时自动调用） */
  stopLoading: () => void;
};

const NavigationLoadingContext = createContext<NavigationLoadingContextType>({
  isLoading: false,
  startLoading: () => {},
  stopLoading: () => {},
});

export function useNavigationLoading() {
  return useContext(NavigationLoadingContext);
}

export function NavigationLoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);

  const startLoading = useCallback(() => setIsLoading(true), []);
  const stopLoading = useCallback(() => setIsLoading(false), []);

  return (
    <NavigationLoadingContext.Provider value={{ isLoading, startLoading, stopLoading }}>
      {children}
    </NavigationLoadingContext.Provider>
  );
}
