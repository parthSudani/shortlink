import { AuthController, LinksController, RedirectController } from './app.controller';
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

  it.each([
    ['-1', '20', 'createdAt'], ['0.5', '20', 'createdAt'], ['0', '0', 'createdAt'], ['0', '101', 'createdAt'], ['0', '20', 'random'],
  ])('rejects invalid pagination (%s, %s, %s)', async (page, size, sort) => {
    const service: any = { listLinks: jest.fn() };
    expect(() => new LinksController(service).list({ user: { sub: 'owner' } } as any, page, size, sort)).toThrow('INVALID_PAGINATION');
    expect(service.listLinks).not.toHaveBeenCalled();
  });

  it.each([['unknown', '30', '10'], ['clicks', '0', '10'], ['clicks', '91', '10'], ['devices', '30.5', '10'], ['devices', '30', '51']])
    ('rejects invalid analytics query (%s, %s, %s)', async (kind, days, limit) => {
      const service: any = { analytics: jest.fn() };
      await expect(new LinksController(service).analytics({ user: { sub: 'owner' } } as any, 'link', kind, days, limit)).rejects.toThrow('INVALID_ANALYTICS_QUERY');
      expect(service.analytics).not.toHaveBeenCalled();
    });

  it('allows summary without a days parameter and applies the top-referrer limit', async () => {
    const service: any = { analytics: jest.fn().mockResolvedValue({ totalClicks: 1 }) };
    await new LinksController(service).analytics({ user: { sub: 'owner' } } as any, 'link', 'summary', '0', '5');
    expect(service.analytics).toHaveBeenCalledWith('link', 'owner', 'summary', 0, 5);
  });

  it('returns 404 semantics when analytics or deletion targets are not owned', async () => {
    const service: any = { analytics: jest.fn().mockResolvedValue(null), deleteLink: jest.fn().mockResolvedValue(false) };
    const controller = new LinksController(service);
    const request: any = { user: { sub: 'owner' } };
    await expect(controller.analytics(request, 'foreign-link', 'summary')).rejects.toThrow('NOT_FOUND');
    await expect(controller.remove(request, 'foreign-link')).rejects.toThrow('NOT_FOUND');
    expect(service.analytics).toHaveBeenCalledWith('foreign-link', 'owner', 'summary', 30, 10);
    expect(service.deleteLink).toHaveBeenCalledWith('foreign-link', 'owner');
  });

  it('rejects malformed redirect codes and returns 302 for a valid destination', async () => {
    const service: any = { redirect: jest.fn().mockResolvedValue({ status: 302, destinationUrl: 'https://example.com' }) };
    const controller = new RedirectController(service);
    const res: any = { status: jest.fn().mockReturnThis(), end: jest.fn(), redirect: jest.fn() };
    await controller.redirect('../unsafe', {}, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(service.redirect).not.toHaveBeenCalled();
    await controller.redirect('valid_123', {}, res);
    expect(service.redirect).toHaveBeenCalledWith('valid_123', {});
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://example.com');
  });

  it.each([[404, 'NOT_FOUND'], [410, 'LINK_EXPIRED']])('returns clean %s redirect errors', async (status, code) => {
    const service: any = { redirect: jest.fn().mockResolvedValue({ status }) };
    const controller = new RedirectController(service);
    const res: any = { status: jest.fn().mockReturnThis(), end: jest.fn(), json: jest.fn() };
    await controller.redirect('valid123', {}, res);
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ statusCode: status, code }));
  });
});
