// Explicitly injected only by unrelated HTTP tests. Production never imports
// this fixture; the real login and access controls have their own HTTP suite.
export const fixtureSessionHeaders = Object.freeze({ 'X-Test-Session': 'admin-fixture' });

export function adminAuthFixture({ requireHeader = false } = {}) {
  const session = Object.freeze({
    user: Object.freeze({ id: 'fixture-admin', name: 'Administrador de teste', role: 'admin' }),
    csrfToken: 'fixture-csrf-token',
    tokenHash: 'fixture-session-hash',
  });
  return {
    async getSession(request) {
      return !requireHeader || request.headers['x-test-session'] === fixtureSessionHeaders['X-Test-Session']
        ? session : null;
    },
    assertMutation() {},
    async login() { throw new Error('Use the real auth service to test login.'); },
    async logout() { throw new Error('Use the real auth service to test logout.'); },
  };
}
