import { validateDestination } from './links/domain/url-validation';
describe('validateDestination', () => {
  it('accepts a public HTTP URL', async () => await expect(validateDestination('https://example.com/a')).resolves.toContain('example.com'));
  it.each(['ftp://example.com','http://user:pass@example.com','http://127.0.0.1','http://[::1]','http://localhost'])('rejects %s', async url => await expect(validateDestination(url)).rejects.toThrow());
  it('rejects private IPv4 destinations', async () => await expect(validateDestination('http://192.168.1.4')).rejects.toThrow());
  it('rejects malformed and encoded unsafe destinations', async () => { await expect(validateDestination('not a url')).rejects.toThrow(); await expect(validateDestination('http://127.0.0.1%2e')).rejects.toThrow(); });
});
