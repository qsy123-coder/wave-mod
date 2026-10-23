import type { Metadata } from "next";

import { BlurWorkbench } from "@/features/tools/blur/components/blur-workbench";

export const metadata: Metadata = {
  title: "预览图审阅台",
  robots: { index: false, follow: false },
};

/**
 * 审阅台：把全站预览图铺成网格，逐张打码后一次性打包。
 *
 * 数据来自本地快照（见 /api/tools/blur-index），**不查 Supabase** ——
 * 它的使用场景恰恰是库不可用或配额打穿的时候。
 *
 * 产物是 blur-batch.zip + blur-jobs.json，再由
 * `node scripts/overwrite-cos-images-batch.mjs --dir=<解压目录> --jobs=blur-jobs.json`
 * 批量覆盖回 COS（同样不查库）。
 */
export default function BlurToolPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-5 text-zinc-100">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-4">
          <h1 className="text-lg font-semibold">预览图审阅台</h1>
          <p className="mt-1 text-xs text-zinc-500">
            点开任意一张就能框选打码，打完自动收回网格。全部处理完点「打包导出」，
            再用底部命令一次性覆盖回 COS。全程不读数据库。
          </p>
        </header>

        <BlurWorkbench />

        <footer className="mt-10 border-t border-zinc-800 pt-4 text-xs text-zinc-600">
          <p>覆盖命令（在项目根目录执行，先加 --dry-run 看一眼）：</p>
          <pre className="mt-2 overflow-x-auto rounded-md border border-zinc-800 bg-zinc-900 p-3 text-[12px] text-zinc-400">
{`node scripts/overwrite-cos-images-batch.mjs --dir="<解压后的目录>" --jobs="blur-jobs.json" --dry-run
node scripts/overwrite-cos-images-batch.mjs --dir="<解压后的目录>" --jobs="blur-jobs.json"`}
          </pre>
          <p className="mt-3">
            免起服务、只想处理单张？用{" "}
            <a href="/tools/blur.html" className="text-cyan-500 hover:underline">
              /tools/blur.html
            </a>
            （双击本地文件也能开）。
          </p>
        </footer>
      </div>
    </main>
  );
}
