import { z } from 'zod';
import type { ProjectRole } from '../../db/types.js';

export type { ProjectRole };

// Users and projects are not in packages/shared (no type there yet); these are the server's shapes
// for /api/me and /api/projects/:pid. Candidates to move to packages/shared via 09 §6.2.

export const uuidSchema = z.string().uuid();
export const projectParamsSchema = z.object({ pid: uuidSchema });
export const loginBodySchema = z.object({ email: z.string().email() });

export type User = { id: string; email: string; displayName: string };
export type ProjectSummary = { id: string; name: string; description: string; role: ProjectRole };
export type ProjectWithMembers = ProjectSummary & {
  createdAt: string;
  members: { user: User; role: ProjectRole }[];
};
export type Me = { user: User; projects: ProjectSummary[] };
