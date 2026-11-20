import type { ExposureDetail } from '@core/models';

/**
 * The grouping an admin is editing, before it is saved: pure functions over
 * an immutable value, so the workspace can keep it in a signal and the rules
 * can be tested on their own.
 */
export interface DraftGroup {
  /** Stable while editing: the saved group's id, or a local one for a new group. */
  key: string;
  /** The saved group's id, kept on save; null for a group added since. */
  id: string | null;
  serviceIds: string[];
}

export interface GroupingDraft {
  /** The version the draft was made from; a save names it. */
  baseVersion: number;
  groups: DraftGroup[];
  /** Services that need a VIP and are in no group. */
  ungrouped: string[];
}

let localKeys = 0;
const newKey = () => `new-${++localKeys}`;

/** The exposure's saved grouping, as a draft. */
export function draftFrom(e: ExposureDetail): GroupingDraft {
  const grouped = new Set(e.groups.flatMap((g) => g.service_ids));
  return {
    baseVersion: e.version,
    groups: e.groups.map((g) => ({ key: g.id, id: g.id, serviceIds: [...g.service_ids] })),
    ungrouped: e.services.filter((s) => s.scope === 'needs_vip' && !grouped.has(s.id)).map((s) => s.id)
  };
}

/** The key of the group a service is in, or null when it is in none. */
export function groupOf(d: GroupingDraft, serviceId: string): string | null {
  return d.groups.find((g) => g.serviceIds.includes(serviceId))?.key ?? null;
}

/**
 * Move a service into the group with key `to`, or out of every group when
 * `to` is null, at `index` or at the end. Unknown keys leave the draft as it is.
 */
export function moveService(d: GroupingDraft, serviceId: string, to: string | null, index?: number): GroupingDraft {
  if (to !== null && !d.groups.some((g) => g.key === to)) return d;
  const without = (ids: string[]) => ids.filter((id) => id !== serviceId);
  const insert = (ids: string[]) => {
    const at = index === undefined ? ids.length : Math.max(0, Math.min(index, ids.length));
    return [...ids.slice(0, at), serviceId, ...ids.slice(at)];
  };
  return {
    ...d,
    groups: d.groups.map((g) => ({
      ...g,
      serviceIds: g.key === to ? insert(without(g.serviceIds)) : without(g.serviceIds)
    })),
    ungrouped: to === null ? insert(without(d.ungrouped)) : without(d.ungrouped)
  };
}

/** Add an empty group at the end; returns the draft and the new group's key. */
export function addGroup(d: GroupingDraft): { draft: GroupingDraft; key: string } {
  const key = newKey();
  return { draft: { ...d, groups: [...d.groups, { key, id: null, serviceIds: [] }] }, key };
}

/** Move a service into a new group of its own. */
export function moveToNewGroup(d: GroupingDraft, serviceId: string): GroupingDraft {
  const { draft, key } = addGroup(d);
  return moveService(draft, serviceId, key);
}

/** Remove an empty group; a group with services stays. */
export function removeGroup(d: GroupingDraft, key: string): GroupingDraft {
  return { ...d, groups: d.groups.filter((g) => g.key !== key || g.serviceIds.length > 0) };
}

/** Whether saving the draft would change the saved grouping. Empty groups are not saved, so they do not count. */
export function isDirty(d: GroupingDraft, e: ExposureDetail): boolean {
  const shape = (groups: string[][]) => JSON.stringify(groups.filter((g) => g.length).map((g) => [...g].sort()));
  return shape(d.groups.map((g) => g.serviceIds)) !== shape(e.groups.map((g) => g.service_ids));
}

/** What keeps the draft from being saved, or null when it can be. */
export function saveBlocker(d: GroupingDraft): string | null {
  if (d.ungrouped.length === 0) return null;
  return d.ungrouped.length === 1
    ? 'Put the service that is not in a group into one to save.'
    : `Put the ${d.ungrouped.length} services that are not in a group into one to save.`;
}

/** The body of PUT /exposures/{id}/groups. */
export function toRequest(d: GroupingDraft) {
  return {
    version: d.baseVersion,
    groups: d.groups
      .filter((g) => g.serviceIds.length)
      .map((g) => (g.id ? { id: g.id, service_ids: g.serviceIds } : { service_ids: g.serviceIds }))
  };
}
