import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { jsonSchemaTransform, jsonSchemaTransformObject } from 'fastify-type-provider-zod';

import { API_VERSION } from '../../config/constants.js';
import { STAFF_SECURITY_SCHEME } from '../../modules/admin/admin.routes.js';
import { STATUS_TOKEN_SECURITY_SCHEME } from '../../modules/applications/applications.routes.js';
import { SCHEDULING_TOKEN_SECURITY_SCHEME } from '../../modules/scheduling/scheduling.routes.js';

export interface SwaggerPluginOptions {
  /** Serve the interactive UI and JSON spec at /docs. */
  readonly exposeUi: boolean;
}

/**
 * OpenAPI generation from route Zod schemas. The spec is always built (so it
 * can be exported/tested); the UI is only exposed when enabled by config.
 */
async function swaggerPlugin(app: FastifyInstance, options: SwaggerPluginOptions): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Phistream Studio API',
        description: 'Backend API for the Phistream Studio website and future admin dashboard.',
        version: API_VERSION,
      },
      tags: [
        { name: 'health', description: 'Service health checks' },
        { name: 'content', description: 'Public website content (read-only, cacheable)' },
        { name: 'contact', description: 'Public contact form and lead capture' },
        {
          name: 'applications',
          description: 'Eligibility form, application submission, and applicant status',
        },
        {
          name: 'scheduling',
          description: 'Applicant scheduling access and provider webhooks',
        },
        { name: 'analytics', description: 'Anonymous funnel events (no personal data)' },
        { name: 'admin', description: 'Staff-only API (Supabase Auth bearer token + staff role)' },
      ],
      components: {
        securitySchemes: {
          [STATUS_TOKEN_SECURITY_SCHEME]: {
            type: 'http',
            scheme: 'bearer',
            description:
              'Application status token (`statusAccess.token` from POST /applications). Not a staff credential.',
          },
          [SCHEDULING_TOKEN_SECURITY_SCHEME]: {
            type: 'http',
            scheme: 'bearer',
            description:
              'Scheduling token issued to an accepted applicant (from the scheduling page URL fragment).',
          },
          [STAFF_SECURITY_SCHEME]: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description:
              'Supabase Auth access token of a provisioned, active staff user (see docs/admin.md).',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
    transformObject: jsonSchemaTransformObject,
  });

  if (options.exposeUi) {
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }
}

export default fp(swaggerPlugin, { name: 'swagger' });
