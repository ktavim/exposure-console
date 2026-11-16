import type { ExposureEvent } from '@core/models';
import { describeEvent } from './events';

const event = (type: string, payload: Record<string, unknown> = {}): ExposureEvent => ({
  exposure_id: 'exp_1', seq: '0', ts: 0, type, actor: 'jchen', payload
});

describe('describeEvent', () => {
  it('names the scan and the exposure a creation replaces', () => {
    const d = describeEvent(event('exposure_created', { scan_id: 'b3f0c2a9e1d84c6f', supersedes: 'exp_old' }));
    expect(d.text).toBe('Submitted scan b3f0c2a9; exposure created');
    expect(d.link).toEqual({ prefix: 'replacing', exposureId: 'exp_old' });
  });

  it('links a superseded exposure to the one that replaced it', () => {
    expect(describeEvent(event('exposure_superseded', { by: 'exp_new' })).link?.exposureId).toBe('exp_new');
  });

  it('reads a type it does not know as its name', () => {
    expect(describeEvent(event('ip_reserved')).text).toBe('Ip reserved');
  });
});
