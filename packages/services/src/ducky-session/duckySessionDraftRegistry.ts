import type { DuckySessionStateSnapshot } from "@ducky/shared";
import type {
  DuckySessionWorkspaceTarget,
  DuckyTaskTarget,
} from "#src/ducky-session/duckySession.js";

function getWorkspaceKey(target: DuckySessionWorkspaceTarget): string {
  return target.workspaceIdentity?.trim() || target.workspacePath;
}

function getSessionScopedKey(target: DuckyTaskTarget): string {
  return `${getWorkspaceKey(target)}\0${target.sessionId}`;
}

export function createDuckyDeferredDraftRegistry() {
  const sessionKeys = new Set<string>();

  return {
    remember(params: DuckySessionWorkspaceTarget, snapshot: DuckySessionStateSnapshot): void {
      sessionKeys.add(
        getSessionScopedKey({
          workspacePath: snapshot.session.workspace.workspacePath,
          workspaceIdentity:
            snapshot.session.workspace.workspaceIdentity ?? params.workspaceIdentity,
          sessionId: snapshot.session.sessionId,
        }),
      );
    },

    has(target: DuckyTaskTarget): boolean {
      return sessionKeys.has(getSessionScopedKey(target));
    },

    forget(target: DuckyTaskTarget): void {
      sessionKeys.delete(getSessionScopedKey(target));
    },
  };
}
