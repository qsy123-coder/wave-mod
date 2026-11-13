/**
 * 站内角色清单的**唯一权威源**。
 *
 * ── 为什么要有这个文件（2026-11-12）──────────────────────────────────────
 *
 * 加一个角色原来要改 4 处，漏一处就出问题，而且都是**静默**的：
 *   1. `character-images.ts` 的头像映射（漏了 ⇒ 没头像，靠首字兜底）
 *   2. `characters.ts` 的角色名单（漏了 ⇒ 侧栏/下拉框里没有这个分类）
 *   3. `daily-classify.mjs` 的角色前缀（漏了 ⇒ 上传时分类解析错）
 *   4. 命名工坊 / 后台批量上传的角色白名单（漏了 ⇒ 新角色的第一条 mod 改不了名）
 *
 * 现在 1 和 2 合并到本文件：`CHARACTER_AVATARS` 既是头像表也是角色名单，
 * `characters` 从它派生。加角色只需要在下面加**一行**——
 * `"新角色": "/character-imgs/新角色.webp"`（头像文件没有也行，会走首字兜底）。
 *
 * 剩下 3、4 两处**必须**手动同步，因为它们跑在 node 侧、编译产物里没有 TS：
 *   - `scripts/daily-classify.mjs` 的 CHARACTER_PREFIX_MAP（前缀 → 角色）
 *   - 白名单本身不需要改：命名工坊和后台都会读本表自动并集，见
 *     `tools/mod-rename/lib/character-allowlist.mjs` 与
 *     `src/lib/mods-domain/public.ts` 的 getCharacterSuggestions。
 */

/**
 * 角色名 → 头像图片路径。
 *
 * 源文件仍在 public/character-imgs/（备份与本地兜底），但前台实际读取的是 COS
 * 上的同名对象 —— 头像曾经走「香港 nginx → Vercel hkg1」的同源请求，单张缓存命中
 * 也要 0.45–0.85s；搬到 COS 后与卡片图同源（~0.2s），也不再占 Vercel 函数。
 *
 * 上传脚本：scripts/upload-character-avatars-to-cos.mjs
 * 以后若挂 CDN，把 NEXT_PUBLIC_CHARACTER_AVATAR_BASE 指到 CDN 域名即可。
 */
export const CHARACTER_AVATARS: Record<string, string> = {
  // 特殊分类
  "Skins": "/character-imgs/皮肤.png",
  "Other/Misc": "/character-imgs/其他角色.webp",
  "UI": "/character-imgs/UI界面.png",
  // 怪物（2026-10-17 由用户明确要求新建）：放周本 Boss 型 mod —— 改的是怪物模型、
  // 不是可操作角色，与同角色的本体 mod 不是一套东西（同「爱弥斯的机甲」的思路）。
  // 名字取自用户选定；头像由用户提供的 npc.webp 缩到 128×128。
  // ⚠️ 这里**不是** SPECIAL_CATEGORIES（Skins/UI/Other/Misc）那组置顶分类，
  // 所以它会按 zh-CN 排序出现在普通角色列表里。
  "怪物": "/character-imgs/怪物.webp",

  // 主站角色
  "秋水": "/character-imgs/秋水.webp",
  "奥古斯塔": "/character-imgs/奥古斯塔.webp",
  "白芷": "/character-imgs/白芷.webp",
  "布兰特": "/character-imgs/布兰特.webp",
  "卜灵": "/character-imgs/卜灵.webp",
  "卡卡罗": "/character-imgs/卡卡罗.webp",
  "椿": "/character-imgs/椿.webp",
  "坎特蕾拉": "/character-imgs/坎特蕾拉.webp",
  "珂莱塔": "/character-imgs/珂莱塔.webp",
  "卡提希娅": "/character-imgs/卡提希娅.webp",
  // 芙露德莉斯（卡提希娅的大卡形态）——2026-09-21 由用户明确要求新建的独立分类，
  // 暂与卡提希娅共用头像，等有专属图再换（同「爱弥斯的机甲」的处理方式）
  "芙露德莉斯": "/character-imgs/卡提希娅.webp",
  "长离": "/character-imgs/长离.webp",
  "千咲": "/character-imgs/千咲.webp",
  "炽霞": "/character-imgs/炽霞.webp",
  "达妮娅": "/character-imgs/达妮娅.webp",
  "夏空": "/character-imgs/夏空.webp",
  "丹瑾": "/character-imgs/丹瑾.webp",
  "安可": "/character-imgs/安可.webp",
  "绯雪": "/character-imgs/绯雪.webp",
  "嘉贝莉娜": "/character-imgs/嘉贝丽娜.webp",
  "爱弥斯": "/character-imgs/爱弥斯.webp",
  // 爱弥斯特有分类（2026-09-20 新建）：暂与爱弥斯共用头像，等有专属图再换
  "爱弥斯的机甲": "/character-imgs/爱弥斯.webp",
  "尤诺": "/character-imgs/尤诺.webp",
  "鉴心": "/character-imgs/鉴心.webp",
  "今汐": "/character-imgs/今汐.webp",
  "忌炎": "/character-imgs/忌炎.webp",
  "凌阳": "/character-imgs/凌阳.webp",
  "洛瑟菈": "/character-imgs/洛瑟菈.webp",
  "露西": "/character-imgs/露西.webp",
  "灯灯": "/character-imgs/灯灯.webp",
  "露帕": "/character-imgs/露帕.webp",
  "路赫斯": "/character-imgs/路赫斯.webp",
  "琳奈": "/character-imgs/琳奈.webp",
  "莫宁": "/character-imgs/莫宁.webp",
  "莫特斐": "/character-imgs/莫特斐.webp",
  "菲比": "/character-imgs/菲比.webp",
  "弗洛洛": "/character-imgs/弗洛洛.webp",
  "仇远": "/character-imgs/仇远.webp",
  "丽贝卡": "/character-imgs/丽贝卡.webp",
  "洛可可": "/character-imgs/洛可可.webp",
  "男漂": "/character-imgs/漂泊者.webp",
  "女漂": "/character-imgs/漂泊者.webp",
  "散华": "/character-imgs/散华.webp",
  "守岸人": "/character-imgs/守岸人.webp",
  "西格莉卡": "/character-imgs/西格莉卡.webp",
  "桃祈": "/character-imgs/桃祈.webp",
  "维里奈": "/character-imgs/维里奈.webp",
  "相里要": "/character-imgs/相里要.webp",
  "玄翎": "/character-imgs/玄翎.webp",
  "秧秧": "/character-imgs/秧秧.webp",
  "吟霖": "/character-imgs/吟霖.webp",
  "釉瑚": "/character-imgs/釉瑚.webp",
  "滑翔翼,翱翔翼,科考摩托": "/character-imgs/滑翔翼.webp",
  "渊武": "/character-imgs/渊武.webp",
  "赞妮": "/character-imgs/赞妮.webp",
  "折枝": "/character-imgs/折枝.webp",
  "景燃": "/character-imgs/景燃.webp",
  "清宵": "/character-imgs/清宵.webp",
  "穗穗": "/character-imgs/穗穗.webp",
  "锁暝": "/character-imgs/锁暝.webp",
  "心月狐": "/character-imgs/心月狐.webp",
  // 莉莉（Lily）—— 2026-11-12 随 3.8「Lilies in a Dying Dream」开池上线，
  // 五星衍射配枪。当天 GameBanana 的 `Lily Wartime`（分类 Lily）就是她。
  // 头像 2026-11-13 已从占位图（「莉」字）换成正式立绘：源图取自 JASM 素材包
  // `角色头像/WW/衍射/莉莉.png`，缩到 128×128 webp 后覆盖同名文件并重传 COS。
  "莉莉": "/character-imgs/莉莉.webp",
} as const;

/**
 * 全部角色名单，从 `CHARACTER_AVATARS` 派生 —— **不要在这里另加一份手写清单**。
 *
 * 只剔除含逗号的 key（`滑翔翼,翱翔翼,科考摩托` 是历史别名串，不是一个角色名）。
 *
 * ⚠️ 不要按长度过滤：「椿」是单字角色，曾经因为写了 `name.length >= 2` 被静默剔掉，
 * 前台侧栏少一个分类、后台下拉框选不到、上传时分类还会解析成别名 —— 全是静默的。
 */
export const characters = Object.keys(CHARACTER_AVATARS).filter(
  (name) => !name.includes(","),
) as readonly string[];

export const defaultCharacterSuggestions = [...characters];

export const defaultModVersion = "未标注";
export const defaultGameVersion = "未标注";
