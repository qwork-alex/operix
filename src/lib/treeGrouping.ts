/**
 * Tree grouping helper — YEAR → WORKSPACE → USER → GROUP/LIST
 *
 * Used by OS/OP tree views to render a stable hierarchy when records
 * span multiple workspaces (the user sees their own records cross-ws,
 * each workspace still sees only its own scope thanks to RLS).
 */

export interface TreeRecord {
  id: string;
  year_reference?: number | null;
  created_at?: string | null;
  workspace_id?: string | null;
  user_id?: string | null;
  created_by?: string | null;
  group_id?: string | null;
  list_id?: string | null;
  [key: string]: any;
}

export interface TreeLabels {
  workspaceName?: (id: string | null) => string;
  userName?: (id: string | null) => string;
  groupName?: (id: string | null) => string;
}

export interface TreeNode<T = TreeRecord> {
  key: string;
  label: string;
  count: number;
  children?: TreeNode<T>[];
  items?: T[];
}

function yearOf(r: TreeRecord): number {
  if (r.year_reference) return r.year_reference;
  if (r.created_at) return new Date(r.created_at).getFullYear();
  return new Date().getFullYear();
}

/**
 * Group records into a 4-level tree:
 *   year → workspace → user (creator) → group/list (leaf items)
 */
export function groupByYearWorkspaceUser<T extends TreeRecord>(
  records: T[],
  labels: TreeLabels = {},
): TreeNode<T>[] {
  const wsName = labels.workspaceName ?? ((id) => id?.slice(0, 6) ?? "—");
  const usrName = labels.userName ?? ((id) => id?.slice(0, 6) ?? "—");
  const grpName = labels.groupName ?? ((id) => id ?? "—");

  const yearMap = new Map<number, Map<string, Map<string, Map<string, T[]>>>>();

  for (const r of records) {
    const y = yearOf(r);
    const ws = r.workspace_id ?? "_no_ws";
    const usr = r.user_id ?? r.created_by ?? "_no_user";
    const grp = r.group_id ?? r.list_id ?? "_root";

    if (!yearMap.has(y)) yearMap.set(y, new Map());
    const wsMap = yearMap.get(y)!;
    if (!wsMap.has(ws)) wsMap.set(ws, new Map());
    const userMap = wsMap.get(ws)!;
    if (!userMap.has(usr)) userMap.set(usr, new Map());
    const groupMap = userMap.get(usr)!;
    if (!groupMap.has(grp)) groupMap.set(grp, []);
    groupMap.get(grp)!.push(r);
  }

  const years = Array.from(yearMap.keys()).sort((a, b) => b - a);

  return years.map<TreeNode<T>>((y) => {
    const wsMap = yearMap.get(y)!;
    const wsNodes: TreeNode<T>[] = Array.from(wsMap.entries()).map(
      ([wsId, userMap]) => {
        const userNodes: TreeNode<T>[] = Array.from(userMap.entries()).map(
          ([usrId, groupMap]) => {
            const groupNodes: TreeNode<T>[] = Array.from(groupMap.entries()).map(
              ([grpId, items]) => ({
                key: `${y}/${wsId}/${usrId}/${grpId}`,
                label: grpId === "_root" ? "—" : grpName(grpId),
                count: items.length,
                items,
              }),
            );
            return {
              key: `${y}/${wsId}/${usrId}`,
              label: usrId === "_no_user" ? "—" : usrName(usrId),
              count: groupNodes.reduce((s, n) => s + n.count, 0),
              children: groupNodes,
            };
          },
        );
        return {
          key: `${y}/${wsId}`,
          label: wsId === "_no_ws" ? "—" : wsName(wsId),
          count: userNodes.reduce((s, n) => s + n.count, 0),
          children: userNodes,
        };
      },
    );
    return {
      key: `${y}`,
      label: String(y),
      count: wsNodes.reduce((s, n) => s + n.count, 0),
      children: wsNodes,
    };
  });
}
