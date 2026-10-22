import { z } from 'zod';

// Body of POST /api/projects/:pid/sql (04-api §1 Objects), reused by the agent's `run_sql` tool.

export const SQL_MAX_LENGTH = 20_000;

export const sqlRequestSchema = z.object({
  sql: z
    .string()
    .trim()
    .min(1, 'Write a SELECT query.')
    .max(SQL_MAX_LENGTH, `Queries are limited to ${SQL_MAX_LENGTH} characters.`),
});

export type SqlRequest = z.infer<typeof sqlRequestSchema>;
