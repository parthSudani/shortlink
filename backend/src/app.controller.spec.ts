import { AuthController, LinksController } from './app.controller';
describe('controllers', () => {
  it('passes normalized registration inputs to the auth service boundary', async () => {
    const service: any = { register: jest.fn().mockResolvedValue({ user: { id: 'u', email: 'a@b.co' }, accessToken: 'jwt' }) };
    const result = await new AuthController(service).register({ email: 'A@b.co', password: 'long-password' } as any);
    expect(service.register).toHaveBeenCalledWith('A@b.co', 'long-password'); expect(result.accessToken).toBe('jwt');
  });
  it('returns 404 semantics for links not owned by the current user', async () => {
    const service: any = { ownedLink: jest.fn().mockResolvedValue(null) };
    await expect(new LinksController(service).get({ user: { sub: 'owner-a' } } as any, 'link-b')).rejects.toThrow('NOT_FOUND');
    expect(service.ownedLink).toHaveBeenCalledWith('link-b', 'owner-a');
  });
  it('uses only the authenticated owner when listing links', async () => {
    const service: any = { listLinks: jest.fn().mockResolvedValue({ items: [] }) };
    await new LinksController(service).list({ user: { sub: 'owner-a' } } as any);
    expect(service.listLinks).toHaveBeenCalledWith('owner-a', 0, 20, 'createdAt');
  });
});
