import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import briefRoutes from '../src/modules/brief/routes.js';
import type { Container } from '../src/platform/container.js';

/**
 * Hermetic proof of the production route config. `buildApp` registers
 * `@fastify/rate-limit` only outside NODE_ENV=test, so the 429 can't be seen
 * through it; this builds a bare Fastify with the real brief routes, the
 * plugin (`global:false`, so only the route-level `config.rateLimit` applies)
 * and a counting fake service. No DB.
 */
const PR_ID = '11111111-1111-4111-8111-111111111111';
const RESPONSE = { brief: null, stale: false };

async function build() {
  const calls = { generate: 0, get: 0 };
  const fake = {
    auth: {
      currentUser: async () => ({ id: 'u-1' }),
      currentWorkspace: async () => ({ id: 'ws-1' }),
    },
    briefService: {
      get: async () => {
        calls.get += 1;
        return RESPONSE;
      },
      generate: async (_ws: string, _id: string, opts: { onFinish?: (l: unknown) => void }) => {
        calls.generate += 1;
        opts.onFinish?.({ outcome: 'ok' });
        return RESPONSE;
      },
    },
  } as unknown as Container;

  const app = Fastify();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(rateLimit, { global: false });
  app.decorate('container', fake);
  await app.register(briefRoutes);
  await app.ready();
  return { app, calls };
}

describe('brief routes (bare Fastify)', () => {
  it('rate limits POST at 10/min without an extra service call, and leaves GET unlimited', async () => {
    const { app, calls } = await build();
    for (let i = 0; i < 10; i++) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${PR_ID}/brief` });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(RESPONSE);
    }
    const eleventh = await app.inject({ method: 'POST', url: `/pulls/${PR_ID}/brief` });
    expect(eleventh.statusCode).toBe(429);
    expect(calls.generate).toBe(10);

    for (let i = 0; i < 15; i++) {
      const res = await app.inject({ method: 'GET', url: `/pulls/${PR_ID}/brief` });
      expect(res.statusCode).toBe(200);
    }
    expect(calls.get).toBe(15);
    await app.close();
  });

  it('rejects a non-uuid id before the handler runs', async () => {
    const { app, calls } = await build();
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/brief' });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(calls.get).toBe(0);
    await app.close();
  });
});
