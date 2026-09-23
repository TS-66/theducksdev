/**
 * Ducky AI | Coder — model capability contract + id heuristics.
 *
 * Capability-flag *contract* adapted from ZCode's model-config schema
 * (Apache-2.0, zai-org/ZCode `packages/shared/src/model-config.ts`):
 * contextWindow, image/tool-call support. ZCode fills values from its
 * provider registry; we are BYOK so values are *inferred* from the model id
 * until the endpoint tells us otherwise (discovery lists ids only).
 * `formatContextWindow` logic mirrors their list-models chip formatter.
 */

export interface ModelInputFormat {
  supportsText: boolean;
  supportsImage: boolean;
  supportsVideo: boolean;
  supportsAudio: boolean;
  supportsPdf: boolean;
}

export interface ModelCapabilities {
  contextWindow?: number;
  inputFormat: ModelInputFormat;
  supportsToolCall: boolean;
}

/** Human-scan chip: sub-1000 raw, K below a million, M above (1.5M). */
export function formatContextWindow(contextWindow: number): string {
  if (contextWindow < 1_000) {
    return String(contextWindow);
  }
  if (contextWindow < 1_000_000) {
    return `${Math.round(contextWindow / 1_000)}K`;
  }
  const millions = contextWindow / 1_000_000;
  return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
}

const TEXT_ONLY_RE = /(embedding|whisper|tts|dall-e|image-|moderation|jina-reader)/i;
const VISION_RE =
  /(vision|vl-|[-_]vl\b|image|4o\b|gpt-4-turbo|glm-4v|qwen.{0,3}vl|llava|pixtral|gemini|claude-(3|4|opus|sonnet|haiku)|claude\b|grok-2-vision|o4-mini|gpt-5)/i;

/**
 * Best-effort capabilities from a bare model id. Explicit overrides win;
 * unknown ids assume text-in/tools (the OpenAI-compatible common case) and
 * NO vision — vision is the dangerous direction to guess wrong in.
 */
export function inferModelCapabilities(
  modelId: string,
  override?: Partial<ModelCapabilities & { inputFormat?: Partial<ModelInputFormat> }>,
): ModelCapabilities {
  const id = (modelId ?? "").trim();
  const textOnly = TEXT_ONLY_RE.test(id);
  const caps: ModelCapabilities = {
    contextWindow: undefined,
    inputFormat: {
      supportsText: true,
      supportsImage: !textOnly && VISION_RE.test(id),
      supportsVideo: false,
      supportsAudio: false,
      supportsPdf: false,
    },
    supportsToolCall: !textOnly,
  };
  if (override?.contextWindow !== undefined) caps.contextWindow = override.contextWindow;
  if (override?.supportsToolCall !== undefined) caps.supportsToolCall = override.supportsToolCall;
  if (override?.inputFormat) Object.assign(caps.inputFormat, override.inputFormat);
  return caps;
}

/** Endpoint hostname → provider label (drives model-menu grouping). */
export function providerOf(baseUrl: string): string {
  const h = (() => {
    try {
      return new URL(baseUrl).hostname.toLowerCase();
    } catch {
      return baseUrl.trim().toLowerCase();
    }
  })();
  if (h.includes("openai")) return "OpenAI";
  if (h.includes("anthropic")) return "Anthropic";
  if (h.includes("nvidia")) return "NVIDIA";
  if (h.includes("groq")) return "Groq";
  if (h.includes("together")) return "Together";
  if (h.includes("openrouter")) return "OpenRouter";
  if (h.includes("deepseek")) return "DeepSeek";
  if (h.includes("mistral")) return "Mistral";
  if (h.includes("cohere")) return "Cohere";
  if (h.includes("azure")) return "Azure";
  if (h.includes("localhost") || h.includes("127.0.0.1") || h === "") return h === "" ? "Custom" : "Local";
  return h || "Custom";
}
