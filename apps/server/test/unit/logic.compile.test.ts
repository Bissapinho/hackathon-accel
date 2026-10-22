import type { LogicDef } from '@mini/shared';
import { describe, expect, it } from 'vitest';
import { ruleColumn, logicColumns } from '../../src/modules/logic/columns.js';
import { compileLogicItem, compileLogicView } from '../../src/modules/logic/compile.js';
import type { LogicDoc } from '../../src/modules/logic/model.js';
import { InlineSink, literal, ParamSink, q, sqlName } from '../../src/modules/logic/sqltext.js';
import { detectCycles, validateLogic } from '../../src/modules/logic/validate.js';
import { logicTestDoc } from '../fixtures/logic-doc.js';

const codes = (doc: LogicDoc) => validateLogic(doc).errors.map((e) => e.code);
const find = (doc: LogicDoc, name: string) => doc.logic.find((l) => l.apiName === name)!;

describe('naming and literals', () => {
  it('snake_cases API names', () => {
    expect(sqlName('CuisineJour')).toBe('cuisine_jour');
    expect(sqlName('tauxRetour')).toBe('taux_retour');
    expect(sqlName('HTTPServer2')).toBe('http_server2');
  });

  it('rejects unsafe identifiers and escapes text', () => {
    expect(() => q('a"; drop table x; --')).toThrow();
    expect(literal("O'Brien'; DROP TABLE x; --")).toBe("'O''Brien''; DROP TABLE x; --'");
    expect(() => literal('a\0b')).toThrow();
    expect(() => literal(Number.NaN)).toThrow();
  });
});

describe('compileLogicView', () => {
  it('builds logic.<t> on ont.<t> with aggregates over a reverse link', () => {
    const view = compileLogicView('LgClient', logicTestDoc());
    expect(view.errors).toEqual([]);
    expect(view.viewName).toBe('logic.lg_client');
    expect(view.sql).toContain('CREATE VIEW logic."lg_client" AS');
    expect(view.sql).toContain('FROM ont."lg_client" o');
    expect(view.sql).toContain(`(SELECT count(*) FROM ont."lg_commande" x WHERE x."client_id" = o."client_id" AND ((x."statut" = 'livree'::text)))`);
    // div = a / NULLIF(b, 0), in floating point so integer counts don't truncate
    expect(view.sql).toMatch(/::double precision \/ NULLIF\(/);
    expect(view.sql).toContain('AS "taux_retour"');
    // rules never null
    expect(view.sql).toMatch(/COALESCE\(\(.*\), false\) AS "retours_eleves"/s);
    expect(view.statements[0]).toBe('DROP VIEW IF EXISTS logic."lg_client"');
    expect(view.statements.some((st) => st.startsWith('GRANT'))).toBe(false);
    expect(view.columns.map((c) => [c.sqlName, c.kind, c.type])).toEqual([
      ['nb_livrees', 'derived', 'integer'],
      ['nb_retours', 'derived', 'integer'],
      ['taux_retour', 'derived', 'double'],
      ['retours_eleves', 'rule', 'boolean'],
    ]);
  });

  it('joins on every column of a composite key', () => {
    const view = compileLogicView('LgCuisineJour', logicTestDoc());
    expect(view.errors).toEqual([]);
    expect(view.sql).toContain('x."lieu" = o."lieu" AND x."jour" = o."jour"');
    expect(view.sql).toContain('sum(x."quantite")');
    expect(view.sql).toContain('COALESCE((SELECT sum');
  });

  it('an object type without logic gets a pass-through view', () => {
    const view = compileLogicView('LgLot', logicTestDoc());
    expect(view.sql).toBe('CREATE VIEW logic."lg_lot" AS\nSELECT o.*\nFROM ont."lg_lot" o');
  });

  it('inlines a rule used by another rule', () => {
    const doc = logicTestDoc();
    doc.logic.push({
      apiName: 'aSurveiller', objectType: 'LgCuisineJour', displayName: 'À surveiller', description: 'x',
      kind: 'rule', condition: { kind: 'not', filter: { kind: 'rule', rule: 'surcharge' } },
    });
    const view = compileLogicView('LgCuisineJour', doc);
    expect(view.errors).toEqual([]);
    expect(view.sql).toMatch(/NOT \(\(.*"capacite".*\)\)/s);
  });
});

describe('values: parameters for queries, escaped literals for views', () => {
  it('binds filter values as typed parameters', () => {
    const doc = logicTestDoc();
    const sink = new ParamSink();
    const sql = compileLogicItem(doc, find(doc, 'nbLivrees'), sink);
    expect(sink.params).toEqual(['livree']);
    expect(sql).toContain('x."statut" = $1::text');
  });

  it('in / startsWith / search escape and type their values', () => {
    const doc = logicTestDoc();
    doc.logic.push({
      apiName: 'special', objectType: 'LgCommande', displayName: 's', description: 's', kind: 'rule',
      condition: {
        kind: 'and',
        filters: [
          { kind: 'cmp', property: 'statut', op: 'in', value: ['livree', "x'y"] },
          { kind: 'cmp', property: 'commandeId', op: 'startsWith', value: 'SO-1%' },
          { kind: 'search', text: "o'_" },
        ],
      },
    });
    const params = new ParamSink();
    const p = compileLogicItem(doc, find(doc, 'special'), params);
    expect(p).toContain('o."statut" = ANY($1::text[])');
    expect(params.params).toEqual([['livree', "x'y"], 'SO-1\\%%', "%o'\\_%", ]);
    const inline = compileLogicItem(doc, find(doc, 'special'), new InlineSink());
    expect(inline).toContain(`ARRAY['livree', 'x''y']::text[]`);
    expect(inline).toContain(`LIKE 'SO-1\\%%'::text ESCAPE '\\'`);
  });
});

describe('validateLogic', () => {
  it('accepts the test document', () => {
    expect(validateLogic(logicTestDoc())).toEqual({ errors: [], warnings: [] });
  });

  it('detects cycles (LOGIC_CYCLE)', () => {
    const doc = logicTestDoc();
    const a: LogicDef = { apiName: 'a', objectType: 'LgLot', displayName: 'a', description: 'a', kind: 'derived', type: 'integer', expr: { add: [{ property: 'b' }, { literal: 1 }] } };
    const b: LogicDef = { ...a, apiName: 'b', expr: { add: [{ property: 'a' }, { literal: 1 }] } };
    doc.logic.push(a, b);
    expect(detectCycles(doc)).toEqual([['LgLot.a', 'LgLot.b', 'LgLot.a']]);
    expect(codes(doc)).toContain('LOGIC_CYCLE');
    expect(compileLogicView('LgLot', doc).errors.length).toBeGreaterThan(0);
  });

  it('detects cycles across types through aggregates', () => {
    const doc = logicTestDoc();
    // LgCuisineJour.charge sums lots.chargeJour, and LgLot.chargeJour reads its kitchen-day's charge back.
    doc.logic.push({
      apiName: 'chargeJour', objectType: 'LgLot', displayName: 'c', description: 'c', kind: 'derived', type: 'integer',
      expr: { aggregate: { link: 'cuisineJour', fn: 'max', property: 'charge' } },
    });
    (find(doc, 'charge') as Extract<LogicDef, { kind: 'derived' }>).expr = {
      aggregate: { link: 'lots', fn: 'sum', property: 'chargeJour' },
    };
    expect(detectCycles(doc)).toEqual([['LgCuisineJour.charge', 'LgLot.chargeJour', 'LgCuisineJour.charge']]);
    expect(codes(doc)).toContain('LOGIC_CYCLE');
  });

  it('reports bad references, links, types and names', () => {
    const doc = logicTestDoc();
    const base = { objectType: 'LgClient', displayName: 'x', description: 'x' };
    doc.logic.push(
      { ...base, apiName: 'unknownProp', kind: 'derived', type: 'integer', expr: { property: 'nope' } },
      { ...base, apiName: 'unknownLink', kind: 'derived', type: 'integer', expr: { aggregate: { link: 'nope', fn: 'count' } } },
      { ...base, apiName: 'wrongType', kind: 'derived', type: 'string', expr: { div: [{ literal: 1 }, { literal: 2 }] } },
      { ...base, apiName: 'sumOfText', kind: 'derived', type: 'double', expr: { aggregate: { link: 'commandes', fn: 'sum', property: 'statut' } } },
      { ...base, apiName: 'badValue', kind: 'rule', condition: { kind: 'cmp', property: 'tauxRetour', op: 'gt', value: 'beaucoup' } },
      { ...base, apiName: 'Bad_Name', kind: 'rule', condition: { kind: 'cmp', property: 'nom', op: 'notNull' } },
      { ...base, apiName: 'nom', kind: 'rule', condition: { kind: 'cmp', property: 'nom', op: 'notNull' } },
      { ...base, apiName: 'noDescription', description: ' ', kind: 'rule', condition: { kind: 'rule', rule: 'nope' } },
    );
    const errors = validateLogic(doc).errors;
    const byName = (i: number) => errors.filter((e) => e.path.startsWith(`logic[${6 + i}]`)).map((e) => e.code);
    expect(byName(0)).toEqual(['UNKNOWN_REFERENCE']);
    expect(byName(1)).toEqual(['LOGIC_UNKNOWN_LINK']);
    expect(byName(2)).toEqual(['TYPE_MISMATCH']);
    expect(byName(3)).toEqual(['TYPE_MISMATCH']);
    expect(byName(4)).toEqual(['TYPE_MISMATCH']);
    expect(byName(5)).toEqual(['BAD_API_NAME']);
    expect(byName(6)).toEqual(['DUPLICATE_API_NAME']);
    expect(byName(7)).toEqual(['MISSING_DESCRIPTION', 'UNKNOWN_REFERENCE']);
  });

  it('allows one level of nesting, not two', () => {
    const doc = logicTestDoc();
    // LgCommande.tauxClient reads LgClient.tauxRetour (which aggregates) through an aggregate: too deep.
    doc.logic.push({
      apiName: 'tauxClient', objectType: 'LgCommande', displayName: 't', description: 't', kind: 'derived', type: 'double',
      expr: { aggregate: { link: 'client', fn: 'max', property: 'tauxRetour' } },
    });
    expect(codes(doc)).toContain('LOGIC_TOO_DEEP');
    // A plain derived property of the target is fine.
    doc.logic.pop();
    doc.logic.push(
      { apiName: 'montantTtc', objectType: 'LgCommande', displayName: 'm', description: 'm', kind: 'derived', type: 'double', expr: { mul: [{ property: 'montant' }, { literal: 1.2 }] } },
      { apiName: 'caTtc', objectType: 'LgClient', displayName: 'c', description: 'c', kind: 'derived', type: 'double', expr: { aggregate: { link: 'commandes', fn: 'sum', property: 'montantTtc' } } },
    );
    expect(codes(doc)).toEqual([]);
    expect(compileLogicView('LgClient', doc).sql).toContain('sum(((x."montant" * 1.2::double precision)))');
  });

  it('now fits a date; integers fit doubles', () => {
    const doc = logicTestDoc();
    const base = { objectType: 'LgLot', displayName: 'x', description: 'x', kind: 'derived' as const };
    doc.logic.push(
      { ...base, apiName: 'vu', type: 'date', expr: { now: true } },
      { ...base, apiName: 'q2', type: 'double', expr: { mul: [{ property: 'quantite' }, { literal: 2 }] } },
      { ...base, apiName: 'age', type: 'integer', expr: { sub: [{ today: true }, { property: 'jour' }] } },
    );
    expect(codes(doc)).toEqual([]);
  });
});

describe('columns for the objects module', () => {
  it('lists logic columns and resolves rules', () => {
    const doc = logicTestDoc();
    expect(logicColumns(doc, 'LgCuisineJour')).toEqual([
      { apiName: 'charge', sqlName: 'charge', kind: 'derived', type: 'integer' },
      { apiName: 'surcharge', sqlName: 'surcharge', kind: 'rule', type: 'boolean' },
    ]);
    expect(ruleColumn(doc, 'LgCuisineJour', 'surcharge')).toBe('surcharge');
    expect(ruleColumn(doc, 'LgCuisineJour', 'charge')).toBeUndefined();
  });
});
