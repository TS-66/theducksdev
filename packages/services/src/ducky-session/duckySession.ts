import { ServiceChannels } from "@ducky/shared";
import type {
  TraceId,
  DuckyAgentMcpServer,
  DuckyDeliveryKind,
  DuckyMessageWithParts,
  ModelSelection,
  DuckyPermissionRequestParams,
  DuckyUserInputRequestParams,
  DuckyUserInputResponse,
  DuckySessionInfo,
  DuckySessionImportHistory,
  DuckySessionEvent,
  DuckySessionMode,
  DuckySessionPersistence,
  DuckySessionStateSnapshot,
  DuckyStateUpdatedNotification,
  DuckyWorkspacePresentation,
} from "@ducky/shared";
import { createServiceDescriptor } from "#src/descriptors.js";

export interface DuckySessionWorkspaceTarget {
  workspacePath: string;
  workspaceIdentity?: string;
  remoteSessionId?: string;
}

export type DuckySessionReadWorkspacePresentationParams = DuckySessionWorkspaceTarget;

export interface DuckyTaskTarget extends DuckySessionWorkspaceTarget {
  sessionId: string;
}

export interface DuckySessionCreateParams extends DuckySessionWorkspaceTarget {
  /** 仅导入事务使用的预分配 ID；普通新会话继续由 Agent 分配。 */
  sessionId?: string;
  sessionTraceId?: TraceId;
  parentSessionId?: string;
  mode?: DuckySessionMode;
  model?: ModelSelection;
  persistence?: DuckySessionPersistence;
  thoughtLevel?: string;
  mcpServers?: DuckyAgentMcpServer[];
  importedHistory?: DuckySessionImportHistory;
}

export interface DuckySessionResumeParams extends DuckyTaskTarget {
  model?: ModelSelection;
  thoughtLevel?: string;
  mcpServers?: DuckyAgentMcpServer[];
  /**
   * 默认广播 resume 得到的历史快照，并让 shadow 订阅请求初始 snapshot。
   * 续聊发送前的 runtime 预恢复会关闭它，避免旧终态快照覆盖本地已开始的新输入运行态。
   */
  broadcastSnapshot?: boolean;
}

export interface DuckySessionListParams extends DuckySessionWorkspaceTarget {
  includeArchived?: boolean;
  limit?: number;
}

export interface DuckySessionReadParams extends DuckyTaskTarget {
  deliveryKind?: DuckyDeliveryKind;
  messageLimit?: number;
  afterSeq?: number;
}

export interface DuckySessionMessagesParams extends DuckyTaskTarget {
  afterMessageId?: string;
  limit?: number;
}

export interface DuckySessionEventsParams extends DuckyTaskTarget {
  afterSeq?: number;
  limit?: number;
}

export interface DuckySessionSetModelParams extends DuckyTaskTarget {
  model: ModelSelection;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface DuckySessionSetThoughtLevelParams extends DuckyTaskTarget {
  thoughtLevel?: string;
  expectedRevision?: number;
  persistAsWorkspaceLastUsed?: boolean;
}

export interface DuckySessionSetModeParams extends DuckyTaskTarget {
  mode: DuckySessionMode;
  expectedRevision?: number;
}

export interface DuckySessionSubscribeParams extends DuckyTaskTarget {
  deliveryKind: DuckyDeliveryKind;
  afterSeq?: number;
  includeSnapshot?: boolean;
  eventCoalescing?: {
    mode: "background-summary";
    intervalMs?: number;
  };
}

export type DuckySessionServiceEvent =
  | { type: "session.event"; event: DuckySessionEvent }
  | { type: "state.updated"; notification: DuckyStateUpdatedNotification }
  | { type: "permission.request"; request: DuckyPermissionRequestParams }
  | { type: "userInput.request"; request: DuckyUserInputRequestParams }
  | {
      type: "userInput.response";
      requestId: string;
      response: DuckyUserInputResponse;
    }
  | { type: "snapshot"; snapshot: DuckySessionStateSnapshot };

export interface DuckySessionInitializeResult {
  available: boolean;
  workspaceKey: string;
  protocolName?: string;
  protocolVersion?: number;
  transportKind?: "stdio" | "websocket";
  reason?: string;
  reasonCode?: "provider_not_ready";
}

export interface DuckySessionWorkspaceRuntimeIdentity {
  generation: number;
  identity: string;
  processId?: number;
  workspaceKey: string;
}

export interface IDuckySessionService {
  initializeWorkspace(params: DuckySessionWorkspaceTarget): Promise<DuckySessionInitializeResult>;
  getWorkspaceRuntimeIdentity(
    params: DuckySessionWorkspaceTarget,
  ): Promise<DuckySessionWorkspaceRuntimeIdentity>;
  readWorkspacePresentation(
    params: DuckySessionReadWorkspacePresentationParams,
  ): Promise<DuckyWorkspacePresentation>;
  createSession(params: DuckySessionCreateParams): Promise<DuckySessionStateSnapshot>;
  resumeSession(params: DuckySessionResumeParams): Promise<DuckySessionStateSnapshot>;
  listSessions(params: DuckySessionListParams): Promise<DuckySessionInfo[]>;
  readSession(params: DuckySessionReadParams): Promise<DuckySessionStateSnapshot>;
  readSessionMessages(params: DuckySessionMessagesParams): Promise<DuckyMessageWithParts[]>;
  readSessionEvents(params: DuckySessionEventsParams): Promise<DuckySessionEvent[]>;
  promoteDeferredDraftSession(params: DuckyTaskTarget): Promise<void>;
  closeSession(params: DuckyTaskTarget): Promise<void>;
  closeDeferredDraftSession(params: DuckyTaskTarget): Promise<boolean>;
  setModel(params: DuckySessionSetModelParams): Promise<DuckySessionStateSnapshot>;
  setThoughtLevel(params: DuckySessionSetThoughtLevelParams): Promise<DuckySessionStateSnapshot>;
  setMode(params: DuckySessionSetModeParams): Promise<DuckySessionStateSnapshot>;
  // renderer 订阅面走 agentService 的 conversation/sessions-index 帧通道。
}

export const IDuckySessionService = createServiceDescriptor<IDuckySessionService>(
  ServiceChannels.DuckySession,
);
