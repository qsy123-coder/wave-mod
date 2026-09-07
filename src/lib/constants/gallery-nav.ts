/**
 * 进入图库时，头部导航把"当前所在页面"记录到 sessionStorage 的 key。
 *
 * 返回按钮（gallery/back-button.tsx）读取该 key 直接跳回来源页，一步离开图库。
 * 用 sessionStorage 而非 state：图库是独立 layout（无 header），来源页只能在点击入口时捕获。
 */
export const GALLERY_BACK_KEY = "wave-mod:gallery-back-target";
