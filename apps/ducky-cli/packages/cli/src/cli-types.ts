import type { TuiReadClipboardImage, TuiWriteClipboardText } from "@ducky/tui";
import type { UiLocale } from "@ducky/i18n";
import type { Logger } from "@ducky/contracts";
import type {
  createManagedCdpBrowserRuntime,
  ManagedCdpBrowserRuntimeOptions,
} from "@ducky/adapters/browser";
import type {
  createModelAdapter,
  createDuckyApp,
  CreateModelAdapterOptions,
  configureCodingPlanApiKey,
  ConfigureCodingPlanApiKeyOptions,
  inspectDuckySkill,
  inspectWorkspaceHookTrust,
  grantWorkspaceHookTrust,
  revokeWorkspaceHookTrustCli,
  inspectDuckyCustomCommand,
  InspectDuckyCustomCommandOptions,
  InspectDuckySkillOptions,
  loginDuckyCli,
  loginBigmodelCodingPlan,
  LoginBigmodelCodingPlanOptions,
  LoginDuckyCliOptions,
  listDuckyCustomCommands,
  ListDuckyCustomCommandsOptions,
  loadDuckyCustomCommand,
  listDuckySessions,
  listDuckySkills,
  ListDuckySessionsOptions,
  ListDuckySkillsOptions,
  logoutDuckyCli,
  LogoutDuckyCliOptions,
  resolveLatestSession,
  ResolveLatestSessionOptions,
  RunDuckyProtocolAgentOptions,
  prepareDuckyTelemetryEnv,
  startProcessProviderRegistryRuntime,
  shutdownDuckyTelemetry,
  DuckyAppOptions,
} from "@ducky/bootstrap";
import type { CliEnv, DotenvLoadResult, LoadCliDotenvOptions } from "./env.js";
import type { PluginsCommandOverrides } from "./plugins-command.js";
import type { CliShutdownProcess } from "./shutdown.js";
import type { resolveWorkspaceGitBranch } from "./tui-workspace-git.js";

export type BootstrapModule = typeof import("@ducky/bootstrap");

export interface RunDependencies extends PluginsCommandOverrides {
  protocolLifecycle?: RunDuckyProtocolAgentOptions["lifecycle"];
  protocolInput?: NodeJS.ReadableStream;
  createManagedCdpBrowserRuntime?: (
    options?: ManagedCdpBrowserRuntimeOptions,
  ) => ReturnType<typeof createManagedCdpBrowserRuntime>;
  createModelAdapter?: (
    options?: CreateModelAdapterOptions,
  ) => ReturnType<typeof createModelAdapter>;
  createDuckyApp?: (
    options?: DuckyAppOptions,
  ) => Awaited<ReturnType<typeof createDuckyApp>> | ReturnType<typeof createDuckyApp>;
  /**
   * Session-event shaper for --output-format stream-json. Defaults to the
   * bootstrap module's, which is also what the protocol server uses; injectable
   * so a caller that supplies its own `createDuckyApp` (tests, embedders) can
   * still stream, since the bootstrap module is not loaded on that path.
   */
  mapSessionEvent?: BootstrapModule["mapSessionEvent"];
  cwd?: () => string;
  env?: CliEnv;
  inspectSkill?: (options: InspectDuckySkillOptions) => ReturnType<typeof inspectDuckySkill>;
  inspectWorkspaceHookTrust?: typeof inspectWorkspaceHookTrust;
  grantWorkspaceHookTrust?: typeof grantWorkspaceHookTrust;
  revokeWorkspaceHookTrustCli?: typeof revokeWorkspaceHookTrustCli;
  inspectCustomCommand?: (
    options: InspectDuckyCustomCommandOptions,
  ) => ReturnType<typeof inspectDuckyCustomCommand>;
  loginDuckyCli?: (options?: LoginDuckyCliOptions) => ReturnType<typeof loginDuckyCli>;
  loginBigmodelCodingPlan?: (
    options?: LoginBigmodelCodingPlanOptions,
  ) => ReturnType<typeof loginBigmodelCodingPlan>;
  configureCodingPlanApiKey?: (
    options: ConfigureCodingPlanApiKeyOptions,
  ) => ReturnType<typeof configureCodingPlanApiKey>;
  loadDotenv?: (options?: LoadCliDotenvOptions) => DotenvLoadResult;
  prepareDuckyTelemetryEnv?: typeof prepareDuckyTelemetryEnv;
  projectConfigPath?: string;
  listSessions?: (options: ListDuckySessionsOptions) => ReturnType<typeof listDuckySessions>;
  listCustomCommands?: (
    options: ListDuckyCustomCommandsOptions,
  ) => ReturnType<typeof listDuckyCustomCommands>;
  loadCustomCommand?: (
    options: InspectDuckyCustomCommandOptions,
  ) => ReturnType<typeof loadDuckyCustomCommand>;
  // headless slash 路由要和 app facade 的保留名 gate 用同一个判据；默认取 bootstrap 的，
  // 注入点只为让单测不必拉起整个 bootstrap 模块。见 prompt-command.ts。
  isReservedSlashCommandName?: BootstrapModule["isReservedDuckySlashCommandName"];
  listSkills?: (options: ListDuckySkillsOptions) => ReturnType<typeof listDuckySkills>;
  logger?: Logger;
  readClipboardImage?: TuiReadClipboardImage;
  writeClipboardText?: TuiWriteClipboardText;
  resolveLatestSession?: (
    options: ResolveLatestSessionOptions,
  ) => ReturnType<typeof resolveLatestSession>;
  resolveWorkspaceGitBranch?: typeof resolveWorkspaceGitBranch;
  logoutDuckyCli?: (options?: LogoutDuckyCliOptions) => ReturnType<typeof logoutDuckyCli>;
  runDuckyProtocolAgent?: (options?: RunDuckyProtocolAgentOptions) => Promise<void>;
  runTui?: typeof import("@ducky/tui").runTui;
  skipUserConfig?: boolean;
  userConfigPath?: string;
  exitProcess?: (code: number) => void;
  shutdownCleanupTimeoutMs?: number;
  shutdownProcess?: CliShutdownProcess;
  startProcessProviderRegistryRuntime?: typeof startProcessProviderRegistryRuntime;
  shutdownDuckyTelemetry?: typeof shutdownDuckyTelemetry;
}

export type CliPermissionMode = "build" | "plan" | "edit" | "yolo";
export type CliRuntimeMode = CliPermissionMode | "auto";

export interface CliModeState {
  current?: CliRuntimeMode;
  override?: CliPermissionMode;
}

export interface CliTargetRequest {
  objective: string;
  replaceExisting: boolean;
}

export type ModeCapableApp = Awaited<ReturnType<typeof createDuckyApp>> & {
  getMode?: () => CliRuntimeMode;
  setLocale?: (locale: UiLocale) => Promise<{ locale: "en-US" | "zh-CN" }>;
  setMode?: (mode: CliRuntimeMode) => Promise<{ mode: CliRuntimeMode }>;
};

export interface CliResumeRequest {
  continueSession: boolean;
  resumeSessionId?: string;
}
