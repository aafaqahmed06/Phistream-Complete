import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import { CONTACT_LIMITS } from '../../src/modules/leads/contact.schemas.js';
import { createContactService } from '../../src/modules/leads/contact.service.js';
import type { LeadsRepository } from '../../src/modules/leads/leads.repository.js';
import { createPublicFormSpamGuard } from '../../src/shared/anti-spam/checks.js';
import type { HumanVerifier } from '../../src/shared/anti-spam/human-verifier.js';
import { createFakeLeadsRepository } from '../helpers/fake-leads.js';
import { buildTestApp, createLogCollector, testConfig } from '../helpers/test-app.js';

const URL = '/api/v1/contact';

/** Distinctive values so log output can be searched for leaks. */
const PII = {
  name: 'Zelda Quixotic-Marker',
  email: 'zelda.marker@example.com',
  phone: '+1 555 0187',
  companyName: 'Marker Holdings Unique',
  message: 'Confidential-marker message body about our revenue.',
};

const validBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'Jane Doe',
  email: 'jane@example.com',
  message: 'I would like to discuss a project.',
  ...overrides,
});

interface Envelope {
  error: { code: string; details?: { path?: string; location?: string; message: string }[] };
}

interface AppOptions {
  env?: Record<string, string>;
  repository?: LeadsRepository;
  humanVerifier?: HumanVerifier;
  logStream?: { write(message: string): void };
}

function contactApp(options: AppOptions = {}) {
  const fake = createFakeLeadsRepository();
  const silent = { info: () => undefined, warn: () => undefined };
  const service = createContactService({
    repository: options.repository ?? fake.repository,
    spamGuard: createPublicFormSpamGuard({ humanVerifier: options.humanVerifier, logger: silent }),
    logger: silent,
  });
  const appPromise = buildApp({
    config: testConfig(options.env),
    services: { contact: service },
    ...(options.logStream ? { logStream: options.logStream } : {}),
  });
  return { appPromise, ...fake };
}

describe('POST /api/v1/contact', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  const post = (payload: unknown, extra: { remoteAddress?: string } = {}) =>
    app.inject({ method: 'POST', url: URL, payload: payload as object, ...extra });

  describe('valid submission', () => {
    it('returns 202 with the generic body and records a normalized lead', async () => {
      const ctx = contactApp();
      app = await ctx.appPromise;

      const response = await post(
        validBody({
          email: '  Jane.Doe@Example.COM ',
          name: '  Jane Doe  ',
          phone: '+92 300 1234567',
          companyName: 'Example Co',
          source: ' Instagram ',
          campaign: 'BIO',
        }),
      );

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ data: { status: 'RECEIVED' } });
      expect(response.headers['cache-control']).toBe('no-store');
      expect(ctx.leads[0]).toMatchObject({
        email: 'jane.doe@example.com',
        fullName: 'Jane Doe',
        phone: '+92 300 1234567',
        companyName: 'Example Co',
        source: 'instagram',
        campaign: 'bio',
      });
      expect(ctx.events).toHaveLength(1);
    });

    it('accepts multi-line messages and treats blank optional fields as absent', async () => {
      const ctx = contactApp();
      app = await ctx.appPromise;

      const response = await post(
        validBody({
          message: 'Line one\r\nLine two\n\tindented',
          phone: '',
          companyName: '   ',
          source: '',
          campaign: '',
          honeypot: '',
        }),
      );

      expect(response.statusCode).toBe(202);
      expect(ctx.leads[0]).toMatchObject({ phone: null, companyName: null, source: null });
      expect(ctx.submissions[0]?.message).toBe('Line one\r\nLine two\n\tindented');
    });
  });

  describe('validation', () => {
    const expectInvalid = async (payload: unknown, path: string) => {
      const response = await post(payload);
      expect(response.statusCode).toBe(400);
      const body = response.json<Envelope>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.map((d) => d.path)).toContain(path);
      return response;
    };

    it.each([
      'not-an-email',
      'jane@',
      '@example.com',
      'jane doe@example.com',
      'jane@example',
      '',
      'jane@@example.com',
    ])('rejects invalid email %j', async (email) => {
      app = await contactApp().appPromise;
      await expectInvalid(validBody({ email }), '/email');
    });

    it('does not echo submitted values in validation errors', async () => {
      app = await contactApp().appPromise;
      const response = await expectInvalid(validBody({ email: 'secret-marker-value' }), '/email');
      expect(response.body).not.toContain('secret-marker-value');
    });

    it.each(['name', 'email', 'message'])('requires %s', async (field) => {
      app = await contactApp().appPromise;
      const body = Object.fromEntries(Object.entries(validBody()).filter(([key]) => key !== field));
      await expectInvalid(body, `/${field}`);
    });

    it.each(['name', 'message'])('rejects a whitespace-only %s', async (field) => {
      app = await contactApp().appPromise;
      await expectInvalid(validBody({ [field]: '   ' }), `/${field}`);
    });

    const over = (n: number) => 'a'.repeat(n + 1);
    it.each([
      ['name', over(CONTACT_LIMITS.fullName)],
      ['email', `${'a'.repeat(CONTACT_LIMITS.email)}@example.com`],
      ['phone', `+${'1'.repeat(CONTACT_LIMITS.phone)}`],
      ['companyName', over(CONTACT_LIMITS.companyName)],
      ['message', over(CONTACT_LIMITS.message)],
      ['source', over(CONTACT_LIMITS.attribution)],
      ['campaign', over(CONTACT_LIMITS.attribution)],
      ['honeypot', over(CONTACT_LIMITS.honeypot)],
      ['verificationToken', over(CONTACT_LIMITS.verificationToken)],
    ])('rejects oversized %s', async (field, value) => {
      const ctx = contactApp();
      app = await ctx.appPromise;
      await expectInvalid(validBody({ [field]: value }), `/${field}`);
      expect(ctx.leads).toEqual([]);
    });

    it('accepts fields exactly at their limits', async () => {
      app = await contactApp().appPromise;
      const response = await post(
        validBody({
          name: 'n'.repeat(CONTACT_LIMITS.fullName),
          companyName: 'c'.repeat(CONTACT_LIMITS.companyName),
          message: 'm'.repeat(CONTACT_LIMITS.message),
          source: 's'.repeat(CONTACT_LIMITS.attribution),
        }),
      );
      expect(response.statusCode).toBe(202);
    });

    it('rejects bodies over the route body limit with 413', async () => {
      app = await contactApp().appPromise;
      const response = await post(validBody({ message: 'x'.repeat(70 * 1024) }));

      expect(response.statusCode).toBe(413);
      expect(response.json<Envelope>().error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it.each([
      ['name', 'Jane\nBcc: victim@example.com'],
      ['name', 'Jane\u0000'],
      ['companyName', `Acme${String.fromCharCode(0x2028)}Corp`], // Unicode line separator
      ['message', 'hello\u0007'],
    ])('rejects control characters in %s', async (field, value) => {
      app = await contactApp().appPromise;
      await expectInvalid(validBody({ [field]: value }), `/${field}`);
    });

    it.each(['call me', '12', '+1 (555) abc', '-----'])(
      'rejects invalid phone %j',
      async (phone) => {
        app = await contactApp().appPromise;
        await expectInvalid(validBody({ phone }), '/phone');
      },
    );

    it.each(['<script>', '-leading-dash', 'utm/source'])(
      'rejects invalid source %j',
      async (source) => {
        app = await contactApp().appPromise;
        await expectInvalid(validBody({ source }), '/source');
      },
    );

    it('rejects unknown fields so client typos are not silently dropped', async () => {
      app = await contactApp().appPromise;
      const response = await post(validBody({ company: 'Acme' }));

      expect(response.statusCode).toBe(400);
      expect(response.json<Envelope>().error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a JSON array', []],
      ['a string', 'hello'],
    ])('rejects %s as the body', async (_, payload) => {
      app = await contactApp().appPromise;
      const response = await app.inject({
        method: 'POST',
        url: URL,
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify(payload),
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects form-encoded bodies with 415', async () => {
      app = await contactApp().appPromise;
      const response = await app.inject({
        method: 'POST',
        url: URL,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=Jane&email=jane%40example.com&message=hi',
      });
      expect(response.statusCode).toBe(415);
    });
  });

  describe('rate limiting', () => {
    const env = { CONTACT_RATE_LIMIT_MAX: '2', CONTACT_RATE_LIMIT_WINDOW_MS: '60000' };

    it('returns 429 RATE_LIMITED after the per-IP contact limit', async () => {
      app = await contactApp({ env }).appPromise;

      const first = await post(validBody({ message: 'one' }));
      await post(validBody({ message: 'two' }));
      const limited = await post(validBody({ message: 'three' }));

      expect(first.statusCode).toBe(202);
      expect(first.headers['x-ratelimit-limit']).toBe('2');
      expect(limited.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect(limited.json<Envelope>().error.code).toBe('RATE_LIMITED');
    });

    it('counts invalid submissions too', async () => {
      app = await contactApp({ env }).appPromise;

      await post({ email: 'bad' });
      await post({ email: 'bad' });
      expect((await post(validBody())).statusCode).toBe(429);
    });

    it('is tracked per client IP', async () => {
      app = await contactApp({ env }).appPromise;
      const from = (remoteAddress: string, message: string) =>
        post(validBody({ message }), { remoteAddress });

      await from('203.0.113.10', 'a');
      await from('203.0.113.10', 'b');
      expect((await from('203.0.113.10', 'c')).statusCode).toBe(429);
      expect((await from('203.0.113.11', 'd')).statusCode).toBe(202);
    });

    it('uses its own counter, separate from the global limit', async () => {
      const ctx = contactApp({
        env: { ...env, RATE_LIMIT_MAX: '100', RATE_LIMIT_WINDOW_MS: '60000' },
      });
      app = await ctx.appPromise;
      app.get('/test/other', () => ({ ok: true }));

      await post(validBody({ message: 'a' }));
      await post(validBody({ message: 'b' }));
      expect((await post(validBody({ message: 'c' }))).statusCode).toBe(429);
      expect((await app.inject('/test/other')).statusCode).toBe(200);
    });

    it('defaults to 5 requests per 10 minutes', () => {
      expect(testConfig().contact.rateLimit).toEqual({ max: 5, windowMs: 600_000 });
    });
  });

  describe('duplicate and non-enumeration behaviour', () => {
    /** Status, body and content headers that must not differ between outcomes. */
    const fingerprint = (response: Awaited<ReturnType<typeof post>>) => ({
      statusCode: response.statusCode,
      body: response.body,
      contentType: response.headers['content-type'],
      cacheControl: response.headers['cache-control'],
    });

    it('answers identically for new, known, duplicate, and spam submissions', async () => {
      const ctx = contactApp();
      app = await ctx.appPromise;
      const ip = (n: number) => ({ remoteAddress: `198.51.100.${n}` });

      const fresh = await post(validBody({ email: 'new@example.com', message: 'hi' }), ip(1));
      const known = await post(validBody({ email: 'new@example.com', message: 'again' }), ip(2));
      const duplicate = await post(
        validBody({ email: 'new@example.com', message: 'again' }),
        ip(3),
      );
      const spam = await post(validBody({ honeypot: 'http://spam.example' }), ip(4));

      const expected = fingerprint(fresh);
      expect(fingerprint(known)).toEqual(expected);
      expect(fingerprint(duplicate)).toEqual(expected);
      expect(fingerprint(spam)).toEqual(expected);

      // Only the two distinct messages were recorded, on a single lead.
      expect(ctx.leads).toHaveLength(1);
      expect(ctx.submissions.map((s) => s.message)).toEqual(['hi', 'again']);
      expect(ctx.events).toHaveLength(2);
    });

    it('treats differently-cased emails as the same lead', async () => {
      const ctx = contactApp();
      app = await ctx.appPromise;

      await post(validBody({ email: 'Case@Example.com', message: 'one' }));
      await post(validBody({ email: 'case@example.COM', message: 'two' }));

      expect(ctx.leads).toHaveLength(1);
      expect(ctx.submissions).toHaveLength(2);
    });

    it('silently discards link-stuffed messages', async () => {
      const ctx = contactApp();
      app = await ctx.appPromise;
      const links = Array.from({ length: 6 }, (_, i) => `https://spam${i}.example`).join(' ');

      const response = await post(validBody({ message: links }));
      expect(response.statusCode).toBe(202);
      expect(ctx.submissions).toEqual([]);
    });
  });

  describe('human verification', () => {
    const verifier = (success: boolean): HumanVerifier => ({
      provider: 'fake',
      verify: () => Promise.resolve({ success }),
    });

    it('returns 400 VERIFICATION_FAILED without a token when a provider is configured', async () => {
      const ctx = contactApp({ humanVerifier: verifier(true) });
      app = await ctx.appPromise;

      const response = await post(validBody());
      expect(response.statusCode).toBe(400);
      expect(response.json<Envelope>().error.code).toBe('VERIFICATION_FAILED');
      expect(ctx.leads).toEqual([]);
    });

    it('returns 400 VERIFICATION_FAILED for a rejected token', async () => {
      app = await contactApp({ humanVerifier: verifier(false) }).appPromise;
      const response = await post(validBody({ verificationToken: 'bad' }));
      expect(response.json<Envelope>().error.code).toBe('VERIFICATION_FAILED');
    });

    it('accepts a valid token', async () => {
      const ctx = contactApp({ humanVerifier: verifier(true) });
      app = await ctx.appPromise;

      expect((await post(validBody({ verificationToken: 'good' }))).statusCode).toBe(202);
      expect(ctx.leads).toHaveLength(1);
    });
  });

  describe('logging', () => {
    const expectNoPii = (logs: string) => {
      for (const value of Object.values(PII)) expect(logs).not.toContain(value);
      expect(logs).not.toContain('zelda');
    };

    it('never logs submitted values, even at trace level', async () => {
      const logs = createLogCollector();
      app = await contactApp({ env: { LOG_LEVEL: 'trace' }, logStream: logs.stream }).appPromise;

      expect((await post(PII)).statusCode).toBe(202);
      expect((await post({ ...PII, email: 'zelda-not-an-email' })).statusCode).toBe(400);
      expect((await post({ ...PII, message: 'm'.repeat(6000) })).statusCode).toBe(400);

      expect(logs.text).toContain('"statusCode":202'); // logging is actually on
      expectNoPii(logs.text);
    });

    it('does not leak submitted values when the database fails', async () => {
      const logs = createLogCollector();
      const failing: LeadsRepository = {
        withEmailLock: () =>
          Promise.reject(
            new DrizzleQueryError(
              'insert into "leads" ("email", "full_name") values ($1, $2)',
              [PII.email, PII.name],
              Object.assign(new Error('violates check constraint'), {
                code: '23514',
                detail: `Failing row contains (${PII.email}, ${PII.message}).`,
              }),
            ),
          ),
      };
      app = await contactApp({
        repository: failing,
        logStream: logs.stream,
        env: { LOG_LEVEL: 'info' },
      }).appPromise;

      const response = await post(PII);

      expect(response.statusCode).toBe(500);
      expect(response.json<Envelope>().error.code).toBe('INTERNAL_ERROR');
      expect(logs.text).toContain('Failed query: insert into'); // the error is still logged
      expect(logs.text).toContain('23514');
      expectNoPii(logs.text);
      expectNoPii(response.body);
    });
  });

  describe('wiring and OpenAPI', () => {
    it('is not registered without a database or service', async () => {
      app = await buildTestApp();
      expect((await post(validBody())).statusCode).toBe(404);
    });

    it('documents the operation, request, responses and tag', async () => {
      app = await contactApp().appPromise;
      await app.ready();
      const spec = app.swagger() as {
        paths: Record<string, { post?: Record<string, unknown> }>;
        tags?: { name: string }[];
        components?: { schemas?: Record<string, { properties?: Record<string, unknown> }> };
      };
      const operation = spec.paths['/api/v1/contact']?.post as {
        operationId?: string;
        tags?: string[];
        requestBody?: unknown;
        responses?: Record<string, unknown>;
      };

      expect(operation.operationId).toBe('submitContact');
      expect(operation.tags).toEqual(['contact']);
      expect(Object.keys(operation.responses ?? {})).toEqual(
        expect.arrayContaining(['202', '4XX', '5XX']),
      );
      expect(JSON.stringify(operation.requestBody)).toContain('ContactRequest');
      expect(spec.tags?.map((tag) => tag.name)).toContain('contact');

      const request = spec.components?.schemas?.ContactRequest;
      expect(Object.keys(request?.properties ?? {}).sort()).toEqual([
        'campaign',
        'companyName',
        'email',
        'honeypot',
        'message',
        'name',
        'phone',
        'source',
        'verificationToken',
      ]);
      expect(spec.components?.schemas).toHaveProperty('ContactAcceptedResponse');
    });
  });
});
