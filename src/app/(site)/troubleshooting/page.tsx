import fs from "fs";
import path from "path";
import { troubleshootingConfig } from "@/features/troubleshooting/troubleshooting-config";
import { TroubleshootingContent } from "@/features/troubleshooting/components/troubleshooting-content";

export const metadata = {
  title: "问题解答 — 鸣潮 Mod 常见问题排查指南",
  description:
    "安装失败、闪退、贴图错误、Mod 不生效？查看鸣潮 Mod 问题解答，35 个常见问题及解决方法，持续更新。",
};

/** Read a markdown file from content/troubleshooting/ */
function readMdFile(filename: string): string {
  const filePath = path.join(process.cwd(), "content", "troubleshooting", filename);
  return fs.readFileSync(filePath, "utf-8");
}

type CategoryContent = {
  key: string;
  label: string;
  content: string;
  questionCount: number;
};

export default function TroubleshootingPage() {
  const categories: CategoryContent[] = troubleshootingConfig.categories.map((cat) => ({
    key: cat.key,
    label: cat.label,
    content: readMdFile(cat.mdFile),
    questionCount: cat.questionCount,
  }));

  return (
    <div className="py-6 lg:py-8">
      {/* Yellow header card + neo panel merged together */}
      <section
        className="border-4 border-b-0 border-black px-4 py-2.5 shadow-[6px_6px_0px_0px_#000]"
        style={{ background: "var(--neo-panel)" }}
      >
        <p className="text-xs font-black uppercase tracking-[0.16em] text-black/60">
          {troubleshootingConfig.subtitle}
        </p>
        <h1 className="mt-1 text-2xl font-black text-black">
          📋 {troubleshootingConfig.title}
        </h1>
      </section>

      <TroubleshootingContent categories={categories} />
    </div>
  );
}
