import type { BaseType, ColumnInfo, ColumnProfile } from '@mini/shared';
import { sql } from 'kysely';
import type { Db } from '../../db/index.js';
import { ident, qualified } from '../../db/ident.js';

// Full-table column profile in SQL (03-data-model §5), run by the background profile job.

const TOP_VALUES = 10;
// Leading letters (+ one separator) right before a digit: "SO-081234" → "SO-", "C0421" → "C".
const PREFIX_RE = '^[A-Za-z]+[-_/.]?(?=[0-9])';
// Prefix patterns are reported when they cover at least this share of the non-null values.
const PATTERN_MIN_COVERAGE = 0.5;

export async function computeProfile(
  db: Db,
  schema: string,
  table: string,
  columns: ColumnInfo[],
  progress: (p: number) => Promise<void>,
): Promise<ColumnProfile[]> {
  const t = qualified(schema, table);
  const steps = columns.length + 1;

  // One scan for counts, distinct counts and min / max of every column.
  const aggs = columns.flatMap((c, i) => {
    const col = ident(c.sqlName);
    const parts = [
      sql`count(${col}) AS ${sql.raw(`nn_${i}`)}`,
      sql`count(DISTINCT ${col}) AS ${sql.raw(`d_${i}`)}`,
    ];
    if (c.type !== 'boolean') {
      parts.push(sql`min(${col})::text AS ${sql.raw(`min_${i}`)}`, sql`max(${col})::text AS ${sql.raw(`max_${i}`)}`);
    }
    return parts;
  });
  const base = await sql<Record<string, string | null>>`
    SELECT count(*) AS total, ${sql.join(aggs)} FROM ${t}`.execute(db);
  const b = base.rows[0]!;
  const rowCount = Number(b.total);
  await progress(1 / steps);

  const profiles: ColumnProfile[] = [];
  for (const [i, c] of columns.entries()) {
    const col = ident(c.sqlName);
    const nonNull = Number(b[`nn_${i}`]);
    const distinct = Number(b[`d_${i}`]);

    const top = await sql<{ v: string | null; n: string }>`
      SELECT ${col}::text AS v, count(*) AS n FROM ${t}
      GROUP BY 1 ORDER BY 2 DESC, 1 NULLS LAST LIMIT ${TOP_VALUES}`.execute(db);

    const p: ColumnProfile = {
      column: c.name,
      type: c.type,
      rowCount,
      nullCount: rowCount - nonNull,
      distinctCount: distinct,
      isUnique: nonNull > 0 && distinct === nonNull,
      topValues: top.rows.map((r) => ({ value: r.v, count: Number(r.n) })),
    };
    const min = b[`min_${i}`];
    const max = b[`max_${i}`];
    if (min != null) p.min = typedBound(c.type, min);
    if (max != null) p.max = typedBound(c.type, max);

    if (c.type === 'string' && nonNull > 0) {
      const pat = await sql<{ p: string; n: string }>`
        SELECT p, count(*) AS n
        FROM (SELECT substring(${col} from ${PREFIX_RE}) AS p FROM ${t} WHERE ${col} IS NOT NULL) s
        WHERE p IS NOT NULL
        GROUP BY p ORDER BY 2 DESC, 1 LIMIT ${TOP_VALUES}`.execute(db);
      const patterns = pat.rows.map((r) => ({ pattern: `${r.p}…`, count: Number(r.n) }));
      const covered = patterns.reduce((s, x) => s + x.count, 0);
      if (patterns.length > 0 && covered / nonNull >= PATTERN_MIN_COVERAGE) p.patterns = patterns;
    }

    profiles.push(p);
    await progress((i + 2) / steps);
  }
  return profiles;
}

function typedBound(type: BaseType, v: string): string | number {
  return type === 'integer' || type === 'double' ? Number(v) : v;
}
