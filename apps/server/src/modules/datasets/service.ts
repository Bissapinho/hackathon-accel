import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { BaseType, ColumnInfo, ColumnProfile, Dataset, DatasetVersion, MatchRate, ProfileResponse } from '@mini/shared';
import { sql } from 'kysely';
import type pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import type { Config } from '../../config.js';
import type { Db } from '../../db/index.js';
import { assertIdent, ident, qualified } from '../../db/ident.js';
import { withReadOnly } from '../../db/readonly.js';
import type { ParseError } from '../../db/types.js';
import { ApiError, notFound } from '../../errors.js';
import type { OnProfileDone } from '../../ports.js';
import type { ResourcesService } from '../resources/service.js';
import { openCsv, readSample } from './csv.js';
import {
  copyEscape,
  INFER_SAMPLE_ROWS,
  inferType,
  isNullToken,
  parseAs,
  sampleValue,
  SQL_TYPES,
  toSqlNames,
} from './infer.js';
import { computeProfile } from './profile.js';
import type { DatasetSummary, IngestInput, PreviewResult } from './schemas.js';

const MAX_PARSE_ERRORS = 1_000;
const SAMPLE_VALUES = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DatasetRow = {
  id: string;
  project_id: string;
  short_id: string;
  name: string;
  description: string;
  simulated: boolean;
  current_version: number | null;
};

type VersionRow = {
  id: string;
  dataset_id: string;
  version: number;
  transaction_type: 'SNAPSHOT' | 'APPEND';
  table_name: string;
  row_count: number;
  columns: ColumnInfo[];
  profile: ColumnProfile[] | null;
  profile_status: DatasetVersion['profileStatus'];
  parse_errors: ParseError[];
  dropped_at: Date | null;
  created_by: string;
  created_at: Date;
};

export type DatasetsDeps = {
  db: Db;
  pool: pg.Pool;
  config: Config;
  resources: ResourcesService;
  onProfileDone: OnProfileDone;
  kickJobs: () => void;
  log?: { warn(obj: object, msg: string): void };
};

export function createDatasetsService(deps: DatasetsDeps) {
  const { db, pool, config, resources } = deps;

  // ───────────── lookups ─────────────

  async function datasetById(datasetId: string): Promise<DatasetRow | undefined> {
    if (!UUID_RE.test(datasetId)) return undefined;
    return db
      .selectFrom('meta.datasets')
      .select(['id', 'project_id', 'short_id', 'name', 'description', 'simulated', 'current_version'])
      .where('id', '=', datasetId)
      .executeTakeFirst();
  }

  // For routes addressed by dataset id: the dataset, after the caller's project access check.
  async function requireDataset(datasetId: string, userId: string, access: 'read' | 'write'): Promise<DatasetRow> {
    const ds = await datasetById(datasetId);
    if (!ds) throw notFound('This dataset', 'no dataset has this id', 'List the datasets with GET /api/projects/:pid/datasets.');
    await resources.requireAccess(ds.project_id, userId, access);
    return ds;
  }

  // For agent tools: a dataset of the project by id or by exact name.
  async function resolveDataset(projectId: string, userId: string, idOrName: string): Promise<DatasetRow> {
    await resources.requireAccess(projectId, userId, 'read');
    let ds = await datasetById(idOrName);
    if (ds && ds.project_id !== projectId) ds = undefined;
    ds ??= await db
      .selectFrom('meta.datasets')
      .select(['id', 'project_id', 'short_id', 'name', 'description', 'simulated', 'current_version'])
      .where('project_id', '=', projectId)
      .where('name', '=', idOrName)
      .executeTakeFirst();
    if (!ds) {
      throw notFound(`The dataset "${idOrName}"`, 'no dataset of this project has this id or name', 'Call list_datasets to see them.');
    }
    return ds;
  }

  async function versionRow(ds: DatasetRow, version?: number): Promise<VersionRow> {
    const v = version ?? ds.current_version;
    if (v == null) {
      throw notFound(`A version of "${ds.name}"`, 'nothing has been uploaded into this dataset yet', 'Upload a file first.');
    }
    const row = await db
      .selectFrom('meta.dataset_versions')
      .selectAll()
      .where('dataset_id', '=', ds.id)
      .where('version', '=', v)
      .executeTakeFirst();
    if (!row) throw notFound(`Version ${v} of "${ds.name}"`, `the dataset has versions 1 to ${ds.current_version ?? 0}`);
    return row as VersionRow;
  }

  function liveTable(ds: DatasetRow, v: VersionRow): { schema: string; table: string } {
    if (v.dropped_at) {
      throw notFound(
        `The rows of version ${v.version} of "${ds.name}"`,
        'this old version of a large dataset was removed to save space',
        'Use the current version.',
      );
    }
    return splitTableName(v.table_name);
  }

  // ───────────── reads ─────────────

  async function listDatasets(projectId: string, userId: string): Promise<DatasetSummary[]> {
    await resources.requireAccess(projectId, userId, 'read');
    const rows = await db
      .selectFrom('meta.datasets as d')
      .leftJoin('meta.dataset_versions as v', (j) =>
        j.onRef('v.dataset_id', '=', 'd.id').onRef('v.version', '=', 'd.current_version'),
      )
      .select([
        'd.id',
        'd.project_id',
        'd.name',
        'd.description',
        'd.simulated',
        'd.current_version',
        'v.row_count',
        'v.columns',
        'v.profile_status',
        'v.created_at as version_created_at',
        'v.created_by as version_created_by',
      ])
      .where('d.project_id', '=', projectId)
      .orderBy('d.name')
      .execute();
    return rows.map((r) => ({
      ...toDataset(r),
      current:
        r.current_version != null && r.row_count != null
          ? {
              version: r.current_version,
              rowCount: r.row_count,
              columnCount: (r.columns as ColumnInfo[]).length,
              profileStatus: r.profile_status!,
              createdAt: r.version_created_at!.toISOString(),
              createdBy: r.version_created_by!,
            }
          : null,
    }));
  }

  async function listVersions(datasetId: string, userId: string): Promise<DatasetVersion[]> {
    const ds = await requireDataset(datasetId, userId, 'read');
    const rows = await db
      .selectFrom('meta.dataset_versions')
      .selectAll()
      .where('dataset_id', '=', ds.id)
      .orderBy('version', 'desc')
      .execute();
    return rows.map((r) => toVersion(r as VersionRow));
  }

  async function getVersion(ds: DatasetRow, version?: number): Promise<DatasetVersion> {
    return toVersion(await versionRow(ds, version));
  }

  async function preview(
    ds: DatasetRow,
    opts: { version?: number; limit: number; offset: number },
  ): Promise<PreviewResult> {
    const v = await versionRow(ds, opts.version);
    const { schema, table } = liveTable(ds, v);
    // Dates and timestamps as text: no time-zone shift through JS Date.
    const cols = v.columns.map((c) =>
      c.type === 'date' || c.type === 'timestamp' ? sql`${ident(c.sqlName)}::text` : ident(c.sqlName),
    );
    const res = await sql<Record<string, unknown>>`
      SELECT ${sql.join(cols)} FROM ${qualified(schema, table)}
      ORDER BY _row LIMIT ${opts.limit} OFFSET ${opts.offset}`.execute(db);
    const rows = res.rows.map((r) => Object.values(r).map((val, i) => jsonValue(v.columns[i]!.type, val)));
    return { columns: v.columns, rows, total: v.row_count };
  }

  async function profile(ds: DatasetRow, opts: { version?: number; column?: string }): Promise<ProfileResponse> {
    const v = await versionRow(ds, opts.version);
    if (v.profile_status !== 'done' || !v.profile) return { status: v.profile_status };
    if (!opts.column) return { status: 'done', profiles: v.profile };
    const col = findColumn(ds, v.columns, opts.column);
    return { status: 'done', profiles: v.profile.filter((p) => p.column === col.name) };
  }

  // How many rows of this dataset find their key in another dataset (one or several columns).
  async function matchRate(
    ds: DatasetRow,
    target: DatasetRow,
    keys: { fromColumn: string; toColumn: string }[],
  ): Promise<MatchRate> {
    if (keys.length === 0) throw new ApiError(400, 'VALIDATION_FAILED', 'Give at least one key column pair.');
    const from = await versionRow(ds);
    const to = await versionRow(target);
    const src = liveTable(ds, from);
    const dst = liveTable(target, to);
    const pairs = keys.map((k) => ({
      from: findColumn(ds, from.columns, k.fromColumn).sqlName,
      to: findColumn(target, to.columns, k.toColumn).sqlName,
    }));
    const notNull = sql.join(
      pairs.map((p) => sql`s.${ident(p.from)} IS NOT NULL`),
      sql` AND `,
    );
    const joinOn = sql.join(
      pairs.map((p) => sql`t.${ident(p.to)}::text = s.${ident(p.from)}::text`),
      sql` AND `,
    );
    const exists = sql`EXISTS (SELECT 1 FROM ${qualified(dst.schema, dst.table)} t WHERE ${joinOn})`;
    const keyText = sql.join(
      pairs.map((p) => sql`s.${ident(p.from)}::text`),
      sql`, `,
    );

    return withReadOnly({ timeoutMs: config.PREVIEW_TIMEOUT_MS }, async (ro) => {
      const counts = await sql<{ non_null: string; matched: string }>`
        SELECT count(*) FILTER (WHERE ${notNull}) AS non_null,
               count(*) FILTER (WHERE ${notNull} AND ${exists}) AS matched
        FROM ${qualified(src.schema, src.table)} s`.execute(ro);
      const unmatched = await sql<{ k: string }>`
        SELECT DISTINCT concat_ws(' | ', ${keyText}) AS k
        FROM ${qualified(src.schema, src.table)} s
        WHERE ${notNull} AND NOT ${exists}
        LIMIT 5`.execute(ro);
      const nonNull = Number(counts.rows[0]!.non_null);
      const matched = Number(counts.rows[0]!.matched);
      return {
        keys: pairs.map((p) => ({
          fromColumn: from.columns.find((c) => c.sqlName === p.from)!.name,
          toColumn: to.columns.find((c) => c.sqlName === p.to)!.name,
        })),
        nonNull,
        matched,
        rate: nonNull === 0 ? 0 : matched / nonNull,
        unmatchedExamples: unmatched.rows.map((r) => r.k),
      };
    });
  }

  // ───────────── upload ─────────────

  async function ingest(input: IngestInput): Promise<DatasetVersion> {
    await resources.requireAccess(input.projectId, input.userId, 'write');
    const transactionType = input.transactionType ?? 'SNAPSHOT';

    let existing: DatasetRow | undefined;
    if (input.datasetId) {
      existing = await datasetById(input.datasetId);
      if (!existing || existing.project_id !== input.projectId) {
        throw notFound('The dataset to add a version to', 'no dataset of this project has this id');
      }
    } else if (transactionType === 'APPEND') {
      throw new ApiError(400, 'APPEND_NEEDS_DATASET', 'Adding rows needs the dataset to add them to.', {
        hint: 'Pass datasetId, or upload as SNAPSHOT to create a new dataset.',
      });
    }

    const name = existing?.name ?? (input.name?.trim() || datasetNameFromFile(input.originalName));
    if (!existing) {
      const clash = await db
        .selectFrom('meta.datasets')
        .select('id')
        .where('project_id', '=', input.projectId)
        .where('name', '=', name)
        .executeTakeFirst();
      if (clash) {
        throw new ApiError(409, 'DATASET_EXISTS', `A dataset named "${name}" already exists in this project.`, {
          hint: `To replace or extend it, upload with datasetId=${clash.id}; otherwise choose another name.`,
        });
      }
    }

    let sample: { header: string[]; rows: string[][] };
    try {
      sample = await readSample(input.filePath, INFER_SAMPLE_ROWS);
    } catch (err) {
      throw new ApiError(400, 'BAD_FILE', `This file can't be read as CSV: ${(err as Error).message}.`, {
        hint: 'Upload a .csv or .csv.gz file with a header line.',
      });
    }
    if (sample.header.length === 0 || sample.header.every((h) => h === '')) {
      throw new ApiError(400, 'BAD_FILE', 'This file has no header line.', { hint: 'The first line must name the columns.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Tables created here are owned by mini_app, so mini_reader's default privileges apply.
      await client.query('SET LOCAL ROLE mini_app');

      let ds: DatasetRow;
      let previous: VersionRow | undefined;
      if (existing) {
        // Lock the dataset row: one upload per dataset at a time.
        const locked = await client.query<DatasetRow>(
          'SELECT id, project_id, short_id, name, description, simulated, current_version FROM meta.datasets WHERE id = $1 FOR UPDATE',
          [existing.id],
        );
        ds = locked.rows[0]!;
        if (ds.current_version != null) {
          const prev = await client.query<VersionRow>(
            'SELECT * FROM meta.dataset_versions WHERE dataset_id = $1 AND version = $2',
            [ds.id, ds.current_version],
          );
          previous = prev.rows[0];
        }
      } else {
        ds = await insertDataset(client, {
          projectId: input.projectId,
          name,
          simulated: input.simulated ?? false,
          userId: input.userId,
        });
      }

      let columns: ColumnInfo[];
      if (transactionType === 'APPEND' && previous) {
        const prevNames = previous.columns.map((c) => c.name);
        if (prevNames.length !== sample.header.length || prevNames.some((n, i) => n !== sample.header[i])) {
          throw new ApiError(422, 'COLUMNS_MISMATCH', `The file's columns don't match the columns of "${ds.name}".`, {
            hint: `Expected: ${prevNames.join(', ')}. Got: ${sample.header.join(', ')}. Upload as SNAPSHOT to replace the dataset.`,
          });
        }
        columns = previous.columns.map((c) => ({ ...c, sample: [] }));
      } else {
        const sqlNames = toSqlNames(sample.header);
        columns = sample.header.map((h, i) => ({
          name: h,
          sqlName: sqlNames[i]!,
          type: inferType(sample.rows.map((r) => r[i] ?? '')),
          nullable: false,
          sample: [],
        }));
      }

      const version = (ds.current_version ?? 0) + 1;
      const table = `ds_${ds.short_id}_v${version}`;
      assertIdent(table);
      const colDefs = columns.map((c) => `${quoteIdent(c.sqlName)} ${SQL_TYPES[c.type]}`).join(', ');
      await client.query(`CREATE TABLE data.${quoteIdent(table)} (_row integer NOT NULL, ${colDefs})`);

      let rowOffset = 0;
      if (transactionType === 'APPEND' && previous) {
        const prevTable = splitTableName(previous.table_name);
        await client.query(
          `INSERT INTO data.${quoteIdent(table)} SELECT * FROM ${quoteIdent(prevTable.schema)}.${quoteIdent(prevTable.table)}`,
        );
        rowOffset = previous.row_count;
      }

      const load = await copyFile(client, input.filePath, `data.${quoteIdent(table)}`, columns, rowOffset, input.onProgress);
      columns = columns.map((c, i) => ({
        ...c,
        nullable: load.nullCounts[i]! > 0 || (transactionType === 'APPEND' && !!previous?.columns[i]?.nullable),
        sample: load.samples[i]!,
      }));
      await client.query(`CREATE INDEX ON data.${quoteIdent(table)} (_row)`);

      const inserted = await client.query<VersionRow>(
        `INSERT INTO meta.dataset_versions
           (dataset_id, version, transaction_type, table_name, row_count, columns, parse_errors, source_file, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          ds.id,
          version,
          transactionType,
          `data.${table}`,
          rowOffset + load.rows,
          JSON.stringify(columns),
          JSON.stringify(load.parseErrors),
          input.filePath,
          input.userId,
        ],
      );
      await client.query('UPDATE meta.datasets SET current_version = $2 WHERE id = $1', [ds.id, version]);
      await client.query("INSERT INTO meta.jobs (project_id, kind, target) VALUES ($1, 'profile', $2)", [
        input.projectId,
        inserted.rows[0]!.id,
      ]);
      await client.query('COMMIT');
      deps.kickJobs();
      return toVersion(inserted.rows[0]!);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ───────────── profile job (called by the job runner) ─────────────

  // Computes the full-table profile, stores it, then calls the onProfileDone hook (09 §4.2).
  // Returns a note when the hook failed: the profile stays done, the job records the note.
  async function runProfileJob(
    versionId: string,
    progress: (p: number) => Promise<void>,
  ): Promise<{ note?: string }> {
    const v = await db
      .selectFrom('meta.dataset_versions as v')
      .innerJoin('meta.datasets as d', 'd.id', 'v.dataset_id')
      .select(['v.id', 'v.dataset_id', 'v.version', 'v.table_name', 'v.columns', 'd.project_id'])
      .where('v.id', '=', versionId)
      .executeTakeFirst();
    if (!v) throw new Error(`dataset version ${versionId} no longer exists`);

    await db.updateTable('meta.dataset_versions').set({ profile_status: 'running' }).where('id', '=', v.id).execute();
    try {
      const { schema, table } = splitTableName(v.table_name);
      const profiles = await computeProfile(db, schema, table, v.columns as ColumnInfo[], progress);
      await db
        .updateTable('meta.dataset_versions')
        .set({ profile: JSON.stringify(profiles), profile_status: 'done' })
        .where('id', '=', v.id)
        .execute();
    } catch (err) {
      await db.updateTable('meta.dataset_versions').set({ profile_status: 'failed' }).where('id', '=', v.id).execute();
      throw err;
    }

    try {
      await deps.onProfileDone({ projectId: v.project_id, datasetId: v.dataset_id, version: v.version });
      return {};
    } catch (err) {
      deps.log?.warn({ err, versionId }, 'onProfileDone hook failed');
      return { note: `Profile done, but writing the semantic cards failed: ${(err as Error).message}` };
    }
  }

  return {
    requireDataset,
    resolveDataset,
    listDatasets,
    listVersions,
    getVersion,
    preview,
    profile,
    matchRate,
    ingest,
    runProfileJob,
  };
}

export type DatasetsService = ReturnType<typeof createDatasetsService>;
export type { DatasetRow };

// ───────────── helpers ─────────────

async function insertDataset(
  client: pg.PoolClient,
  d: { projectId: string; name: string; simulated: boolean; userId: string },
): Promise<DatasetRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const shortId = newShortId();
    const res = await client.query<DatasetRow>(
      `INSERT INTO meta.datasets (project_id, short_id, name, simulated, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (short_id) DO NOTHING
       RETURNING id, project_id, short_id, name, description, simulated, current_version`,
      [d.projectId, shortId, d.name, d.simulated, d.userId],
    );
    if (res.rows[0]) return res.rows[0];
  }
  throw new Error('could not allocate a dataset short id');
}

const SHORT_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function newShortId(): string {
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => SHORT_ID_ALPHABET[b % SHORT_ID_ALPHABET.length]).join('');
}

type LoadResult = {
  rows: number;
  nullCounts: number[];
  samples: (string | number | boolean | null)[][];
  parseErrors: ParseError[];
};

// Streams the whole file into the typed table with COPY: each cell is parsed in Node; cells that
// don't parse as the column type become NULL and are reported in parse_errors.
async function copyFile(
  client: pg.PoolClient,
  filePath: string,
  target: string,
  columns: ColumnInfo[],
  rowOffset: number,
  onProgress?: (rows: number) => void,
): Promise<LoadResult> {
  const reader = await openCsv(filePath);
  const result: LoadResult = {
    rows: 0,
    nullCounts: columns.map(() => 0),
    samples: columns.map(() => []),
    parseErrors: [],
  };
  const sampleSeen = columns.map(() => new Set<string>());

  async function* lines(): AsyncGenerator<string> {
    let batch: string[] = [];
    try {
      for await (const rec of reader.records) {
        result.rows++;
        const row = result.rows;
        const cells: string[] = [String(rowOffset + row)];
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i]!;
          const raw = rec[i];
          if (raw === undefined || isNullToken(raw)) {
            result.nullCounts[i]!++;
            cells.push('\\N');
            continue;
          }
          const parsed = parseAs(col.type, raw);
          if (parsed === undefined) {
            result.nullCounts[i]!++;
            if (result.parseErrors.length < MAX_PARSE_ERRORS) {
              result.parseErrors.push({ row, column: col.name, value: raw, expected: col.type });
            }
            cells.push('\\N');
            continue;
          }
          if (result.samples[i]!.length < SAMPLE_VALUES && !sampleSeen[i]!.has(parsed)) {
            sampleSeen[i]!.add(parsed);
            result.samples[i]!.push(sampleValue(col.type, parsed));
          }
          cells.push(copyEscape(parsed));
        }
        batch.push(cells.join('\t'));
        if (batch.length >= 2_000) {
          yield batch.join('\n') + '\n';
          batch = [];
          if (onProgress && row % 100_000 < 2_000) onProgress(row);
        }
      }
      if (batch.length) yield batch.join('\n') + '\n';
    } finally {
      reader.close();
    }
  }

  const copyStream = client.query(copyFrom(`COPY ${target} FROM STDIN`));
  await pipeline(Readable.from(lines()), copyStream);
  onProgress?.(result.rows);
  return result;
}

function quoteIdent(name: string): string {
  assertIdent(name);
  return `"${name}"`;
}

export function splitTableName(tableName: string): { schema: string; table: string } {
  const [schema, table] = tableName.split('.');
  if (!schema || !table) throw new Error(`bad table name ${tableName}`);
  return { schema, table };
}

function findColumn(ds: { name: string }, columns: ColumnInfo[], nameOrSql: string): ColumnInfo {
  const col =
    columns.find((c) => c.name === nameOrSql) ??
    columns.find((c) => c.sqlName === nameOrSql) ??
    columns.find((c) => c.name.toLowerCase() === nameOrSql.toLowerCase());
  if (!col) {
    throw new ApiError(400, 'UNKNOWN_COLUMN', `"${ds.name}" has no column "${nameOrSql}".`, {
      hint: `Its columns are: ${columns.map((c) => c.name).join(', ')}.`,
    });
  }
  return col;
}

function datasetNameFromFile(fileName: string): string {
  return path.basename(fileName).replace(/\.gz$/i, '').replace(/\.csv$/i, '');
}

function jsonValue(type: BaseType, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  // bigint comes back as text from pg; numbers beyond 2^53 stay text.
  if (type === 'integer' && typeof v === 'string') {
    const n = Number(v);
    return Number.isSafeInteger(n) ? n : v;
  }
  return v;
}

function toDataset(r: Pick<DatasetRow, 'id' | 'project_id' | 'name' | 'description' | 'simulated' | 'current_version'>): Dataset {
  return {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    currentVersion: r.current_version,
    simulated: r.simulated,
  };
}

function toVersion(r: VersionRow): DatasetVersion {
  return {
    datasetId: r.dataset_id,
    version: r.version,
    transactionType: r.transaction_type,
    rowCount: r.row_count,
    columns: r.columns,
    parseErrors: r.parse_errors,
    profileStatus: r.profile_status,
    ...(r.dropped_at ? { droppedAt: r.dropped_at.toISOString() } : {}),
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
  };
}

export { toDataset };
