import type {
  AggregateRequest,
  AggregateResponse,
  ObjectRow,
  QueryObjectsRequest,
  QueryObjectsResponse,
} from '@mini/shared';
import { sql, type RawBuilder } from 'kysely';
import type { Db } from '../../db/index.js';
import { ApiError } from '../../errors.js';
import { col, compileObjectSet } from './compiler.js';
import { buildObjectModel, getColumn, getType, type ObjectColumn, type ObjectModel, type ObjectTypeModel } from './model.js';
import { MAX_PAGE_SIZE } from './schemas.js';

// Objects of the PUBLISHED workspace (04-api §1 Objects): query, aggregate, one object with its links.
// Reads logic.<type> views, so derived properties and rules are queryable (03-data-model §3).

export type ObjectLinks = { apiName: string; displayName: string; rows: ObjectRow[]; truncated?: true }[];
export type ObjectWithLinks = ObjectRow & { links: ObjectLinks };

const DEFAULT_PAGE_SIZE = 50;
const MAX_LINKED_ROWS = 100;
const MAX_GROUPS = 1000;

type Row = Record<string, unknown>;

export function createObjectsService(db: Db) {
  // Published docs never change: cache the model per (project, version).
  const cache = new Map<string, { version: number; model: ObjectModel }>();

  async function loadModel(projectId: string): Promise<ObjectModel> {
    const latest = await db
      .selectFrom('meta.workspace_versions')
      .select('version')
      .where('project_id', '=', projectId)
      .orderBy('version', 'desc')
      .executeTakeFirst();
    if (!latest) {
      throw new ApiError(404, 'NOTHING_PUBLISHED', 'This project has no published objects yet.', {
        hint: 'Build object types in the workspace draft and publish it first.',
      });
    }
    const hit = cache.get(projectId);
    if (hit?.version === latest.version) return hit.model;
    const row = await db
      .selectFrom('meta.workspace_versions')
      .select('doc')
      .where('project_id', '=', projectId)
      .where('version', '=', latest.version)
      .executeTakeFirstOrThrow();
    const model = buildObjectModel(row.doc);
    cache.set(projectId, { version: latest.version, model });
    return model;
  }

  async function query(projectId: string, req: QueryObjectsRequest): Promise<QueryObjectsResponse> {
    const model = await loadModel(projectId);
    const { type, sql: setSql } = compileObjectSet(model, req.set);
    const select = req.select?.map((p) => getColumn(type, p, ['property', 'derived']).apiName);
    const pageSize = Math.min(req.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const offset = decodePageToken(req.pageToken);

    const order: RawBuilder<unknown>[] = (req.orderBy ?? []).map((o) => {
      const c = getColumn(type, o.property);
      return sql`${col('q', c.sqlName)} ${sql.raw(o.direction === 'desc' ? 'DESC' : 'ASC')} NULLS LAST`;
    });
    order.push(sql`${col('q', type.primaryKey.sqlName)} ASC`); // stable pages

    const rows = await sql<Row>`SELECT * FROM (${setSql}) AS q ORDER BY ${sql.join(order)} LIMIT ${pageSize + 1} OFFSET ${offset}`.execute(db);
    const total = await sql<{ n: number }>`SELECT count(*)::int AS n FROM (${setSql}) AS q`.execute(db);

    const page = rows.rows.slice(0, pageSize);
    return {
      rows: page.map((r) => toObjectRow(type, r, select)),
      total: total.rows[0]?.n ?? 0,
      ...(rows.rows.length > pageSize ? { nextPageToken: encodePageToken(offset + pageSize) } : {}),
    };
  }

  async function aggregate(projectId: string, req: AggregateRequest): Promise<AggregateResponse> {
    const model = await loadModel(projectId);
    const { type, sql: setSql } = compileObjectSet(model, req.set);
    const groupCols = (req.groupBy ?? []).map((p) => getColumn(type, p));
    const keys = groupCols.map((c, i) => sql`${col('q', c.sqlName)} AS ${sql.id(`k${i}`)}`);
    const values = req.aggregate.map((a, i) => {
      const alias = sql.id(`v${i}`);
      if (a.fn === 'count') return sql`count(*)::float8 AS ${alias}`;
      const c = getColumn(type, a.property, ['property', 'derived']);
      if (c.type !== 'integer' && c.type !== 'double') {
        throw new ApiError(400, 'AGGREGATE_TYPE', `Can't compute ${a.fn} of ${type.apiName}.${c.apiName}: it is a ${c.type}, not a number.`, {
          hint: 'Use count, or a numeric property.',
        });
      }
      return sql`${sql.raw(a.fn)}(${col('q', c.sqlName)})::float8 AS ${alias}`;
    });
    const groupBy = groupCols.length
      ? sql` GROUP BY ${sql.join(groupCols.map((_, i) => sql.raw(String(i + 1))))} ORDER BY ${sql.join(groupCols.map((_, i) => sql.raw(String(i + 1))))}`
      : sql``;
    const res = await sql<Row>`SELECT ${sql.join([...keys, ...values])} FROM (${setSql}) AS q${groupBy} LIMIT ${MAX_GROUPS}`.execute(db);
    return {
      groups: res.rows.map((r) => ({
        keys: Object.fromEntries(groupCols.map((c, i) => [c.apiName, formatValue(c, r[`k${i}`])])),
        values: req.aggregate.map((_, i) => (r[`v${i}`] === null ? 0 : Number(r[`v${i}`]))),
      })),
    };
  }

  async function getObject(projectId: string, objectType: string, primaryKey: string): Promise<ObjectWithLinks> {
    const model = await loadModel(projectId);
    const type = getType(model, objectType);
    const ref = { objectType, primaryKey };
    const { sql: oneSql } = compileObjectSet(model, { kind: 'refs', refs: [ref] });
    const found = await sql<Row>`${oneSql} LIMIT 1`.execute(db);
    const row = found.rows[0];
    if (!row) {
      throw new ApiError(404, 'NOT_FOUND', `There is no ${type.displayName} with ${type.primaryKey.apiName} "${primaryKey}".`, {
        hint: 'Check the key, or search with query_objects.',
      });
    }

    const links: ObjectLinks = [];
    for (const side of model.links.get(objectType) ?? []) {
      const linked = compileObjectSet(model, { kind: 'linked', of: { kind: 'refs', refs: [ref] }, link: side.apiName });
      const res = await sql<Row>`SELECT * FROM (${linked.sql}) AS q ORDER BY ${col('q', linked.type.primaryKey.sqlName)} LIMIT ${MAX_LINKED_ROWS + 1}`.execute(db);
      links.push({
        apiName: side.apiName,
        displayName: side.displayName,
        rows: res.rows.slice(0, MAX_LINKED_ROWS).map((r) => toObjectRow(linked.type, r)),
        ...(res.rows.length > MAX_LINKED_ROWS ? { truncated: true as const } : {}),
      });
    }
    return { ...toObjectRow(type, row), links };
  }

  return { loadModel, query, aggregate, getObject };
}

export type ObjectsService = ReturnType<typeof createObjectsService>;

export function toObjectRow(t: ObjectTypeModel, row: Row, select?: string[]): ObjectRow {
  const properties: Record<string, unknown> = {};
  const rules: Record<string, boolean> = {};
  for (const c of t.columns.values()) {
    if (c.kind === 'rule') rules[c.apiName] = row[c.sqlName] === true;
    else if (!select || select.includes(c.apiName)) properties[c.apiName] = formatValue(c, row[c.sqlName]);
  }
  return {
    ref: { objectType: t.apiName, primaryKey: String(row[t.primaryKey.sqlName]) },
    title: String(row[t.title.sqlName] ?? row[t.primaryKey.sqlName]),
    properties,
    rules,
  };
}

// JSON-friendly values: dates as YYYY-MM-DD, timestamps as ISO, int8/numeric strings as numbers.
export function formatValue(c: ObjectColumn, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    if (c.type === 'date') {
      // pg parses `date` as local midnight
      const p = (n: number) => String(n).padStart(2, '0');
      return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return v.toISOString();
  }
  if ((c.type === 'integer' || c.type === 'double') && typeof v === 'string') return Number(v);
  return v;
}

function encodePageToken(offset: number): string {
  return Buffer.from(JSON.stringify({ o: offset })).toString('base64url');
}

function decodePageToken(token: string | undefined): number {
  if (!token) return 0;
  try {
    const { o } = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as { o: unknown };
    if (typeof o === 'number' && Number.isInteger(o) && o >= 0) return o;
  } catch {
    // fall through
  }
  throw new ApiError(400, 'INVALID_PAGE_TOKEN', 'This page token is not valid.', {
    hint: 'Use the nextPageToken of the previous response, or start again without one.',
  });
}
