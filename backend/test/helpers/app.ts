import type { FastifyInstance } from 'fastify';

let app: FastifyInstance | null = null;

export async function createTestApp(): Promise<FastifyInstance> {
  if (!app) {
    const mod = await import('../../src/index.js');
    app = mod.app;
    await app.ready();
  }
  return app;
}

export async function closeTestApp() {
  if (app) {
    await app.close();
    app = null;
  }
}
