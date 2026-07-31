/**
 * 自定义图片 loader：直接返回原始 URL，不经过 /_next/image 优化。
 * 配合 images.unoptimized: true 和 images.loader: "custom" 使用。
 */
export default function customImageLoader({ src }: { src: string }) {
  return src;
}
