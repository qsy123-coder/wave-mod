// 绕过 /_next/image 代理，直接返回原始 URL
// 与 images.unoptimized=true 等价，但 opennextjs-cloudflare 会覆盖 unoptimized 为 false
export default function cloudflareImageLoader({
  src,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  return src;
}
