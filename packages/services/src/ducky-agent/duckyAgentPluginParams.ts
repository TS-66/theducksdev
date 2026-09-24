import type {
  DuckyAgentMcpServer,
  DuckyAutomationScheduleRule,
  DuckyMcpListMode,
  ModelSelection,
} from "@ducky/shared";

export interface DuckyAgentWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  /** 远程 workspace 的运行时会话身份；只用于隔离/路由，不能替代 workspacePath。 */
  remoteSessionId?: string;
}

export interface DuckyAgentPluginViewParams extends DuckyAgentWorkspaceTarget {
  configScope?: "user" | "workspace";
}

export interface DuckyAgentListMcpServerStatusesParams extends DuckyAgentWorkspaceTarget {
  mcpServers?: DuckyAgentMcpServer[];
  mode?: DuckyMcpListMode;
}

export interface DuckyAgentAddPluginMarketplaceParams extends DuckyAgentWorkspaceTarget {
  dryRun?: boolean;
  operationId?: string;
  source: string;
}

export interface DuckyAgentRemovePluginMarketplaceParams extends DuckyAgentWorkspaceTarget {
  marketplace: string;
}

export interface DuckyAgentUpdatePluginMarketplaceParams extends DuckyAgentWorkspaceTarget {
  marketplace?: string;
  operationId?: string;
}

export interface DuckyAgentInstallPluginParams extends DuckyAgentWorkspaceTarget {
  dryRun?: boolean;
  marketplace: string;
  operationId?: string;
  pluginName: string;
  scope?: "user" | "workspace";
}

export interface DuckyAgentCancelPluginOperationParams {
  operationId: string;
}

export interface DuckyAgentUninstallPluginParams extends DuckyAgentWorkspaceTarget {
  marketplace?: string;
  pluginId?: string;
  pluginName?: string;
  removeCache?: boolean;
}

export interface DuckyAgentUpdatePluginParams extends DuckyAgentWorkspaceTarget {
  pluginId?: string;
  marketplace?: string;
}

export interface DuckyAgentRestoreBuiltinPluginParams extends DuckyAgentWorkspaceTarget {
  pluginId: string;
}

export interface DuckyAgentConfigurePluginParams extends DuckyAgentWorkspaceTarget {
  clearOptionKeys?: string[];
  dryRun?: boolean;
  options: Record<string, unknown>;
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface DuckyAgentResetPluginConfigParams extends DuckyAgentWorkspaceTarget {
  pluginId: string;
  scope?: "user" | "workspace";
}

export interface DuckyAgentValidatePluginParams extends DuckyAgentWorkspaceTarget {
  marketplace?: string;
  pluginName?: string;
  source?: string;
}

export interface DuckyAgentDescribePluginParams extends DuckyAgentWorkspaceTarget {
  marketplace: string;
  pluginName: string;
}

export interface DuckyAgentSetPluginEnabledParams extends DuckyAgentWorkspaceTarget {
  enabled: boolean;
  operationId?: string;
  pluginId: string;
  scope?: "user" | "workspace";
}

// Plugin 对话引用 catalog：
// 带 sessionId → session-owned 冻结 catalog（必须路由到持有该 session 的 workspace client）；
// 不带 → workspace 当前 catalog（新建草稿 Picker）。
export interface DuckyAgentPluginReferenceCatalogParams extends DuckyAgentWorkspaceTarget {
  sessionId?: string;
}

// Composer Skill catalog：与 Plugin 引用相同，以 sessionId 区分 workspace 当前目录和
// resident Session runtime 快照；不参与 Settings 管理目录。
export interface DuckyAgentSkillReferenceCatalogParams extends DuckyAgentWorkspaceTarget {
  sessionId?: string;
}
export interface DuckyAgentResolveSuggestedPluginReferenceParams extends DuckyAgentWorkspaceTarget {
  stableId: string;
  operationId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  deliveryKind: "desktop-continuous" | "web-remote-replayable";
}

// ---- 定时任务(automation)管理参数 ----

export interface DuckyAgentCreateAutomationParams extends DuckyAgentWorkspaceTarget {
  title: string;
  cronExpr: string;
  relativeDelayMinutes?: number;
  prompt: string;
  modelSelection?: ModelSelection;
  mode?: string;
  recurring?: boolean;
  maxRuns?: number;
  endAt?: number;
  scheduleRule?: DuckyAutomationScheduleRule;
}

export interface DuckyAgentUpdateAutomationParams extends DuckyAgentWorkspaceTarget {
  automationId: string;
  title?: string;
  cronExpr?: string;
  prompt?: string;
  modelSelection?: ModelSelection | null;
  mode?: string | null;
  recurring?: boolean;
  maxRuns?: number | null;
  endAt?: number | null;
  scheduleRule?: DuckyAutomationScheduleRule | null;
  scheduleEditedByUser?: boolean;
}

export interface DuckyAgentAutomationIdParams extends DuckyAgentWorkspaceTarget {
  automationId: string;
}

export interface DuckyAgentSetAutomationEnabledParams extends DuckyAgentWorkspaceTarget {
  automationId: string;
  enabled: boolean;
}

export interface DuckyAgentDeleteAutomationRunParams extends DuckyAgentWorkspaceTarget {
  runId: string;
}
