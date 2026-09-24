import { z } from "zod";
import type { CommandAgentSource } from "./command-types.js";
import type { DuckyProvider } from "./ducky-task-types-core.js";

export const DUCKY_AGENT_PROVIDER = "glm" satisfies DuckyProvider;
export const DUCKY_AGENT_PROVIDER_LABEL = "Ducky Agent";
export const DUCKY_COMMAND_AGENT_SOURCE = "duckyAgent" satisfies CommandAgentSource;

export const duckyAgentProviderSchema = z.literal(DUCKY_AGENT_PROVIDER);

export const DUCKY_COMMAND_AGENT_SOURCES = [
  DUCKY_COMMAND_AGENT_SOURCE,
] as const satisfies readonly CommandAgentSource[];

export function normalizeAgentProviderToDuckyAgent(
  _provider?: DuckyProvider | null,
): DuckyProvider {
  return DUCKY_AGENT_PROVIDER;
}

export function isDuckyAgentProvider(
  provider: DuckyProvider | null | undefined,
): provider is typeof DUCKY_AGENT_PROVIDER {
  return provider === DUCKY_AGENT_PROVIDER;
}
