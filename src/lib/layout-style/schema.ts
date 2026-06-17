import { z } from "zod";

/** 运行时校验风格值，防止 XSS / 非法值 */
export const zLayoutStyle = z.enum(["zzz-immersive", "neo-brutalism"]);
