import {
  ProviderConfigService,
  type ProviderConfigLayerSnapshot,
  type ProviderConfigLayerUpdate,
} from "@ducky/provider";
import { NodeDuckyBuiltinProviderConfigSource } from "./ducky-builtin-provider-config-source.js";
import {
  EndpointScopedDuckyBuiltinSource,
  type EndpointScopedDuckyBuiltinSourceOptions,
} from "./endpoint-scoped-ducky-builtin-source.js";
import {
  DuckyBuiltinRemoteSynchronizer,
  type DuckyBuiltinRemoteSynchronizerOptions,
  type DuckyBuiltinRefreshResult,
} from "./ducky-builtin-remote-synchronizer.js";
import {
  NodePersonalProviderConfigRepository,
  type PersonalProviderConfigRecoveryEvent,
} from "./personal-provider-config-repository.js";

export interface NodeProviderConfigRuntimeOptions {
  readonly duckyBuiltinFilePath: string;
  readonly duckyBuiltinActiveFilePath?: string;
  readonly duckyBuiltinRemote?: Omit<DuckyBuiltinRemoteSynchronizerOptions, "source">;
  readonly duckyBuiltinEnvironment?: Omit<
    EndpointScopedDuckyBuiltinSourceOptions,
    "bundledFilePath"
  >;
  readonly onDuckyBuiltinRefreshError?: (error: unknown) => void;
  readonly onPersonalConfigRecovery?: (event: PersonalProviderConfigRecoveryEvent) => void;
  readonly onPersonalConfigPollingError?: (error: unknown) => void;
  readonly personalFilePath: string;
  readonly personalPollingIntervalMs?: number | false;
  readonly importLegacy?: (
    duckyBuiltin: ProviderConfigLayerSnapshot,
  ) => Promise<ProviderConfigLayerUpdate | null>;
  readonly watch?: boolean;
}

/** 组装一个 Node.js 进程内共享的 Ducky Built-in/Personal Config 运行边界。 */
export class NodeProviderConfigRuntime {
  readonly configService: ProviderConfigService;
  readonly #duckyBuiltinSource:
    | NodeDuckyBuiltinProviderConfigSource
    | EndpointScopedDuckyBuiltinSource;
  readonly #personalRepository: NodePersonalProviderConfigRepository;
  readonly #remoteSynchronizer?: DuckyBuiltinRemoteSynchronizer;
  readonly #onRemoteRefreshError?: (error: unknown) => void;
  #startPromise: Promise<void> | null = null;
  #disposed = false;
  readonly #checkListeners = new Set<() => Promise<void>>();
  #checkTimer: ReturnType<typeof setInterval> | null = null;
  #checkInFlight: Promise<void> | null = null;

  constructor(options: NodeProviderConfigRuntimeOptions) {
    this.#duckyBuiltinSource = options.duckyBuiltinEnvironment
      ? new EndpointScopedDuckyBuiltinSource({
          bundledFilePath: options.duckyBuiltinFilePath,
          ...options.duckyBuiltinEnvironment,
        })
      : new NodeDuckyBuiltinProviderConfigSource({
          bundledFilePath: options.duckyBuiltinFilePath,
          activeFilePath: options.duckyBuiltinActiveFilePath,
          watch: options.watch,
        });
    this.#remoteSynchronizer =
      options.duckyBuiltinRemote &&
      this.#duckyBuiltinSource instanceof NodeDuckyBuiltinProviderConfigSource
        ? new DuckyBuiltinRemoteSynchronizer({
            source: this.#duckyBuiltinSource,
            ...options.duckyBuiltinRemote,
          })
        : undefined;
    this.#onRemoteRefreshError = options.onDuckyBuiltinRefreshError;
    this.#personalRepository = new NodePersonalProviderConfigRepository({
      filePath: options.personalFilePath,
      onRecovery: options.onPersonalConfigRecovery,
      onPollingError: options.onPersonalConfigPollingError,
      pollingIntervalMs: options.personalPollingIntervalMs,
      ...(options.importLegacy
        ? {
            importLegacy: async () => options.importLegacy!(await this.#duckyBuiltinSource.read()),
          }
        : {}),
    });
    this.configService = new ProviderConfigService({
      duckyBuiltinSource: this.#duckyBuiltinSource,
      personalRepository: this.#personalRepository,
    });
  }

  resolveDuckyBuiltinActiveFilePath(): Promise<string> {
    return this.#duckyBuiltinSource instanceof NodeDuckyBuiltinProviderConfigSource
      ? Promise.resolve(this.#duckyBuiltinSource.activeFilePath)
      : this.#duckyBuiltinSource.resolveActiveFilePath();
  }

  get personalRepository(): import("@ducky/provider").PersonalProviderConfigRepository {
    return this.#personalRepository;
  }

  /** Environment 同一周期检查中恢复未对齐依赖，不被下载 TTL 或失败挡住。 */
  onDidCheckDuckyBuiltin(listener: () => Promise<void>): () => void {
    this.#checkListeners.add(listener);
    return () => this.#checkListeners.delete(listener);
  }

  start(): Promise<void> {
    if (this.#disposed) throw new Error("NodeProviderConfigRuntime 已 dispose");
    if (this.#startPromise) return this.#startPromise;
    const startPromise = this.configService.read().then(() => {
      if (this.#disposed) return;
      void this.#checkBackground();
      // Managed Worker 无下载配置也无恢复 owner，不建立周期任务。
      if (
        this.#remoteSynchronizer ||
        this.#duckyBuiltinSource instanceof EndpointScopedDuckyBuiltinSource ||
        this.#checkListeners.size > 0
      ) {
        this.#checkTimer = setInterval(() => {
          void this.#checkBackground();
        }, 60_000);
        this.#checkTimer.unref?.();
      }
    });
    this.#startPromise = startPromise;
    void startPromise.catch(() => {
      if (this.#startPromise === startPromise) this.#startPromise = null;
    });
    return startPromise;
  }

  refreshDuckyBuiltin(options?: { readonly force?: boolean }): Promise<DuckyBuiltinRefreshResult> {
    if (this.#disposed) return Promise.resolve("disposed");
    if (this.#duckyBuiltinSource instanceof EndpointScopedDuckyBuiltinSource) {
      return this.#duckyBuiltinSource.refresh(options);
    }
    return this.#remoteSynchronizer?.refresh(options) ?? Promise.resolve("skipped");
  }

  #checkBackground(): Promise<void> {
    if (this.#disposed) return Promise.resolve();
    if (this.#checkInFlight) return this.#checkInFlight;
    const check = Promise.allSettled([
      this.refreshDuckyBuiltin(),
      ...[...this.#checkListeners].map((listener) => Promise.resolve().then(listener)),
    ])
      .then((results) => {
        if (this.#disposed) return;
        for (const result of results)
          if (result.status === "rejected") this.#onRemoteRefreshError?.(result.reason);
      })
      .finally(() => {
        if (this.#checkInFlight === check) this.#checkInFlight = null;
      });
    this.#checkInFlight = check;
    return check;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    if (this.#checkTimer) clearInterval(this.#checkTimer);
    this.#checkTimer = null;
    this.#checkListeners.clear();
    this.#remoteSynchronizer?.dispose();
    this.configService.dispose();
    this.#personalRepository.dispose();
    this.#duckyBuiltinSource.dispose();
  }
}

export function createNodeProviderConfigRuntime(
  options: NodeProviderConfigRuntimeOptions,
): NodeProviderConfigRuntime {
  return new NodeProviderConfigRuntime(options);
}
