"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type NavigationLoadingContextType = {
  /** 当前是否正在导航加载中（骨架屏 + 进度条显示中） */
  isLoading: boolean;
  /** 标记导航开始（点击筛选/排序时调用） */
  startLoading: () => void;
  /** 标记导航结束（服务端数据到达时自动调用） */
  stopLoading: () => void;
  /** 乐观角色：用户在侧边栏/其他处选中但尚未经服务端 props 确认的角色（null 表示全部/无角色） */
  pendingCharacter: string | null;
  /** 设置乐观角色，数据到达后应清空以对齐服务端 */
  setPendingCharacter: (character: string | null) => void;
};

const NavigationLoadingContext = createContext<NavigationLoadingContextType>({
  isLoading: false,
  startLoading: () => {},
  stopLoading: () => {},
  pendingCharacter: null,
  setPendingCharacter: () => {},
});

export function useNavigationLoading() {
  return useContext(NavigationLoadingContext);
}

export function NavigationLoadingProvider({ children }: { children: ReactNode }) {
  const [isLoading, setIsLoading] = useState(false);
  const [pendingCharacter, setPendingCharacter] = useState<string | null>(null);

  const startLoading = useCallback(() => setIsLoading(true), []);
  const stopLoading = useCallback(() => setIsLoading(false), []);

  return (
    <NavigationLoadingContext.Provider
      value={{ isLoading, startLoading, stopLoading, pendingCharacter, setPendingCharacter }}
    >
      {children}
    </NavigationLoadingContext.Provider>
  );
}
