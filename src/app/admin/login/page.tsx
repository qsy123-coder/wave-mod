import { AdminLoginForm } from "@/components/features/admin/admin-login-form";
import { MotionReveal } from "@/components/layout/motion-reveal";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "后台登录",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-12 sm:px-6 lg:py-20">
      <MotionReveal delay={0.04} rotate={1}>
        <section
          className="inline-block border-4 border-black px-5 py-4 shadow-[8px_8px_0px_0px_#000]"
          style={{ background: "var(--neo-accent)" }}
        >
          <p className="neo-label text-black/60">WaveMod Admin</p>
          <h1 className="mt-2 text-4xl font-black text-black">后台登录</h1>
          <p className="mt-2 text-sm font-bold leading-6 text-black/70">
            登录一次保持 30 天，之后打开后台不用再输密码。
          </p>
        </section>
      </MotionReveal>

      <AdminLoginForm next={params.next} />
    </div>
  );
}
