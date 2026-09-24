// Bootstrap public API surface.

export * from "./app/create-app.js";
export type {
  ListDuckySessionsOptions,
  PromptInput,
  ResolveLatestSessionOptions,
  ResumeOptions,
  RunDuckyProtocolAgentOptions,
  SendInputOptions,
  SendInputResult,
  SetLocaleResult,
  SteerTurnOptions,
  SubmitPromptOptions,
  UserPromptInput,
  DuckyApp,
  DuckyAppOptions,
  DuckyModelOption,
} from "./app/types.js";
export * from "./auth-login.js";
export {
  inspectDuckyCustomCommand,
  listDuckyCustomCommands,
  loadDuckyCustomCommand,
} from "./custom-commands.js";
export type {
  InspectDuckyCustomCommandOptions,
  ListDuckyCustomCommandsOptions,
  DuckyCustomCommandInspection,
} from "./custom-commands.js";
export { createModelAdapter } from "./model-factory.js";
export type { CreateModelAdapterOptions } from "./model-factory.js";
export { startProcessProviderRegistryRuntime } from "./app/process-provider-registry-runtime.js";
export type { ProcessProviderRegistryRuntimeOptions } from "./app/process-provider-registry-runtime.js";
export {
  addDuckyPluginMarketplace,
  getDuckyPluginsOverview,
  installDuckyMarketplacePlugin,
  listDuckyPlugins,
  removeDuckyPluginMarketplace,
  resolveDuckyPlugins,
  setDuckyPluginEnabled,
  uninstallDuckyMarketplacePlugin,
  updateDuckyMarketplacePlugin,
  updateDuckyPluginMarketplace,
  validateDuckyPluginPath,
} from "./plugins.js";
export type {
  AddDuckyMarketplaceOptions,
  InstallDuckyMarketplacePluginOptions,
  ListDuckyPluginsOptions,
  RemoveDuckyMarketplaceOptions,
  ResolveDuckyPluginsOptions,
  SetDuckyPluginEnabledOptions,
  SetDuckyPluginEnabledResult,
  UninstallDuckyMarketplacePluginOptions,
  UpdateDuckyMarketplaceOptions,
  UpdateDuckyMarketplacePluginOptions,
  ValidateDuckyPluginPathOptions,
  DuckyAvailablePluginData,
  DuckyInstalledPluginData,
  DuckyMarketplaceSummaryData,
  DuckyMarketplaceUpdateData,
  DuckyPluginInstallData,
  DuckyPluginUpdateData,
  DuckyPluginsOverviewData,
} from "./plugins.js";
export { runDuckyProtocolAgent } from "./ducky-protocol-entrypoint.js";
// Exposed for the CLI's --output-format stream-json: it needs the same event
// shape the protocol server emits, rather than inventing a second one.
export { mapSessionEvent } from "./ducky-protocol/session-mapper.js";
export { prepareDuckyTelemetryEnv, shutdownDuckyTelemetry } from "./telemetry-bootstrap.js";
export type { SessionTranscriptMessage, SessionTranscriptPart } from "./session-transcript.js";
export { listDuckySessions, resolveLatestSession } from "./sessions.js";
export { inspectDuckySkill, listDuckySkills } from "./skills.js";
export type {
  InspectDuckySkillOptions,
  ListDuckySkillsOptions,
  DuckySkillInspection,
} from "./skills.js";
// Exposed for the CLI's headless slash routing: it must decide "is this a real
// custom command?" with the *same* reserved-name gate the app facade's
// customCommandPromptResolver applies, or the two disagree and a reserved name
// reaches the model as literal prompt text. See prompt-command.ts.
export { isReservedDuckySlashCommandName } from "./slash-command-surface.js";
export {
  grantWorkspaceHookTrust,
  inspectWorkspaceHookTrust,
  revokeWorkspaceHookTrustCli,
} from "./workspace-hook-trust-cli.js";
export type {
  WorkspaceHookTrustCliItem,
  WorkspaceHookTrustCliStatus,
  WorkspaceHookTrustCliTarget,
} from "./workspace-hook-trust-cli.js";
