"use client";

import { useTransition } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

type CopyInstallGuideButtonProps = {
  guide: string;
};

export function CopyInstallGuideButton({ guide }: CopyInstallGuideButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleCopy = () => {
    startTransition(async () => {
      try {
        await navigator.clipboard.writeText(guide);
        toast.success("安装说明已复制。", {
          description: "现在可以直接粘贴到 XXMI Launcher 的安装步骤说明里。",
        });
      } catch {
        toast.error("复制失败", {
          description: "请稍后重试，或手动复制下方安装说明。",
        });
      }
    });
  };

  return (
    <Button variant="secondary" size="lg" className="w-full justify-center" type="button" onClick={handleCopy} disabled={isPending}>
      <Copy className="size-4" />
      {isPending ? "复制中" : "一键复制安装说明"}
    </Button>
  );
}
