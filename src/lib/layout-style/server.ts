import { cookies } from "next/headers";

import {
  DEFAULT_LAYOUT_STYLE,
  LAYOUT_STYLE_COOKIE,
  type LayoutStyle,
} from "./constants";

/**
 * 服务端读取当前视觉风格偏好。
 * 从 cookie 中读取，无效值自动回退到默认值。
 */
export async function getLayoutStyle(): Promise<LayoutStyle> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(LAYOUT_STYLE_COOKIE)?.value;

    if (raw === "zzz-immersive" || raw === "neo-brutalism") {
      return raw;
    }

    return DEFAULT_LAYOUT_STYLE;
  } catch {
    return DEFAULT_LAYOUT_STYLE;
  }
}

/**
 * 判断是否应渲染绝区零深色沉浸式风格。
 */
export function isZzzStyle(
  gameKey: string,
  layoutStyle: LayoutStyle,
): boolean {
  return gameKey === "zenless-zone-zero" && layoutStyle === "zzz-immersive";
}

/**
 * 判断是否在绝区零分站使用新粗野主义风格。
 */
export function isZzzNeoBrutalism(
  gameKey: string,
  layoutStyle: LayoutStyle,
): boolean {
  return gameKey === "zenless-zone-zero" && layoutStyle === "neo-brutalism";
}
