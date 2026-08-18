import { Copyright, FileWarning, HeartHandshake, ShieldAlert, Users } from "lucide-react";

import { MotionReveal } from "@/components/layout/motion-reveal";
import { Card, CardContent } from "@/components/ui/card";

const statementItems = [
  {
    icon: ShieldAlert,
    title: "站点性质",
    body: "WaveMod 是一个由个人运营的非官方 MOD 分享站，与相关游戏厂商及版权方无任何关联，未获得官方授权或背书。",
  },
  {
    icon: Copyright,
    title: "版权归属",
    body: "本站收录的全部 MOD（包括标题、预览图、描述与安装包）均转载自玩家社区与独立创作者，版权归原作者及权利人所有。本站仅做转载、索引与展示，不主张任何第三方内容的所有权。",
  },
  {
    icon: FileWarning,
    title: "侵权处理",
    body: "若您是内容权利人，认为本站展示侵犯了您的著作权、商标权或其他合法权益，请提供权属证明与对应链接并提交给我们。本站核实后将在 48 小时内下架相关内容。",
  },
  {
    icon: HeartHandshake,
    title: "商业边界",
    body: "本站不以任何形式（会员、赞助、赞赏等）售卖第三方 MOD 或内容，也不提供付费转载授权。第三方 MOD 及其衍生内容的商业使用请直接联系原作者。",
  },
  {
    icon: Users,
    title: "使用风险提示",
    body: "安装第三方 MOD 属于修改客户端行为，可能带来封号等风险。请在下载与使用前自行确认版本兼容性并评估风险，本站不承担因安装 MOD 产生的任何损失。",
  },
];

export default function SupportPage() {
  return (
    <div className="flex flex-col gap-8 py-8 lg:py-10">
      <MotionReveal delay={0.04} rotate={-1}>
        <section className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]" style={{ background: "var(--neo-accent)" }}>
          <p className="neo-label text-black/60">版权合规</p>
          <h1 className="mt-2 text-4xl font-black text-black">转载与版权声明</h1>
          <p className="mt-3 max-w-2xl text-sm font-bold leading-7 text-black/75">
            本站 MOD 转载自玩家社区，版权归原作者所有。本站与游戏官方无关，内容仅供学习与交流用途。
          </p>
        </section>
      </MotionReveal>

      <div className="grid gap-5 md:grid-cols-2">
        {statementItems.map((item, index) => (
          <MotionReveal key={item.title} delay={0.1 + index * 0.04} y={22} rotate={index % 2 === 0 ? -1 : 1}>
            <Card className="neo-card-lg h-full p-5" style={{ background: index % 3 === 0 ? "var(--neo-secondary)" : index % 3 === 1 ? "var(--neo-muted)" : "var(--neo-accent)" }}>
              <CardContent className="space-y-4 p-0 text-black">
                <div className="flex items-center gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center border-4 border-black bg-white shadow-[5px_5px_0px_0px_#000]">
                    <item.icon className="size-6" />
                  </div>
                  <p className="text-xl font-black">{item.title}</p>
                </div>
                <p className="text-sm font-bold leading-7 text-black/80">{item.body}</p>
              </CardContent>
            </Card>
          </MotionReveal>
        ))}
      </div>

      <MotionReveal delay={0.3} y={22} rotate={-1}>
        <section className="border-4 border-black bg-[#fff8ef] p-5 shadow-[8px_8px_0px_0px_#000]">
          <p className="text-sm font-black uppercase tracking-[0.14em]">再次声明</p>
          <p className="mt-2 text-sm font-bold leading-7 text-black/75">
            本站内容仅供学习与交流用途，与游戏官方无关。请在下载与使用前自行确认版本兼容性，本站不承担因使用第三方 MOD 产生的任何后果。
          </p>
        </section>
      </MotionReveal>
    </div>
  );
}
