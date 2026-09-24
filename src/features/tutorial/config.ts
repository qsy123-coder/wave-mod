import type { TutorialConfig } from "./types";
import { tutorialConfigSchema } from "./types";

/**
 * 静态兜底教程。
 *
 * 真源是数据库（`tutorial_configs` / `tutorial_chapters`，后台 /admin/tutorial 编辑），
 * 本文件只在 **读库失败** 时兜底渲染 —— 见 src/app/(site)/guide/page.tsx：
 * listVisibleVersions() 返回空数组时，用这里的内容充当一个伪版本，保证页面不空白。
 *
 * ⚠️ 内容镜像自库里 published 的 `v` 版本（新版教程，6 章 / 59 张图），
 * 图片用 COS 绝对地址（与库内 url 列一致），不要改成本地文件名 —— 本地没有这些图。
 * 后台改完教程后，这里不会自动同步；兜底内容需要跟着更新时，重新生成本文件。
 */
const rawConfig: TutorialConfig = {
  title: "新版教程",
  subtitle: "先看我",
  imageBasePath: "/tutorial/",
  video: { src: "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/companion/1/tutorial.mp4", poster: "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/companion/1/poster.webp" },
  chapters: [
    {
      id: "00",
      title: "解压",
      type: "images",
      images: [
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/00/c34e55a0-43c9-4b5f-b498-a81d1e7ec650/1.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/00/327690ef-b893-4d52-a1d3-4436a48a2051/2.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/00/fbb19d3b-ffc1-4135-8870-0f1918a77bb6/3.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/00/f851a756-3529-4036-8318-cb81712897d5/4.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/00/3ccc4253-c8ff-41a5-a883-8fab5edf6daa/5.webp",
      ],
    },
    {
      id: "01",
      title: "mod环境安装（XXMI启动器）",
      type: "images",
      images: [
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/01/41768c03-cc13-48bf-a4a8-f8f5b1dcc825/6.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/01/ba63c528-e8fe-440f-a771-e1efcfb5ce0d/7.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/01/1bc8c2f8-e5c0-41b0-8907-f9a3b28f06e1/8.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/01/f2d401a9-7047-4991-9383-ec34dcce8d85/9.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/01/fd6d217f-86bb-474d-ab2c-89df385894c3/10.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/01/32bfa913-0b43-403d-9ac6-39c868bcf961/11.webp",
      ],
    },
    {
      id: "02",
      title: "JASM---mod管理器的使用",
      type: "images",
      images: [
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/eb29be26-2d61-4248-8235-55dadfa78b04/12.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/f5584f3b-7133-408d-bfb8-6c17565e3198/13.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/d517317d-9903-452c-b5fa-414819955f23/14.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/18f845d6-2bef-426d-a74f-4ef0ec7eea82/15.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/14243615-615b-44a6-b70f-e5ba9fdd4c67/16.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/e6e86d9b-e727-4a48-912d-d6b2fb79e746/17.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/40ef2080-57d0-461d-8c6a-d38f76aa77df/18.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/e2fc3fb3-9ee6-43d8-9ca6-4c344e79ef8d/19.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/97648caa-932e-4c4e-a5eb-cf2c610fedda/20.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/c3ba5466-36b1-43bd-9cc2-d33540ad949a/21.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/345bcbd5-09cd-460f-960a-6f08d821b8fa/22.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/be11fb5c-a2ec-48ec-abfd-78d472d21a60/23.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/842fe235-1b4f-4ee2-bd3b-d790136539d0/24.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/48fb1490-b0c9-4000-bcf2-f1e70eee974e/25.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/e0493d81-0501-44c3-8e46-0ebc2815c15e/26.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/efd02b30-853f-4dfa-b14e-ec0121dbd28b/27.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/6f1407d2-c725-4943-a69c-03f763de6c23/28.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/0363f0d2-d9b9-4d33-aea9-60d97d96eebe/29.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/230a93ff-336d-40b2-b453-38fa09e90f04/30.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/fa3d4dfe-2a48-4705-ad31-a6fd196f52a0/31.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/ec906b0f-0fbe-4f4d-900e-f66517d9ea88/32.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/f87e1aed-eb05-4aaf-ae67-aceb3108a7fa/33.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/02/6eeef75e-efdd-43a7-9fc2-759a3509e3e8/34.webp",
      ],
    },
    {
      id: "03",
      title: "mod贴图修复",
      type: "images",
      images: [
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/03/256bb3c5-1219-49d0-a9d2-596fabc8b5ad/35.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/03/e365b11d-34c4-4a47-a1a9-da7a2f88f4ea/36.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/03/a82cc385-d6f7-490f-852b-373d8e5c941a/1-mosaic.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/03/faa247a7-86a1-472f-a334-54d599b1e95f/38.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/03/c7cbbb98-c66b-4091-a4ca-214566a9c9a4/39.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/03/d7330900-c059-46c9-964a-b70fd79eb9e5/40.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/03/2588897e-4891-4647-87ba-f176a7219b04/41.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/03/9d92ef01-6986-42b8-a873-31f621237713/2-mosaic.webp",
      ],
    },
    {
      id: "04",
      title: "反虚化mod的添加",
      type: "images",
      images: [
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/317cb678-789e-47f4-8a47-76fe9020a9e6/43.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/ddf401ea-ca93-4734-bb62-26b224c1d7ba/44.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/12d5c017-08b8-4d40-a4a4-ecb92e2b8cc1/45.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/44ac34bd-4184-4359-8bd1-d98a1a8ade97/46.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/7269ee0b-d974-48d5-af03-c5b113fde712/47.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/6091336b-1271-4701-aff9-ac29d251143c/48.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/2e1cce8e-7a3f-4971-8fe2-edcf76244647/49.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/4dbdb5b8-eeb5-4e43-a850-a5435221bc63/50.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/dd954bbe-0692-45b5-ad62-6ee9e79af6b0/52.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/04/e643b979-3cee-4892-ba04-04da26c8fb72/53.webp",
      ],
    },
    {
      id: "05",
      title: "视角变化导致“掉mod”解决方法",
      type: "images",
      images: [
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/05/e0d12983-191a-493b-90b0-bd18de3fb6c3/54.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/05/b107cb01-7470-470f-8142-89f9aef0f770/55.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/05/1de16568-7cb6-4e90-a214-a8661f867e22/56.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/05/f8c4d3d7-e867-409a-b0f3-b3e8337d4af2/57.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/05/cb8fd517-8420-442a-b24a-6e85562c4431/58.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/05/7b71cd43-14cf-47d6-8e8d-eac978f977ac/59.webp",
        "https://wave-mod-preview-1327973389.cos.ap-guangzhou.myqcloud.com/tutorial/05/def0e700-7b13-4d7d-bd2d-e83f155856d1/60.webp",
      ],
    },
  ],
};

// Zod validates at module load time — catches config errors at build
export const tutorialConfig: TutorialConfig =
  tutorialConfigSchema.parse(rawConfig);
