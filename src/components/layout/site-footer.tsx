import Link from "next/link";

import { MotionReveal } from "@/components/layout/motion-reveal";
import { siteConfig } from "@/lib/constants/site";

export function SiteFooter() {
  return (
    <footer className="border-t-4 border-black" style={{ background: "var(--neo-footer)" }}>
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.35fr_0.65fr] lg:px-8">
        <MotionReveal delay={0.05} rotate={1}>
          <div className="neo-card rotate-1 p-6" style={{ background: "var(--neo-panel)" }}>
            <p className="neo-label text-black/65">Wuthering Waves Character MOD Hub</p>
            <h2 className="mt-3 text-3xl font-black text-black">鸣潮角色MOD个人站</h2>
            <p className="mt-4 text-base leading-8 text-black/75">{siteConfig.description}</p>
            <p className="mt-3 text-sm leading-7 text-black/70">{siteConfig.disclaimer}</p>
          </div>
        </MotionReveal>

        <MotionReveal delay={0.12} rotate={-1}>
          <div className="neo-card -rotate-1 p-6 lg:self-start" style={{ background: "var(--neo-secondary)" }}>
            <p className="neo-label text-black/65">支持本站</p>
            <div className="mt-4 flex flex-wrap gap-3">
              {siteConfig.supportLinks.map((item, index) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`border-4 border-black px-4 py-2 text-sm font-black uppercase tracking-[0.12em] text-black shadow-[4px_4px_0px_0px_#000] transition duration-100 ease-linear ${index % 2 === 0 ? "rotate-1" : "-rotate-1"}`}
                  style={{ background: index % 2 === 0 ? "var(--neo-surface)" : "var(--neo-accent)" }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </MotionReveal>
      </div>
    </footer>
  );
}
