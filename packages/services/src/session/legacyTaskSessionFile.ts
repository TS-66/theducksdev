import type { DuckySessionFile, DuckyTaskMeta } from "@ducky/shared";
import { duckySessionFileSchema, duckyTaskMetaSchema, duckyTaskModeSchema } from "@ducky/shared";

export type LegacyTaskSessionFile = Omit<DuckySessionFile, "meta"> & {
  meta: Omit<DuckyTaskMeta, "mode"> & { mode?: DuckyTaskMeta["mode"] };
};

const legacyTaskSessionFileSchema = duckySessionFileSchema.extend({
  // Claude 原生迁移会按清洗路径删除 meta.mode。
  // legacy snapshot 读取/写入仍要校验其它必需字段，但不能再强制把被过滤字段补回文件。
  meta: duckyTaskMetaSchema.extend({
    mode: duckyTaskModeSchema.optional(),
  }),
});

export function parseLegacyTaskSessionFile(input: unknown): LegacyTaskSessionFile {
  return legacyTaskSessionFileSchema.parse(input);
}

export function safeParseLegacyTaskSessionFile(input: unknown) {
  return legacyTaskSessionFileSchema.safeParse(input);
}
