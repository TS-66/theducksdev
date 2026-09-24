import type { WorkspacePurpose, DuckyTaskMeta } from "@ducky/shared";

export type DuckyTaskListKind = "pinned" | "archived" | "timeline" | "active";
export type DuckyTaskListSortBy = "created" | "updated";

export interface DuckyTaskListWorkspaceScope {
  workspacePath: string;
  workspaceIdentity?: string;
  workspacePurpose?: WorkspacePurpose;
}

export interface DuckyTaskListQuery {
  kind: DuckyTaskListKind;
  workspaceScopes: DuckyTaskListWorkspaceScope[];
  sortBy: DuckyTaskListSortBy;
  search?: string;
  limit?: number;
}

export type DuckyTaskListItem = DuckyTaskMeta & {
  searchSnippet?: string;
  searchSnippets?: string[];
};

export interface DuckyTaskListResult {
  items: DuckyTaskListItem[];
  total: number;
  hasMore: boolean;
}

export type DuckyTaskGroupColor =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

export interface DuckyTaskGroup {
  id: string;
  title: string;
  color: DuckyTaskGroupColor;
  createdAt: number;
  updatedAt: number;
}

export interface DuckyGroupedTaskRef {
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}

export type DuckyGroupedTaskViewTopLevelNodeRef =
  | { type: "group"; groupId: string }
  | { type: "task"; task: DuckyGroupedTaskRef };

export type DuckyGroupedTaskViewNode =
  | {
      type: "group";
      group: DuckyTaskGroup;
      tasks: DuckyTaskListItem[];
      sortOrder?: number;
    }
  | {
      type: "task";
      task: DuckyTaskListItem;
      sortOrder?: number;
    };

export interface DuckyGroupedTaskView {
  nodes: DuckyGroupedTaskViewNode[];
}

export interface DuckyGroupedTaskViewQuery {
  workspaceScopes: DuckyTaskListWorkspaceScope[];
  includeAllWorkspaces?: boolean;
}

// ── grouped 原始结构（不 join tasks 表）──
// grouped 视图的任务数据源迁到 sessions-index 后，服务端只提供分组结构
// （task_groups / task_group_members / task_group_view_node_orders），
// 由客户端与 sessions-index 会话做 join。

/** 组成员引用（不含任务 meta；task 内容由 sessions-index 提供）。 */
export interface DuckyGroupedTaskViewStructureMember {
  groupId: string;
  /** 服务端口径 workspaceKey（resolveWorkspaceKey：identity ?? path），join 匹配键。 */
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
  /** null = 尚未落 sort_order（新加入组）；客户端按 addedAt 降序补内存序。 */
  sortOrder: number | null;
  addedAt: number;
}

/** 顶层节点排序（task_group_view_node_orders，node_key 已解析为结构化引用）。 */
export type DuckyGroupedTaskViewStructureTopOrder =
  | { type: "group"; groupId: string; sortOrder: number }
  | { type: "task"; workspaceKey: string; taskId: string; sortOrder: number };

export interface DuckyGroupedTaskViewStructure {
  /** 已按 workspaceScopes 可见性过滤的 group（bootstrap workspace group 只在其 workspace 可见）。 */
  groups: DuckyTaskGroup[];
  /** 全量组成员（含不可见 group 的成员——顶层排除规则需要全量判断）。 */
  members: DuckyGroupedTaskViewStructureMember[];
  topLevelOrders: DuckyGroupedTaskViewStructureTopOrder[];
}

export interface DuckyGroupedTaskViewOrderInput {
  workspaceScopes: DuckyTaskListWorkspaceScope[];
  topLevelNodes: DuckyGroupedTaskViewTopLevelNodeRef[];
  groups: Array<{
    groupId: string;
    taskRefs: DuckyGroupedTaskRef[];
  }>;
}

export interface DuckyWorkspaceEventSubscriptionParams {
  workspacePath: string;
  workspaceIdentity?: string;
}
