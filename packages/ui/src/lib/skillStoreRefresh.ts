import type { ISkillsService } from "@ducky/services";
import {
  normalizeAgentProviderToDuckyAgent,
  DUCKY_AGENT_PROVIDER,
  type DuckyProvider,
} from "@ducky/shared";
import { useSkillStore } from "@/store/skillStore.js";

export async function refreshSharedSkillStoreForWorkspace(params: {
  workspacePath: string | null | undefined;
  workspaceIdentity?: string | null;
  skillsService: ISkillsService;
  provider?: DuckyProvider;
}): Promise<void> {
  const workspacePath = params.workspacePath;
  if (!workspacePath) {
    return;
  }
  const skillStore = useSkillStore.getState();
  const normalizedWorkspaceIdentity = params.workspaceIdentity?.trim() || null;
  const normalizedProvider = normalizeAgentProviderToDuckyAgent(
    params.provider ?? DUCKY_AGENT_PROVIDER,
  );
  const refreshes: Promise<void>[] = [];

  if (
    skillStore.workspacePath === workspacePath &&
    skillStore.workspaceIdentity === normalizedWorkspaceIdentity &&
    skillStore.loadedWorkspacePath === workspacePath &&
    skillStore.loadedWorkspaceIdentity === normalizedWorkspaceIdentity &&
    normalizeAgentProviderToDuckyAgent(skillStore.provider) === normalizedProvider &&
    skillStore.loadedProvider === normalizedProvider
  ) {
    refreshes.push(
      skillStore.refresh(params.skillsService, normalizedWorkspaceIdentity ?? undefined),
    );
  }

  await Promise.all(refreshes);
}
