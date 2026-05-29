import { defaultGameKey } from "@/config/games";
import { defaultGameVersion, defaultModVersion } from "@/lib/constants/characters";
import { xxmiInstallGuideText } from "@/lib/constants/install-guide";
import type { AdminMod } from "@/lib/mods";

export type UploadFormValues = {
  authorUrl: string;
  character: string;
  description: string;
  downloadUrl: string;
  gameKey: string;
  imageUrls: string;
  nsfw: boolean;
  tags: string;
  title: string;
  videoUrl: string;
  xxmiGuide: string;
};

export const defaultUploadFormValues: UploadFormValues = {
  authorUrl: "https://space.bilibili.com/349437683",
  character: "今汐",
  description:
    "今汐主题角色外观 MOD，包含战斗待机、近景展示与基础兼容说明。推荐搭配黑紫系 UI 截图使用，如遇贴图冲突请先停用同角色其他外观模组。",
  downloadUrl: "https://example.oss-cn-shanghai.aliyuncs.com/wavemod/jinhsi-night-ops-v1.0.0.zip",
  gameKey: defaultGameKey,
  imageUrls:
    "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80\nhttps://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
  nsfw: false,
  tags: "",
  title: "今汐 · 夜巡作战制服",
  videoUrl: "",
  xxmiGuide: xxmiInstallGuideText,
};

export function getDefaultXXMIGuide() {
  return xxmiInstallGuideText;
}

export function getUploadFormValuesFromMod(mod: AdminMod): UploadFormValues {
  return {
    authorUrl: mod.modAuthorUrl ?? "",
    character: mod.character,
    description: mod.description,
    downloadUrl: mod.downloadUrl,
    gameKey: mod.gameKey,
    imageUrls: mod.images.join("\n"),
    nsfw: mod.nsfw,
    tags: mod.tags.join(" "),
    title: mod.title,
    videoUrl: mod.videoUrl ?? "",
    xxmiGuide: mod.xxmiInstallGuide,
  };
}

export function getPersistedModMeta() {
  return {
    gameVersion: defaultGameVersion,
    version: defaultModVersion,
  };
}
