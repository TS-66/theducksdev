import type { DuckySessionStateSnapshot } from "@ducky/shared";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import { repairImportedClaudeSessionSnapshot } from "#src/session/claude-native/importedClaudeHistoryRepair.js";
import type { IDuckyAgentService } from "#src/ducky-agent/duckyAgent.js";
import type {
  DuckySessionReadParams,
  DuckySessionResumeParams,
} from "#src/ducky-session/duckySession.js";

const logger = createServiceLogger("ducky-session-service");

export async function repairEmptyImportedClaudeSessionSnapshot(params: {
  agentService: IDuckyAgentService;
  snapshot: DuckySessionStateSnapshot;
  target: DuckySessionResumeParams | DuckySessionReadParams;
}): Promise<DuckySessionStateSnapshot> {
  const repaired = await repairImportedClaudeSessionSnapshot({
    snapshot: params.snapshot,
    target: {
      workspacePath: params.target.workspacePath,
      workspaceIdentity: params.target.workspaceIdentity,
      taskId: params.target.sessionId,
      ...("mcpServers" in params.target && params.target.mcpServers
        ? { mcpServers: params.target.mcpServers }
        : {}),
    },
    createSession: (input) => params.agentService.createSession(input),
    onRepair: (history) => {
      logger.warn(
        undefined,
        `[ducky-session-service] Claude 导入 session 历史异常，按 ${history.source} 回填 taskId=${params.target.sessionId}`,
      );
    },
  });
  return repaired ?? params.snapshot;
}
