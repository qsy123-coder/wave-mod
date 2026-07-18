"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Copy, DatabaseZap, ShieldCheck, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { getEnabledGames } from "@/config/games";
import { updateModAction } from "@/actions/admin/edit-mod-actions";
import { createModAction } from "@/actions/admin/upload-actions";
import { defaultUploadFormValues, getDefaultXXMIGuide, type UploadFormValues } from "@/constants/upload-defaults";
import { adminModFormSchema, initialAdminModFormState, splitImageUrls, type AdminModFormValues } from "@/lib/admin/mod-form";
import { StorageImageUpload } from "@/components/features/admin/upload/storage-image-upload";
import { OssZipUpload } from "@/components/features/admin/upload/oss-zip-upload";
import { MotionReveal } from "@/components/layout/motion-reveal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type UploadFormProps = {
  characters: readonly string[];
  formValues?: UploadFormValues;
  modId?: string;
  mode?: "create" | "edit";
};

function parseImageUrls(value: string) {
  return splitImageUrls(value);
}

function mergeImageUrls(existingValue: string, uploadedUrls: string[]) {
  return [...parseImageUrls(existingValue), ...uploadedUrls].join("\n");
}

export function UploadForm({ characters, formValues = defaultUploadFormValues, modId, mode = "create" }: UploadFormProps) {
  const action = mode === "edit" ? updateModAction : createModAction;
  const [state, formAction, pending] = useActionState(action, initialAdminModFormState);
  const [formKey, setFormKey] = useState(0);
  const defaultGuide = formValues.xxmiGuide || getDefaultXXMIGuide();
  const games = getEnabledGames();
  const allowSubmitRef = useRef(false);
  const form = useForm<AdminModFormValues>({
    defaultValues: {
      ...formValues,
      xxmiGuide: defaultGuide,
    },
    resolver: zodResolver(adminModFormSchema),
  });
  const { control, formState, register, setValue, trigger } = form;
  const downloadUrl = useWatch({ control, name: "downloadUrl" });
  const imageUrls = useWatch({ control, name: "imageUrls" });

  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.success) {
      toast.success(state.success);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 表单重置 Key
      setFormKey((k) => k + 1);
    }
  }, [state.error, state.success]);

  const copyGuide = async () => {
    await navigator.clipboard.writeText(defaultGuide);
    toast.success("XXMI 安装说明已复制到剪贴板。");
  };

  const parsedImageUrls = useMemo(() => parseImageUrls(imageUrls), [imageUrls]);
  const getFieldError = (name: keyof AdminModFormValues) => formState.errors[name]?.message ?? state.fieldErrors[name];

  return (
    <div className="grid gap-6 lg:grid-cols-[1.08fr_0.92fr]">
      <MotionReveal delay={0.1} y={24} rotate={-1}>
        <Card className="neo-card-lg p-6" style={{ background: "var(--neo-panel)" }}>
          <CardContent className="space-y-5 p-0 text-black">
            <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 shadow-[6px_6px_0px_0px_#000]">
              <UploadCloud className="size-4" />
              <span className="text-sm font-black uppercase tracking-[0.14em]">{mode === "edit" ? "编辑 MOD 资料" : "发布 MOD 资料"}</span>
            </div>

            {state.error ? <div className="border-4 border-black bg-[#ffb5c3] px-4 py-3 text-sm font-black shadow-[6px_6px_0px_0px_#000]">{state.error}</div> : null}
            {state.success ? <div className="border-4 border-black px-4 py-3 text-sm font-black shadow-[6px_6px_0px_0px_#000]" style={{ background: "var(--neo-secondary)" }}>{state.success}</div> : null}

            <form key={formKey} action={formAction} className="grid gap-5" onSubmit={(event) => {
              if (allowSubmitRef.current) {
                allowSubmitRef.current = false;
                return;
              }

              event.preventDefault();
              const formElement = event.currentTarget;
              void trigger().then((isValid) => {
                if (!isValid) {
                  toast.error("请先修正表单中的红色报错项。");
                  return;
                }

                allowSubmitRef.current = true;
                formElement.requestSubmit();
              });
            }}>
              {mode === "edit" && modId ? <input type="hidden" name="id" value={modId} /> : null}

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="所属游戏" error={getFieldError("gameKey")}> 
                  <select
                    {...register("gameKey")}
                    className="flex h-11 w-full border-4 border-black bg-white px-3 py-2 text-sm font-black text-black shadow-[4px_4px_0px_0px_#000] outline-none transition focus:translate-x-[1px] focus:translate-y-[1px] focus:shadow-[2px_2px_0px_0px_#000]"
                    required
                  >
                    {games.map((game) => (
                      <option key={game.key} value={game.key}>
                        {game.name} MOD
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="MOD 标题" error={getFieldError("title")}>
                  <Input {...register("title")} placeholder="请输入完整的 MOD 标题，例如：今汐 夜巡作战制服" required />
                </Field>

                <Field label="角色名称" error={getFieldError("character")}>
                  <div className="space-y-3">
                    <Input
                      {...register("character")}
                      list="wavemod-character-options"
                      placeholder="可直接输入角色名，也可从建议列表选择"
                      required
                    />
                    <datalist id="wavemod-character-options">
                      {characters.map((character) => (
                        <option key={character} value={character} />
                      ))}
                    </datalist>
                    <p className="text-xs font-black leading-5 text-black/65">角色名称已改为自由输入；下拉建议只做快捷选择，后续新增角色无需改代码也能上传。</p>
                  </div>
                </Field>
              </div>

              <Field label="内容简介" error={getFieldError("description")}>
                <Textarea {...register("description")} placeholder="请填写 MOD 的替换内容、风格特点、兼容说明与注意事项。" required />
              </Field>

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="直链下载地址" error={getFieldError("downloadUrl")}>
                  <div className="space-y-3">
                    <Input {...register("downloadUrl")} value={downloadUrl} onChange={(event) => setValue("downloadUrl", event.target.value, { shouldDirty: true, shouldValidate: true })} placeholder="可留空；也可用下方 ZIP 上传自动回填" />
                    <OssZipUpload defaultCharacter={formValues.character} onUploaded={(url) => setValue("downloadUrl", url, { shouldDirty: true, shouldValidate: true })} />
                  </div>
                </Field>

                <Field label="网盘下载链接（可选）" error={getFieldError("driveLinksText")}>
                  <Textarea {...register("driveLinksText")} placeholder={"每行一条，格式：平台名 链接\n例如：\n百度网盘 https://pan.baidu.com/s/xxxx\n阿里云盘 https://www.alipan.com/xxxx"} rows={3} />
                </Field>

                <Field label="演示视频地址（可选）" error={getFieldError("videoUrl")}>
                  <Input {...register("videoUrl")} placeholder="可填写 B 站、YouTube 或其他公开视频链接；没有可留空" />
                </Field>
              </div>

              <Field label="作者主页链接" error={getFieldError("authorUrl")}>
                <Input {...register("authorUrl")} placeholder="可填写作者主页、社交媒体或作品集链接；没有可留空" />
              </Field>

              <Field label="预览图地址（每行一条或使用逗号分隔）" error={getFieldError("imageUrls")}>
                <div className="space-y-3">
                  <Textarea {...register("imageUrls")} value={imageUrls} onChange={(event) => setValue("imageUrls", event.target.value, { shouldDirty: true, shouldValidate: true })} placeholder={"请输入至少一张可公开访问的预览图地址\n例如：https://example.com/mod-cover-1.webp\nhttps://example.com/mod-cover-2.webp"} required />
                  <div className="text-xs font-black uppercase tracking-[0.14em] text-black/65">当前已写入 {parsedImageUrls.length} 张预览图地址</div>
                  {parsedImageUrls.length > 0 ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {parsedImageUrls.map((url, index) => (
                        <div key={`${url}-${index}`} className="border-4 border-black bg-[#fff8ef] p-3 shadow-[6px_6px_0px_0px_#000]">
                          <div className="relative aspect-[4/3] overflow-hidden border-4 border-black bg-white">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={url} alt={`预览图 ${index + 1}`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setValue("imageUrls", parsedImageUrls.filter((_, currentIndex) => currentIndex !== index).join("\n"), { shouldDirty: true, shouldValidate: true })}
                              className="absolute right-2 top-2 inline-flex size-9 items-center justify-center border-2 border-black bg-[#ff8fab] text-black shadow-[3px_3px_0px_0px_#000] transition-transform duration-150 hover:-translate-y-0.5"
                              aria-label={`删除第 ${index + 1} 张预览图`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                          <p className="mt-3 line-clamp-2 break-all text-xs font-bold leading-5 text-black/75">{url}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <StorageImageUpload defaultCharacter={formValues.character} onUploaded={(urls) => setValue("imageUrls", mergeImageUrls(imageUrls, urls), { shouldDirty: true, shouldValidate: true })} />
                </div>
              </Field>

              <Field label="XXMI 安装说明" error={getFieldError("xxmiGuide")}>
                <div className="space-y-3">
                  <Textarea {...register("xxmiGuide")} required />
                  <Button type="button" variant="outline" className="w-fit" onClick={copyGuide}>
                    <Copy className="size-4" />
                    复制默认安装说明
                  </Button>
                </div>
              </Field>

              <label className="inline-flex items-center gap-3 border-4 border-black bg-white px-4 py-3 text-sm font-black shadow-[6px_6px_0px_0px_#000]">
                <input {...register("nsfw")} type="checkbox" className="size-4 accent-black" />
                本作品包含 NSFW / 18+ 内容，需要在前台添加分级提示
              </label>

              <Button type="submit" className="w-full md:w-fit" disabled={pending}>
                <DatabaseZap className="size-4" />
                {pending ? (mode === "edit" ? "正在保存修改..." : "正在提交资料...") : mode === "edit" ? "保存修改" : "提交并写入数据库"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </MotionReveal>

      <div className="space-y-5">
        <MotionReveal delay={0.14} y={24} rotate={1}>
          <Card className="neo-card-lg p-6" style={{ background: "var(--neo-secondary)" }}>
            <CardContent className="space-y-4 p-0 text-black">
              <div className="inline-flex items-center gap-2 border-4 border-black bg-white px-4 py-2 shadow-[6px_6px_0px_0px_#000]">
                <UploadCloud className="size-4" />
                <span className="text-sm font-black uppercase tracking-[0.14em]">填写规范</span>
              </div>
              <ul className="space-y-3 text-sm font-bold leading-7 text-black/80">
                <li>• 当前表单支持创建与编辑两种模式，字段会自动回填。</li>
                <li>• MOD 压缩包可上传到 Supabase Storage 或填写直链。</li>
                <li>• 预览图上传到 Supabase Storage，成功后会自动回填链接。</li>
                <li>• 角色名称支持自由输入，新角色无需等待后台更新选项列表。</li>
              </ul>
            </CardContent>
          </Card>
        </MotionReveal>

        <MotionReveal delay={0.18} y={24} rotate={-1}>
          <Card className="neo-card-lg p-6" style={{ background: "var(--neo-muted)" }}>
            <CardContent className="space-y-4 p-0 text-black">
              <p className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.14em]">
                <ShieldCheck className="size-4" />
                数据表要求
              </p>
              <ul className="space-y-3 text-sm font-bold leading-7 text-black/80">
                <li>• 当前表单会写入 `mods` 数据表。</li>
                <li>• 版本号与适配游戏版本已从后台录入项中移除，当前统一按默认值写入。</li>
                <li>• 标签、视频链接现在都可留空，不再强制填写。</li>
              </ul>
            </CardContent>
          </Card>
        </MotionReveal>
      </div>
    </div>
  );
}

type FieldProps = {
  children: React.ReactNode;
  error?: string;
  label: string;
};

function Field({ children, error, label }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-black uppercase tracking-[0.14em] text-black">{label}</Label>
      {children}
      {error ? <p className="text-sm font-black text-[#c1121f]">{error}</p> : null}
    </div>
  );
}
