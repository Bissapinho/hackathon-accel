import type { AutomationDef } from '@mini/shared';
import { z } from 'zod';
import { uuidSchema } from '../resources/schemas.js';

// API shapes of automations and notifications (04-api §1 Apps, automations, notifications; §7).

export const automationParamsSchema = z.object({ pid: uuidSchema, id: z.string().min(1) });
export const eventsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) });
export const notificationParamsSchema = z.object({ id: uuidSchema });
export const notificationsQuerySchema = z.object({
  unread: z
    .enum(['0', '1', 'true', 'false'])
    .optional()
    .transform((v) => v === '1' || v === 'true'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type EffectOutcome = { kind: 'notify' | 'runAction'; status: 'done' | 'failed' | 'skipped'; message: string };

export type AutomationEvent = {
  id: string;
  automationId: string;
  trigger: 'action_run' | 'publish' | 'manual';
  entered: string[]; // primary keys that entered the set
  effects: EffectOutcome[];
  firedAt: string;
};

export type AutomationStateView = { automationId: string; enabled: boolean; enabledBy: string | null; evaluatedAt: string | null };

export type AutomationView = { def: AutomationDef; enabled: boolean; lastEvent: AutomationEvent | null };

export type NotificationView = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};
