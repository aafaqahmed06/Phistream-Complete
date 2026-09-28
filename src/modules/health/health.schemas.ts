import { z } from 'zod';

export const healthResponseSchema = z
  .object({
    status: z.literal('ok'),
    timestamp: z.iso.datetime(),
  })
  .meta({ id: 'HealthResponse' });

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const readinessResponseSchema = z
  .object({
    status: z.literal('ok'),
    checks: z.object({ database: z.literal('ok') }),
    timestamp: z.iso.datetime(),
  })
  .meta({ id: 'ReadinessResponse' });

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;
