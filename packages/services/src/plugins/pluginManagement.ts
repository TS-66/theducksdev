// 平台能力面收敛：设置页「插件管理」的薄服务接口。
//
// 背景：pluginManagementStore / usePluginUninstall 过去直接注入 IDuckyAgentService，
// UI 层因此散布 13 个 plugins/* 旧协议词的消费点。收敛为独立薄 service 后，UI 只依赖
// 本接口；plugins/* 词表的 host 侧消费点收拢到 pluginManagementService 一处（插件的
// 事实源在 ducky-cli 进程，服务实现仍经 agent 协议往返——plugins 词表的收口归属
// 插件能力面自身的协议演进，不在会话 v4 词表范围内）。
// 注意与既有 IPluginsService（已 retired 的 marketplace pluginStore 通道）区分：
// 那套接口按 pluginName+marketplace 寻址且方法语义过时，不复用避免签名冲突。
import type { Event } from "@ducky/rpc";
import type {
  DuckyPluginOperationProgressNotification,
  DuckyPluginsConfigureResult,
  DuckyPluginsCancelOperationResult,
  DuckyPluginsDescribeResult,
  DuckyPluginsInstallResult,
  DuckyPluginsListResult,
  DuckyPluginsMarketplaceMutationResult,
  DuckyPluginsOverviewResult,
  DuckyPluginsReferenceCatalogResult,
  DuckyPluginsRestoreBuiltinResult,
  DuckyPluginsSetEnabledResult,
  DuckyPluginsUninstallResult,
  DuckyPluginsValidateResult,
} from "@ducky/shared";
import { ServiceChannels } from "@ducky/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type {
  DuckyAgentAddPluginMarketplaceParams,
  DuckyAgentConfigurePluginParams,
  DuckyAgentCancelPluginOperationParams,
  DuckyAgentDescribePluginParams,
  DuckyAgentInstallPluginParams,
  DuckyAgentPluginReferenceCatalogParams,
  DuckyAgentResolveSuggestedPluginReferenceParams,
  DuckyAgentResetPluginConfigParams,
  DuckyAgentPluginViewParams,
  DuckyAgentRemovePluginMarketplaceParams,
  DuckyAgentRestoreBuiltinPluginParams,
  DuckyAgentSetPluginEnabledParams,
  DuckyAgentUninstallPluginParams,
  DuckyAgentUpdatePluginMarketplaceParams,
  DuckyAgentUpdatePluginParams,
  DuckyAgentValidatePluginParams,
} from "../ducky-agent/duckyAgentPluginParams.js";

export interface IPluginManagementService {
  listPlugins(params: DuckyAgentPluginViewParams): Promise<DuckyPluginsListResult>;
  /**
   * Plugin 对话引用 catalog：
   * 带 sessionId → session-owned 冻结 catalog；不带 → workspace 当前 catalog。
   * 实现路由到 workspace 级 agent client，不走插件管理独立进程。
   */
  getPluginReferenceCatalog(
    params: DuckyAgentPluginReferenceCatalogParams,
  ): Promise<DuckyPluginsReferenceCatalogResult>;
  resolveSuggestedPluginReference(
    params: DuckyAgentResolveSuggestedPluginReferenceParams,
  ): Promise<import("@ducky/shared").DuckyPluginsResolveSuggestedReferenceResult>;
  onDynamicPluginOperationProgress(
    operationId: string,
  ): Event<DuckyPluginOperationProgressNotification>;
  getPluginsOverview(params: DuckyAgentPluginViewParams): Promise<DuckyPluginsOverviewResult>;
  addPluginMarketplace(
    params: DuckyAgentAddPluginMarketplaceParams,
  ): Promise<DuckyPluginsMarketplaceMutationResult>;
  removePluginMarketplace(
    params: DuckyAgentRemovePluginMarketplaceParams,
  ): Promise<DuckyPluginsMarketplaceMutationResult>;
  updatePluginMarketplace(
    params: DuckyAgentUpdatePluginMarketplaceParams,
  ): Promise<DuckyPluginsMarketplaceMutationResult>;
  installPlugin(params: DuckyAgentInstallPluginParams): Promise<DuckyPluginsInstallResult>;
  cancelPluginOperation(
    params: DuckyAgentCancelPluginOperationParams,
  ): Promise<DuckyPluginsCancelOperationResult>;
  uninstallPlugin(params: DuckyAgentUninstallPluginParams): Promise<DuckyPluginsUninstallResult>;
  updatePlugin(params: DuckyAgentUpdatePluginParams): Promise<DuckyPluginsInstallResult>;
  restoreBuiltinPlugin(
    params: DuckyAgentRestoreBuiltinPluginParams,
  ): Promise<DuckyPluginsRestoreBuiltinResult>;
  configurePlugin(params: DuckyAgentConfigurePluginParams): Promise<DuckyPluginsConfigureResult>;
  resetPluginConfig(
    params: DuckyAgentResetPluginConfigParams,
  ): Promise<DuckyPluginsConfigureResult>;
  validatePlugin(params: DuckyAgentValidatePluginParams): Promise<DuckyPluginsValidateResult>;
  describePlugin(params: DuckyAgentDescribePluginParams): Promise<DuckyPluginsDescribeResult>;
  setPluginEnabled(params: DuckyAgentSetPluginEnabledParams): Promise<DuckyPluginsSetEnabledResult>;
}

export const IPluginManagementService = createServiceDescriptor<IPluginManagementService>(
  ServiceChannels.PluginManagement,
);
