import type { PipelineDef, PipelineNode } from '@mini/shared';
import { describe, expect, it } from 'vitest';
import { checkQuery, compilePipeline, evaluateCheck, selectNode, statement, type PipelineResolver } from '../src/modules/pipelines/compiler.js';

// Pure compiler tests: generated SQL text and parameters, no database.

const lines: PipelineResolver = {
  dataset: (ref) =>
    ref === 'ds-lines' || ref === 'COMMANDES'
      ? {
          datasetId: 'ds-lines',
          name: 'COMMANDES',
          version: 3,
          schema: 'data',
          table: 'ds_abcd1234_v3',
          columns: [
            { name: 'no_transaction', type: 'string' },
            { name: 'date', type: 'date' },
            { name: 'quantite', type: 'integer' },
            { name: 'montant', type: 'double' },
            { name: 'id_client', type: 'string' },
          ],
        }
      : ref === 'ds-clients'
        ? {
            datasetId: 'ds-clients',
            name: 'CLIENTS',
            version: 1,
            schema: 'data',
            table: 'ds_cli00001_v1',
            columns: [
              { name: 'id_interne', type: 'string' },
              { name: 'zone', type: 'string' },
            ],
          }
        : null,
};

function pipe(nodes: PipelineNode[], extra: Partial<PipelineDef> = {}): PipelineDef {
  return {
    apiName: 'commandes',
    description: 'Orders',
    nodes,
    outputs: [{ apiName: 'commandes', node: nodes[nodes.length - 1]!.id }],
    checks: [],
    ...extra,
  };
}

const src: PipelineNode = { id: 'src', kind: 'source', datasetId: 'ds-lines' };

describe('compilePipeline', () => {
  it('rolls SO lines up to one row per document (filter + aggregate)', () => {
    const c = compilePipeline(
      pipe([
        src,
        { id: 'so', kind: 'filter', input: 'src', where: { kind: 'cmp', property: 'no_transaction', op: 'startsWith', value: 'SO-' } },
        {
          id: 'docs',
          kind: 'aggregate',
          input: 'so',
          groupBy: ['no_transaction', 'id_client'],
          measures: [
            { as: 'lignes', fn: 'count' },
            { as: 'quantite', fn: 'sum', column: 'quantite' },
            { as: 'montant_moyen', fn: 'avg', column: 'montant' },
            { as: 'date', fn: 'min', column: 'date' },
          ],
        },
      ]),
      lines,
    );
    expect(c.errors).toEqual([]);
    expect(c.order).toEqual(['src', 'so', 'docs']);
    expect(c.inputVersions).toEqual({ 'ds-lines': 3 });
    expect(c.nodes.get('docs')!.columns).toEqual([
      { name: 'no_transaction', type: 'string' },
      { name: 'id_client', type: 'string' },
      { name: 'lignes', type: 'integer' },
      { name: 'quantite', type: 'integer' },
      { name: 'montant_moyen', type: 'double' },
      { name: 'date', type: 'date' },
    ]);
    const st = selectNode(c, 'docs', 50);
    expect(st.text).toBe(
      [
        'WITH "src" AS (SELECT "no_transaction", "date", "quantite", "montant", "id_client" FROM "data"."ds_abcd1234_v3"),',
        '"so" AS (SELECT * FROM "src" WHERE starts_with("no_transaction"::text, $1::text)),',
        '"docs" AS (SELECT "no_transaction", "id_client", count(*)::bigint AS "lignes", sum("quantite")::bigint AS "quantite", avg("montant")::double precision AS "montant_moyen", min("date") AS "date" FROM "so" GROUP BY "no_transaction", "id_client")',
        'SELECT "no_transaction", "id_client", "lignes", "quantite", "montant_moyen", "date" FROM "docs" LIMIT 50',
      ].join('\n'),
    );
    expect(st.params).toEqual(['SO-']);
  });

  it('accepts the dataset name as a source reference', () => {
    const c = compilePipeline(pipe([{ id: 'src', kind: 'source', datasetId: 'COMMANDES' }]), lines);
    expect(c.errors).toEqual([]);
    expect(c.inputVersions).toEqual({ 'ds-lines': 3 });
  });

  it('parameterizes values with the column type and renumbers per statement', () => {
    const c = compilePipeline(
      pipe([
        src,
        {
          id: 'f',
          kind: 'filter',
          input: 'src',
          where: {
            kind: 'and',
            filters: [
              { kind: 'cmp', property: 'date', op: 'gte', value: '2025-08-01' },
              { kind: 'cmp', property: 'quantite', op: 'in', value: [1, 2] },
              { kind: 'not', filter: { kind: 'cmp', property: 'id_client', op: 'isNull' } },
            ],
          },
        },
        { id: 'd', kind: 'derive', input: 'f', as: 'total', expr: { mul: [{ property: 'quantite' }, { literal: 2.5 }] } },
      ]),
      lines,
    );
    expect(c.errors).toEqual([]);
    const st = selectNode(c, 'd');
    expect(st.text).toContain('("date" >= $1::date)');
    expect(st.text).toContain('("quantite" = ANY($2::bigint[]))');
    expect(st.text).toContain('(NOT ("id_client" IS NULL))');
    expect(st.text).toContain('("quantite" * $3::double precision) AS "total"');
    expect(st.params).toEqual(['2025-08-01', [1, 2], 2.5]);
    expect(c.nodes.get('d')!.columns.at(-1)).toEqual({ name: 'total', type: 'double' });

    // Previewing only the source needs no parameters at all.
    expect(selectNode(c, 'src').params).toEqual([]);
  });

  it('never puts values or unchecked names in the SQL text', () => {
    const evil = "x'); DROP TABLE meta.users; --";
    const c = compilePipeline(
      pipe([src, { id: 'f', kind: 'filter', input: 'src', where: { kind: 'cmp', property: 'no_transaction', op: 'eq', value: evil } }]),
      lines,
    );
    const st = selectNode(c, 'f');
    expect(st.text).not.toContain('DROP');
    expect(st.params).toEqual([evil]);

    const bad = compilePipeline(pipe([{ id: 'src"; drop', kind: 'source', datasetId: 'ds-lines' }]), lines);
    expect(bad.errors.map((e) => e.code)).toContain('BAD_API_NAME');
  });

  it('joins with prefixed colliding right columns', () => {
    const c = compilePipeline(
      pipe([
        src,
        { id: 'cli', kind: 'source', datasetId: 'ds-clients' },
        { id: 'r', kind: 'rename', input: 'cli', map: { id_interne: 'id_client' } },
        { id: 'j', kind: 'join', left: 'src', right: 'r', how: 'left', on: [{ left: 'id_client', right: 'id_client' }] },
      ]),
      lines,
    );
    expect(c.errors).toEqual([]);
    expect(c.nodes.get('j')!.columns.map((x) => x.name)).toEqual(['no_transaction', 'date', 'quantite', 'montant', 'id_client', 'r_id_client', 'zone']);
    expect(c.nodes.get('j')!.body).toBe(
      'SELECT l."no_transaction", l."date", l."quantite", l."montant", l."id_client", r."id_client" AS "r_id_client", r."zone" FROM "src" l LEFT JOIN "r" r ON l."id_client" = r."id_client"',
    );
    expect(c.inputVersions).toEqual({ 'ds-lines': 3, 'ds-clients': 1 });
  });

  it('deduplicates keeping the last row of the order', () => {
    const c = compilePipeline(
      pipe([src, { id: 'dd', kind: 'deduplicate', input: 'src', keys: ['no_transaction'], keep: 'last', orderBy: [{ column: 'date', direction: 'asc' }] }]),
      lines,
    );
    expect(c.nodes.get('dd')!.body).toBe(
      'SELECT DISTINCT ON ("no_transaction") "no_transaction", "date", "quantite", "montant", "id_client" FROM "src" ORDER BY "no_transaction", "date" DESC',
    );
  });

  it('unions inputs with the same columns and casts integer to double', () => {
    const c = compilePipeline(
      pipe([
        src,
        { id: 'a', kind: 'select', input: 'src', columns: ['no_transaction', 'quantite'] },
        { id: 'b0', kind: 'select', input: 'src', columns: ['quantite', 'no_transaction'] },
        { id: 'b', kind: 'cast', input: 'b0', column: 'quantite', to: 'double' },
        { id: 'u', kind: 'union', inputs: ['a', 'b'] },
      ]),
      lines,
    );
    expect(c.errors).toEqual([]);
    expect(c.nodes.get('u')!.columns).toEqual([
      { name: 'no_transaction', type: 'string' },
      { name: 'quantite', type: 'double' },
    ]);
    expect(c.nodes.get('u')!.body).toBe(
      'SELECT "no_transaction", "quantite"::double precision AS "quantite" FROM "a" UNION ALL SELECT "no_transaction", "quantite" FROM "b"',
    );
  });

  it('casts text safely (bad values become NULL)', () => {
    const c = compilePipeline(pipe([src, { id: 'c', kind: 'cast', input: 'src', column: 'no_transaction', to: 'integer' }]), lines);
    expect(c.nodes.get('c')!.body).toContain(`(CASE WHEN btrim("no_transaction") ~ '^[-+]?[0-9]+$' THEN btrim("no_transaction")::bigint END) AS "no_transaction"`);
    const bad = compilePipeline(pipe([src, { id: 'c', kind: 'cast', input: 'src', column: 'date', to: 'boolean' }]), lines);
    expect(bad.errors.map((e) => e.code)).toEqual(['TYPE_MISMATCH']);
  });

  it('derive with case, coalesce and division', () => {
    const c = compilePipeline(
      pipe([
        src,
        {
          id: 'd',
          kind: 'derive',
          input: 'src',
          as: 'sens',
          expr: { case: [{ when: { kind: 'cmp', property: 'quantite', op: 'lt', value: 0 }, then: { literal: 'retour' } }], else: { literal: 'vente' } },
        },
        { id: 'e', kind: 'derive', input: 'd', as: 'prix', expr: { div: [{ property: 'montant' }, { coalesce: [{ property: 'quantite' }, { literal: 1 }] }] } },
      ]),
      lines,
    );
    expect(c.errors).toEqual([]);
    expect(c.nodes.get('d')!.body).toContain(`(CASE WHEN ("quantite" < ⟦0⟧::bigint) THEN ⟦1⟧::text ELSE ⟦2⟧::text END) AS "sens"`);
    expect(c.nodes.get('e')!.body).toContain('("montant"::double precision / NULLIF(COALESCE("quantite", ⟦3⟧::bigint), 0)) AS "prix"');
  });
});

describe('validation errors', () => {
  const codes = (def: PipelineDef) => compilePipeline(def, lines).errors.map((e) => e.code);

  it('PIPELINE_CYCLE on a loop', () => {
    const c = compilePipeline(
      pipe([
        { id: 'a', kind: 'filter', input: 'b', where: { kind: 'cmp', property: 'x', op: 'isNull' } },
        { id: 'b', kind: 'filter', input: 'a', where: { kind: 'cmp', property: 'x', op: 'isNull' } },
      ]),
      lines,
      'pipelines[0]',
    );
    expect(c.errors).toEqual([expect.objectContaining({ code: 'PIPELINE_CYCLE', path: expect.stringMatching(/^pipelines\[0\]\.nodes\[\d\]$/) })]);
    expect(c.errors[0]!.message).toMatch(/a → b → a|b → a → b/);
  });

  it('UNKNOWN_REFERENCE for a missing input, dataset, column or output node', () => {
    expect(codes(pipe([{ id: 'f', kind: 'filter', input: 'nope', where: { kind: 'cmp', property: 'x', op: 'isNull' } }]))).toEqual(['UNKNOWN_REFERENCE']);
    expect(codes(pipe([{ id: 's', kind: 'source', datasetId: 'missing' }]))).toEqual(['UNKNOWN_REFERENCE']);
    expect(codes(pipe([src, { id: 's2', kind: 'select', input: 'src', columns: ['nope'] }]))).toEqual(['UNKNOWN_REFERENCE']);
    expect(codes(pipe([src], { outputs: [{ apiName: 'out', node: 'ghost' }] }))).toEqual(['UNKNOWN_REFERENCE']);
  });

  it('only reports the first failure down a chain', () => {
    const errs = compilePipeline(
      pipe([
        { id: 's', kind: 'source', datasetId: 'missing' },
        { id: 'f', kind: 'select', input: 's', columns: ['a'] },
      ]),
      lines,
    ).errors;
    expect(errs).toHaveLength(1);
  });

  it('TYPE_MISMATCH for a value that does not fit the column', () => {
    expect(codes(pipe([src, { id: 'f', kind: 'filter', input: 'src', where: { kind: 'cmp', property: 'quantite', op: 'eq', value: 'abc' } }]))).toEqual([
      'TYPE_MISMATCH',
    ]);
    expect(codes(pipe([src, { id: 'a', kind: 'aggregate', input: 'src', groupBy: [], measures: [{ as: 's', fn: 'sum', column: 'id_client' }] }]))).toEqual([
      'TYPE_MISMATCH',
    ]);
  });

  it('UNKNOWN_BLOCK_KIND for an unknown node kind; DUPLICATE_API_NAME for repeated ids', () => {
    expect(codes(pipe([src, { id: 'x', kind: 'pivot', input: 'src' } as unknown as PipelineNode]))).toContain('UNKNOWN_BLOCK_KIND');
    expect(codes(pipe([src, { ...src }]))).toContain('DUPLICATE_API_NAME');
  });

  it('checks must name an output and its columns', () => {
    expect(codes(pipe([src], { checks: [{ output: 'nope', kind: 'unique', columns: ['no_transaction'] }] }))).toEqual(['UNKNOWN_REFERENCE']);
    expect(codes(pipe([src], { checks: [{ output: 'commandes', kind: 'unique', columns: ['nope'] }] }))).toEqual(['UNKNOWN_REFERENCE']);
    expect(codes(pipe([src], { checks: [{ output: 'commandes', kind: 'rowCount' }] }))).toEqual(['INVALID_NODE']);
  });

  it('BAD_API_NAME when the output table name would be too long', () => {
    expect(codes(pipe([src], { outputs: [{ apiName: 'o'.repeat(60), node: 'src' }] }))).toContain('BAD_API_NAME');
  });
});

describe('checks', () => {
  it('builds the unique check query and explains a failure with a count and two examples', () => {
    const check = { output: 'commandes', kind: 'unique' as const, columns: ['no_transaction'] };
    expect(checkQuery(check, '"docs"')).toContain('GROUP BY "no_transaction" HAVING count(*) > 1');
    const r = evaluateCheck(check, { n: '12', examples: [{ no_transaction: 'SO-1', times: 13 }, { no_transaction: 'SO-2', times: 4 }] });
    expect(r.ok).toBe(false);
    expect(r.detail).toBe('12 values of (no_transaction) appear more than once, e.g. "SO-1" ×13, "SO-2" ×4.');
    expect(evaluateCheck(check, { n: 0, examples: null }).ok).toBe(true);
  });

  it('rowCount bounds', () => {
    const check = { output: 'o', kind: 'rowCount' as const, min: 100, max: 200 };
    expect(evaluateCheck(check, { n: 120, examples: null })).toMatchObject({ ok: true, detail: '120 rows (expected at least 100 and at most 200).' });
    expect(evaluateCheck(check, { n: 99, examples: null }).ok).toBe(false);
  });

  it('a check statement includes only the CTEs its output reads', () => {
    const c = compilePipeline(
      pipe([src, { id: 'f', kind: 'filter', input: 'src', where: { kind: 'cmp', property: 'quantite', op: 'gt', value: 0 } }, { id: 'other', kind: 'select', input: 'src', columns: ['date'] }], {
        outputs: [{ apiName: 'commandes', node: 'f' }],
      }),
      lines,
    );
    const st = statement(c, ['f'], 'SELECT 1');
    expect(st.text).not.toContain('"other"');
    expect(st.params).toEqual([0]);
  });
});
