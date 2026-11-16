import type { ExposureDetail } from '@core/models';
import { EXPOSURES } from '../../test/fixtures/exposures';
import {
  addGroup,
  draftFrom,
  groupOf,
  isDirty,
  moveService,
  moveToNewGroup,
  removeGroup,
  saveBlocker,
  toRequest
} from './grouping-draft';

const [payroll] = EXPOSURES;
const byHost = (e: ExposureDetail, host: string, port = 443) =>
  e.services.find((s) => s.host === host && s.port === port)!.id;

describe('grouping draft', () => {
  const api = byHost(payroll, 'api.payroll.corp.internal');
  const reports = byHost(payroll, 'reports.corp.internal');

  it('starts from the saved grouping, unchanged', () => {
    const d = draftFrom(payroll);
    expect(d.groups.map((g) => g.serviceIds)).toEqual(payroll.groups.map((g) => g.service_ids));
    expect(d.ungrouped).toEqual([]);
    expect(isDirty(d, payroll)).toBe(false);
  });

  it('moves a service between groups, and out of every group', () => {
    const d0 = draftFrom(payroll);
    const [first, second] = d0.groups;
    const d1 = moveService(d0, api, second.key, 0);
    expect(groupOf(d1, api)).toBe(second.key);
    expect(d1.groups[1].serviceIds[0]).toBe(api);
    expect(isDirty(d1, payroll)).toBe(true);

    const d2 = moveService(d1, api, null);
    expect(groupOf(d2, api)).toBeNull();
    expect(d2.ungrouped).toEqual([api]);
    expect(saveBlocker(d2)).toMatch(/not in a group/);
    expect(d2.groups[0].key).toBe(first.key);
  });

  it('moves a service back where it was without counting as a change', () => {
    const d0 = draftFrom(payroll);
    const home = groupOf(d0, reports)!;
    const away = moveService(d0, reports, d0.groups[0].key);
    expect(isDirty(moveService(away, reports, home), payroll)).toBe(false);
  });

  it('makes a new group, and saves it without an id', () => {
    const d = moveToNewGroup(draftFrom(payroll), reports);
    const fresh = d.groups[d.groups.length - 1];
    expect(fresh.id).toBeNull();
    expect(fresh.serviceIds).toEqual([reports]);
    const body = toRequest(d);
    expect(body.version).toBe(payroll.version);
    expect(body.groups[body.groups.length - 1]).toEqual({ service_ids: [reports] });
    expect(body.groups[0]).toHaveProperty('id', payroll.groups[0].id);
  });

  it('drops empty groups from the save and removes only empty ones', () => {
    const { draft, key } = addGroup(draftFrom(payroll));
    expect(toRequest(draft).groups).toHaveLength(payroll.groups.length);
    expect(isDirty(draft, payroll)).toBe(false);
    expect(removeGroup(draft, key).groups).toHaveLength(payroll.groups.length);
    expect(removeGroup(draft, draft.groups[0].key).groups).toHaveLength(draft.groups.length);
  });

  it('ignores a move to a group that does not exist', () => {
    const d = draftFrom(payroll);
    expect(moveService(d, api, 'nope')).toBe(d);
  });
});
