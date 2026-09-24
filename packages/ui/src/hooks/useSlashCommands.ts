/**
 * Ducky Agent Slash Commands 便捷 hook
 *
 * 返回当前 workspace 下 Agent 广播的可用 slash commands 列表。
 */
import { useDuckySessionStore, selectWorkspaceDuckyState } from "../store/duckySessionStore.js";

export function useSlashCommands(workspacePath: string, workspaceIdentity?: string) {
  return useDuckySessionStore(
    (state) => selectWorkspaceDuckyState(state, workspacePath, workspaceIdentity).slashCommands,
  );
}
