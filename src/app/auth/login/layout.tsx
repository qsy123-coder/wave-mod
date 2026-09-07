import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录",
  description: "登录 WaveMod，收藏、评论与同步个人内容。",
};

/**
 * /auth/login 登录页布局。
 *
 * 运行时以 <link> 加载两个展示字体（复用 gallery 的 runtime-加载模式，避免构建期拉取字体）：
 * - Bungee：拉丁 logotype「WaveMod」
 * - ZCOOL KuaiLe（站酷快乐体）：中文大标题（街机/游戏感，支持中文，区别于正文 Arial Black）
 */
export default function LoginLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Bungee&family=ZCOOL+KuaiLe&display=swap"
        rel="stylesheet"
      />
      {children}
    </>
  );
}
