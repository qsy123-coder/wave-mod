import type { MetadataRoute } from "next";

/**
 * robots.txt —— 2026-09-24 新增（此前站里完全没有，爬虫完全不受限）。
 *
 * 背景：`/mods/[id]` 的 HTML 里**并不含该 mod 的内容** —— 它渲染的是「默认列表页
 * + 一个客户端才填充的详情抽屉」，5292 个 URL 在爬虫眼里近乎重复。这本来就是
 * 一笔纯浪费的抓取开销，而 2026-09-23 Vercel 因 Fast Origin Transfer 300% 暂停整站，
 * 爬虫流量正是当时的嫌疑之一。
 *
 * 两条策略：
 *   1. 登录后才有意义的页面全部挡掉（挡了不会丢搜索流量，因为爬虫本来就看不到内容）。
 *   2. `/mods?…` 的筛选/翻页组合挡掉 —— 这些是近乎无限的近似重复页，
 *      每多一个参数组合就多一个抓取目标。用户照常能用，只是不进索引。
 *      （规范地址是 `/mods`，见 mods 页的 alternates.canonical。）
 *
 * 刻意**不做**的事：
 *   - 不挡 `/mods/[id]`。那是被分享出去的具体链接，挡掉会让分享链接在搜索引擎里
 *     指向一个不可索引的页面；用页面自身的 `noindex, follow` 处理更精确
 *     （无 meta 支持的爬虫仍能抓到，有支持的会跟随链接、把权重并回 `/mods`）。
 *   - 不写 sitemap。现在没有 sitemap，主动提交会**增加**抓取量；
 *     等页面缓存化上线、抓取成本确认降下来之后再单独加。
 *
 * 只写规则、不写绝对域名，因此不需要 site URL 辅助函数。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // 后台（proxy.ts 也已在服务端守卫，这里是避免爬虫撞登录跳转）
          "/admin/",
          // 接口：不是页面，抓了只有开销
          "/api/",
          // 登录/回调，进去就是跳转
          "/auth/",
          // 登录后才有内容的页面：根路径 + 各游戏分站下的同路径。
          // `/*/profile` 采用前缀匹配，因此也覆盖 `/[game]/profile/edit`。
          "/favorites",
          "/profile",
          "/*/favorites",
          "/*/profile",
          // mod 列表的筛选与翻页组合（近似重复页，规范地址是 /mods）
          "/mods?",
        ],
      },
    ],
  };
}
