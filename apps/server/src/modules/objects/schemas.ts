import type { AggregateRequest, Filter, ObjectSet, QueryObjectsRequest } from '@mini/shared';
import { z } from 'zod';

// Request bodies of the objects API (04-api §1 Objects), mirroring the types of packages/shared.

const compareOp = z.enum(['eq', 'neq', 'in', 'notIn', 'isNull', 'notNull', 'gt', 'gte', 'lt', 'lte', 'startsWith']);
const scalar = z.union([z.string(), z.number(), z.boolean()]);

export const filterSchema: z.ZodType<Filter> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.enum(['and', 'or']), filters: z.array(filterSchema) }),
    z.object({ kind: z.literal('not'), filter: filterSchema }),
    z.object({
      kind: z.literal('cmp'),
      property: z.string().min(1),
      op: compareOp,
      value: z.union([scalar, z.array(z.union([z.string(), z.number()]))]).optional(),
    }),
    z.object({
      kind: z.literal('cmpProps'),
      left: z.string().min(1),
      op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte']),
      right: z.string().min(1),
    }),
    z.object({ kind: z.literal('rule'), rule: z.string().min(1) }),
    z.object({ kind: z.literal('search'), text: z.string().min(1) }),
  ]),
) as z.ZodType<Filter>;

export const objectRefSchema = z.object({ objectType: z.string().min(1), primaryKey: z.string() });

export const objectSetSchema: z.ZodType<ObjectSet> = z.lazy(() =>
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('all'), objectType: z.string().min(1) }),
    z.object({ kind: z.literal('filter'), of: objectSetSchema, where: filterSchema }),
    z.object({ kind: z.literal('linked'), of: objectSetSchema, link: z.string().min(1) }),
    z.object({ kind: z.literal('refs'), refs: z.array(objectRefSchema).min(1).max(500) }),
  ]),
) as z.ZodType<ObjectSet>;

export const MAX_PAGE_SIZE = 500;

export const queryObjectsRequestSchema = z.object({
  set: objectSetSchema,
  select: z.array(z.string().min(1)).optional(),
  orderBy: z.array(z.object({ property: z.string().min(1), direction: z.enum(['asc', 'desc']) })).max(5).optional(),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  pageToken: z.string().optional(),
}) satisfies z.ZodType<QueryObjectsRequest>;

export const aggregateSchema = z.discriminatedUnion('fn', [
  z.object({ fn: z.literal('count') }),
  z.object({ fn: z.enum(['sum', 'avg', 'min', 'max']), property: z.string().min(1) }),
]);

export const aggregateRequestSchema = z.object({
  set: objectSetSchema,
  groupBy: z.array(z.string().min(1)).max(3).optional(),
  aggregate: z.array(aggregateSchema).min(1).max(10),
}) satisfies z.ZodType<AggregateRequest>;

export const getObjectParamsSchema = z.object({
  pid: z.string().uuid(),
  type: z.string().min(1),
  pk: z.string(),
});
