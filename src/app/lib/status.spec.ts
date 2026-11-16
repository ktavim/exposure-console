import { STATUS } from './status';

describe('STATUS', () => {
  it('gives every status its own label and an icon', () => {
    const labels = Object.values(STATUS).map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(Object.values(STATUS).every((s) => s.icon)).toBe(true);
  });
});
