import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  FastifyInstance,
  FastifyBaseLogger,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify';
import { z } from 'zod';
import { getUserFromRequest, requireRole } from '../auth/session.js';
import { audit } from '../util/audit.js';
import { collectUserExport, enqueueEraseRequest } from '../repos/privacyRepo.js';
import { markEraseRequested, updatePrivacyConsent, getUserById } from '../repos/usersRepo.js';
import {
  incrementPrivacyEraseRequested,
  incrementPrivacyExport
} from '../metrics.js';

const policyPath = resolve(process.cwd(), 'docs', 'privacy_policy.md');
let cachedPolicyText: string | null = null;

function getPolicyText() {
  if (cachedPolicyText) return cachedPolicyText;
  try {
    cachedPolicyText = readFileSync(policyPath, 'utf8');
  } catch {
    cachedPolicyText = 'Integritetspolicy för SkolApp – uppdateras inom kort.';
  }
  return cachedPolicyText;
}

function getPolicyVersion() {
  const raw = Number(process.env.PRIVACY_POLICY_VERSION);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

type PrivacyRouteOptions = {
  exportRateLimit: number;
  eraseRateLimit: number;
};

type AnyFastify = FastifyInstance<any, any, any, any>;

export async function registerPrivacyRoutes(app: AnyFastify, options: PrivacyRouteOptions) {
  app.get('/privacy/policy', async () => ({
    version: getPolicyVersion(),
    text: getPolicyText()
  }));

  app.post('/privacy/consent', async (req, reply) => {
    const user = await getUserFromRequest(req);
    if (!user) {
      return reply.code(401).send({ error: 'Unauthenticated' });
    }
    const schema = z.object({ version: z.number().int().min(1) });
    const { version } = schema.parse(req.body ?? {});
    const updated = await updatePrivacyConsent(user.id, version);
    await audit('privacy_consent', { version }, user.id, user.id);
    return {
      ok: true,
      consent: {
        version: updated.privacy_consent_version,
        at: updated.privacy_consent_at
      }
    };
  });

  app.post(
    '/privacy/export',
    {
      config: {
        rateLimit: {
          max: options.exportRateLimit,
          timeWindow: '1 hour',
          hook: 'onRequest'
        }
      }
    },
    async (req, reply) => {
      const user = await getUserFromRequest(req);
      if (!user) {
        return reply.code(401).send({ error: 'Unauthenticated' });
      }
      const payload = await collectUserExport(user.id);
      const body = JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          userId: user.id,
          policyVersion: getPolicyVersion(),
          data: payload
        },
        null,
        2
      );
      const filename = `export-${user.id}-${Date.now()}.json`;
      reply.header('content-type', 'application/json');
      reply.header('content-disposition', `attachment; filename="${filename}"`);
      await audit('privacy_export', { size: Buffer.byteLength(body, 'utf8') }, user.id, user.id);
      incrementPrivacyExport();
      return body;
    }
  );

  app.post(
    '/privacy/erase',
    {
      config: {
        rateLimit: {
          max: options.eraseRateLimit,
          timeWindow: '1 hour',
          hook: 'onRequest'
        }
      }
    },
    async (req, reply) => {
      const user = await getUserFromRequest(req);
      if (!user) {
        return reply.code(401).send({ error: 'Unauthenticated' });
      }
      const entry = await enqueueEraseRequest(user.id, false);
      await markEraseRequested(user.id);
      await audit('privacy_erase_requested', { queueId: entry.id }, user.id, user.id);
      incrementPrivacyEraseRequested();
      return { ok: true, queueId: entry.id };
    }
  );

  app.post('/privacy/erase/force', async (req, reply) => {
    if (!(await requireRole(req, reply, ['admin']))) return;
    const schema = z.object({ userId: z.string().min(3) });
    const { userId } = schema.parse(req.body ?? {});
    const entry = await enqueueEraseRequest(userId, true);
    await markEraseRequested(userId);
    const actor = await getUserFromRequest(req);
    await audit('privacy_erase_forced', { queueId: entry.id }, actor?.id ?? null, userId);
    return { ok: true, queueId: entry.id };
  });

  app.get('/privacy/erase/status/:userId', async (req, reply) => {
    if (!(await requireRole(req, reply, ['admin']))) return;
    const { userId } = req.params as { userId: string };
    const user = await getUserById(userId);
    return {
      userId,
      eraseRequestedAt: user?.erase_requested_at ?? null,
      consentVersion: user?.privacy_consent_version ?? null,
      consentAt: user?.privacy_consent_at ?? null
    };
  });
}
