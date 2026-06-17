import { cookies } from "next/headers";

import {
  DEFAULT_LAYOUT_STYLE,
  LAYOUT_STYLE_CLASS,
  LAYOUT_STYLE_COOKIE,
  type LayoutStyle,
} from "./constants";

export async function getLayoutStyle(): Promise<LayoutStyle> {
  try {
    const cookieStore = await cookies();
    const raw = cookieStore.get(LAYOUT_STYLE_COOKIE)?.value;
    if (raw === "zzz-immersive" || raw === "zzz-dark") return raw;
    return DEFAULT_LAYOUT_STYLE;
  } catch {
    return DEFAULT_LAYOUT_STYLE;
  }
}

export async function getLayoutStyleClass(): Promise<string> {
  const style = await getLayoutStyle();
  return LAYOUT_STYLE_CLASS[style];
}

export function isDarkSkin(layoutStyle: LayoutStyle): boolean {
  return layoutStyle === "zzz-dark";
}
