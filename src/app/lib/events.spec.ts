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

  it('says where a deployed app is live, and what its deploy registered', () => {
    expect(describeEvent(event('exposure_deployed', { public_url: 'https://payroll.example.com' })).text).toBe(
      'Deployed; the app is live at https://payroll.example.com'
    );
    const registered = describeEvent(event('origins_registered', {
      registered: [{ origin: 'https://a', url: 'https://a.example.com' }],
      already_registered: [{ origin: 'https://b', url: null }]
    }));
    expect(registered.text).toBe('Registered 1 origin as published; 1 already were, by someone else');
  });

  it('names the origins another deploy took out of the grouping, and that deploy', () => {
    const d = describeEvent(event('grouping_pruned', { origins: ['https://a'], by: 'exp_other', from_status: 'awaiting_confirmation' }));
    expect(d.text).toBe('https://a left the grouping, and the plan was dropped, published by');
    expect(d.link?.exposureId).toBe('exp_other');
  });

  it('reads a type it does not know as its name', () => {
    expect(describeEvent(event('ip_reserved')).text).toBe('Ip reserved');
  });
});
