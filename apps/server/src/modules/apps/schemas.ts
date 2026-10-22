import { z } from 'zod';

export { appDefSchema } from '../workspace/schemas.js';

export const appParamsSchema = z.object({ pid: z.string().uuid(), appId: z.string().min(1) });
