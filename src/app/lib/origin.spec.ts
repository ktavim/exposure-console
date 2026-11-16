import { formatOrigin } from './origin';

describe('formatOrigin', () => {
  it.each([
    [{ scheme: 'https', host: 'a.example', port: 443 }, 'https://a.example'],
    [{ scheme: 'http', host: 'a.example', port: 80 }, 'http://a.example'],
    [{ scheme: 'https', host: 'a.example', port: 8443 }, 'https://a.example:8443'],
    [{ scheme: 'http', host: 'a.example', port: 443 }, 'http://a.example:443'],
    [{ scheme: 'https', host: '::1', port: 443 }, 'https://[::1]']
  ])('%o is %s', (origin, text) => {
    expect(formatOrigin(origin)).toBe(text);
  });
});
