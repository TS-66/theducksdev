import { z } from "zod";

/**
 * Ducky agent 提供方的单一真源。
 *
 * 类型 DuckyProvider、运行时 schema duckyProviderSchema 都从这里派生,
 * 避免各处内联 z.enum([...]) 副本随新增/删除 provider 漂移。
 * 本模块只依赖 zod(叶子),可被 validation / ducky-protocol 等无环引用。
 */
const DUCKY_PROVIDERS = ["glm"] as const;

export const duckyProviderSchema = z.enum(DUCKY_PROVIDERS);

export type DuckyProvider = (typeof DUCKY_PROVIDERS)[number];
