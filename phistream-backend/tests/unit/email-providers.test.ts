import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { EmailSendError, type SendEmailInput } from '../../src/providers/email/email-provider.js';
import { createEmailProvider } from '../../src/providers/email/index.js';
import { createLogEmailProvider } from '../../src/providers/email/log-provider.js';
import { createResendProvider } from '../../src/providers/email/resend.js';

const API_KEY = 're_test_secret_key_123';
const RECIPIENT = 'applicant.private@example.com';

const input = (overrides: Partial<SendEmailInput> = {}): SendEmailInput => ({
  from: 'Phistream Studio <hello@mail.example.com>',
  to: [RECIPIENT],
  replyTo: 'team@example.com',
  subject: 'Subject',
  html: '<p>Hi</p>',
  text: 'Hi',
  idempotencyKey: 'delivery-123',
  tags: { template: 'applicant.application_accepted' },
  ...overrides,
});

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

describe('Resend provider', () => {
  it('posts the message with auth, idempotency key, reply_to and sanitized tags', async () => {
    const fetch = vi.fn(() => json(200, { id: 'msg_abc' }));
    const provider = createResendProvider(
      { apiKey: API_KEY, apiBaseUrl: 'https://api.resend.com' },
      { fetch },
    );

    expect(await provider.send(input())).toEqual({ providerMessageId: 'msg_abc' });

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      authorization: `Bearer ${API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': 'delivery-123',
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Phistream Studio <hello@mail.example.com>',
      to: [RECIPIENT],
      subject: 'Subject',
      html: '<p>Hi</p>',
      text: 'Hi',
      reply_to: 'team@example.com',
      tags: [{ name: 'template', value: 'applicant_application_accepted' }],
    });
  });

  it('omits reply_to and tags when not given', async () => {
    const fetch = vi.fn(() => json(200, { id: 'msg_1' }));
    await createResendProvider(
      { apiKey: API_KEY, apiBaseUrl: 'https://api.resend.com' },
      { fetch },
    ).send(input({ replyTo: undefined, tags: undefined }));
    const body = JSON.parse(
      (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    ) as object;
    expect(body).not.toHaveProperty('reply_to');
    expect(body).not.toHaveProperty('tags');
  });

  it.each([
    [429, { name: 'rate_limit_exceeded' }, 'resend_429_rate_limit_exceeded', true],
    [500, { name: 'internal_server_error' }, 'resend_500_internal_server_error', true],
    [503, undefined, 'resend_503', true],
    [
      409,
      { name: 'concurrent_idempotent_requests' },
      'resend_409_concurrent_idempotent_requests',
      true,
    ],
    [422, { name: 'validation_error' }, 'resend_422_validation_error', false],
    [403, { name: 'validation_error' }, 'resend_403_validation_error', false],
    [401, { name: 'missing_api_key' }, 'resend_401_missing_api_key', false],
  ])('classifies HTTP %i as %s (retryable: %s)', async (status, body, code, retryable) => {
    const fetch = () => json(status, { ...body, message: `Invalid \`to\` field: ${RECIPIENT}` });
    const error = await createResendProvider(
      { apiKey: API_KEY, apiBaseUrl: 'https://api.resend.com' },
      { fetch },
    )
      .send(input())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(EmailSendError);
    expect(error).toMatchObject({ code, retryable });
    // Provider messages can echo addresses: they never reach our error.
    expect(String(error)).not.toContain(RECIPIENT);
    expect(JSON.stringify(error)).not.toContain(RECIPIENT);
  });

  it.each([
    ['network failure', () => Promise.reject(new TypeError('fetch failed')), 'resend_network'],
    [
      'timeout',
      () => Promise.reject(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
      'resend_timeout',
    ],
    ['unexpected success body', () => json(200, { ok: true }), 'resend_unexpected_response'],
  ])('treats a %s as retryable', async (_, fetch, code) => {
    await expect(
      createResendProvider(
        { apiKey: API_KEY, apiBaseUrl: 'https://api.resend.com' },
        { fetch },
      ).send(input()),
    ).rejects.toMatchObject({ code, retryable: true });
  });

  it('sanitizes odd error names from the provider', async () => {
    const fetch = () => json(400, { name: 'weird name!<script>' });
    await expect(
      createResendProvider(
        { apiKey: API_KEY, apiBaseUrl: 'https://api.resend.com' },
        { fetch },
      ).send(input()),
    ).rejects.toMatchObject({ code: 'resend_400_weird_name__script_' });
  });
});

describe('log provider', () => {
  it('captures messages, sends nothing, and honours idempotency keys', async () => {
    const provider = createLogEmailProvider();
    const first = await provider.send(input());
    const again = await provider.send(input({ subject: 'changed' }));
    const other = await provider.send(input({ idempotencyKey: 'delivery-456' }));

    expect(again).toEqual(first);
    expect(other.providerMessageId).not.toBe(first.providerMessageId);
    expect(provider.sent.map((m) => m.idempotencyKey)).toEqual(['delivery-123', 'delivery-456']);
  });

  it('logs metadata only', async () => {
    const logger = { info: vi.fn() };
    await createLogEmailProvider({ logger }).send(
      input({ subject: 'Private subject', html: '<p>Private body</p>' }),
    );

    const logged = JSON.stringify(logger.info.mock.calls);
    for (const secret of [RECIPIENT, 'Private subject', 'Private body'])
      expect(logged).not.toContain(secret);
    expect(logged).toContain('"recipients":1');
  });

  it('keeps only the most recent messages', async () => {
    const provider = createLogEmailProvider({ capacity: 2 });
    for (const key of ['a', 'b', 'c']) await provider.send(input({ idempotencyKey: key }));
    expect(provider.sent.map((m) => m.idempotencyKey)).toEqual(['b', 'c']);
  });
});

describe('email configuration', () => {
  const base = { NODE_ENV: 'test' };

  it('uses the log provider when Resend is not configured', () => {
    const config = loadConfig(base).email;
    expect(config.provider).toEqual({ kind: 'log' });
    expect(config.from).toContain('example.invalid');
    expect(createEmailProvider(config, { info: () => undefined }).name).toBe('log');
  });

  it('uses Resend when the API key and sender are set', () => {
    const config = loadConfig({
      ...base,
      RESEND_API_KEY: API_KEY,
      EMAIL_FROM: 'Studio <hi@mail.example.com>',
    }).email;
    expect(config).toEqual({
      provider: { kind: 'resend', apiKey: API_KEY, apiBaseUrl: 'https://api.resend.com' },
      from: 'Studio <hi@mail.example.com>',
      replyTo: undefined,
    });
    expect(createEmailProvider(config, { info: () => undefined }).name).toBe('resend');
  });

  it('stays on log when only the key is set (no verified sender)', () => {
    expect(loadConfig({ ...base, RESEND_API_KEY: API_KEY }).email.provider.kind).toBe('log');
  });

  it.each([
    [{ EMAIL_PROVIDER: 'resend' }, 'RESEND_API_KEY'],
    [{ EMAIL_PROVIDER: 'resend', RESEND_API_KEY: API_KEY }, 'EMAIL_FROM'],
    [{ EMAIL_FROM: 'not an address' }, 'EMAIL_FROM'],
    [{ EMAIL_FROM: 'Evil\r\nBcc: x@example.com <a@example.com>' }, 'EMAIL_FROM'],
    [{ STAFF_NOTIFICATION_EMAILS: 'ok@example.com, nope' }, 'STAFF_NOTIFICATION_EMAILS'],
    [{ NOTIFICATIONS_MAX_ATTEMPTS: '0' }, 'NOTIFICATIONS_MAX_ATTEMPTS'],
  ])('rejects %j', (env, variable) => {
    expect(() => loadConfig({ ...base, ...env })).toThrow(variable);
  });

  it('normalizes staff recipients', () => {
    expect(
      loadConfig({
        ...base,
        STAFF_NOTIFICATION_EMAILS: ' A@Example.com, b@example.com ,a@example.com',
      }).notifications.staffRecipients,
    ).toEqual(['a@example.com', 'b@example.com']);
  });

  it('never echoes the API key in configuration errors', () => {
    try {
      loadConfig({ ...base, EMAIL_PROVIDER: 'resend', RESEND_API_KEY: API_KEY });
      throw new Error('expected a configuration error');
    } catch (error) {
      expect(String(error)).not.toContain(API_KEY);
    }
  });
});
