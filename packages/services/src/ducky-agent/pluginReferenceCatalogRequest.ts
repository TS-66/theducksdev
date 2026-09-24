import {
  duckyProtocolMethods,
  duckyPluginsReferenceCatalogResultSchema,
  type DuckyPluginsReferenceCatalogParams,
} from "@ducky/shared";
import type { DuckyProtocolClient } from "#src/ducky-agent/duckyProtocolClient.js";

/** 旧协议严格校验响应；新展示字段走独立入口，只有 -32601 能证明旧 Agent 不支持。 */
export async function requestPluginReferenceCatalog(
  client: Pick<DuckyProtocolClient, "request">,
  params: DuckyPluginsReferenceCatalogParams,
) {
  try {
    return await client.request(
      duckyProtocolMethods.pluginsReferenceCatalogWithCategory,
      params,
      duckyPluginsReferenceCatalogResultSchema,
    );
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && error.code === -32601))
      throw error;
    return client.request(
      duckyProtocolMethods.pluginsReferenceCatalog,
      params,
      duckyPluginsReferenceCatalogResultSchema,
    );
  }
}
