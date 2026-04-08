// Singleton mock using global to survive jest.resetModules()
if (!global.__axiosMock__) {
  global.__axiosMock__ = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn()
  };
}
module.exports = global.__axiosMock__;
