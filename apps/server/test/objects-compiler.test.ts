import type { Filter, ObjectSet } from '@mini/shared';
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type RawBuilder } from 'kysely';
import { describe, expect, it } from 'vitest';
import { compileFilter, compileObjectSet } from '../src/modules/objects/compiler.js';
import { buildObjectModel, getType, toSqlName } from '../src/modules/objects/model.js';
import { objectsDoc } from './objects-fixture.js';

// Pure unit tests (no database): the SQL text and parameters the compiler produces.
const dummy = new Kysely<unknown>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
});
const compile = (b: RawBuilder<unknown>) => b.compile(dummy);
const model = buildObjectModel(objectsDoc);
const setSql = (s: ObjectSet) => compile(compileObjectSet(model, s).sql);
const filterSql = (f: Filter, type = 'Commande') => compile(compileFilter(f, getType(model, type), 'o'));

describe('toSqlName', () => {
  it('turns API names into snake_case', () => {
    expect(toSqlName('CuisineJour')).toBe('cuisine_jour');
    expect(toSqlName('tauxRetour')).toBe('taux_retour');
    expect(toSqlName('noTransaction')).toBe('no_transaction');
    expect(toSqlName('Commande')).toBe('commande');
  });
});

describe('compileFilter', () => {
  it('compares a property with a parameter', () => {
    const q = filterSql({ kind: 'cmp', property: 'quantite', op: 'gt', value: 3 });
    expect(q.sql).toBe('"o"."quantite" > $1');
    expect(q.parameters).toEqual([3]);
  });

  it('handles in, startsWith, null checks and combinations', () => {
    const q = filterSql({
      kind: 'and',
      filters: [
        { kind: 'cmp', property: 'clientId', op: 'in', value: ['C001', 'C002'] },
        { kind: 'or', filters: [{ kind: 'cmp', property: 'noTransaction', op: 'startsWith', value: 'SO-' }, { kind: 'cmp', property: 'date', op: 'isNull' }] },
        { kind: 'not', filter: { kind: 'cmp', property: 'quantite', op: 'notIn', value: [0] } },
      ],
    });
    expect(q.sql).toBe(
      '("o"."client_id" = ANY($1)) AND ((starts_with("o"."no_transaction"::text, $2)) OR ("o"."date" IS NULL)) AND (NOT (NOT ("o"."quantite" = ANY($3))))',
    );
    expect(q.parameters).toEqual([['C001', 'C002'], 'SO-', [0]]);
  });

  it('compares two properties and reads a rule column', () => {
    expect(filterSql({ kind: 'cmpProps', left: 'charge', op: 'gt', right: 'capacite' }, 'CuisineJour').sql).toBe('"o"."charge" > "o"."capacite"');
    expect(filterSql({ kind: 'rule', rule: 'surcharge' }, 'CuisineJour').sql).toBe('"o"."surcharge" IS TRUE');
  });

  it('searches the string properties', () => {
    const q = filterSql({ kind: 'search', text: 'alp' }, 'Client');
    expect(q.sql).toContain('strpos(lower("o"."nom"), lower($2)) > 0');
    expect(q.parameters).toEqual(['alp', 'alp', 'alp']);
  });

  it('values never reach the SQL text', () => {
    const evil = "x'; DROP TABLE meta.users; --";
    const q = filterSql({ kind: 'cmp', property: 'noTransaction', op: 'eq', value: evil });
    expect(q.sql).not.toContain('DROP');
    expect(q.parameters).toEqual([evil]);
  });

  it('explains unknown properties, rules and bad values', () => {
    expect(() => filterSql({ kind: 'cmp', property: 'prix', op: 'eq', value: 1 })).toThrow(/Commande has no property "prix"/);
    try {
      filterSql({ kind: 'cmp', property: 'prix', op: 'eq', value: 1 });
    } catch (e) {
      expect((e as { extra: { hint: string } }).extra.hint).toContain('noTransaction');
    }
    expect(() => filterSql({ kind: 'rule', rule: 'tauxCharge' }, 'CuisineJour')).toThrow(/no rule "tauxCharge"/);
    expect(() => filterSql({ kind: 'cmp', property: 'quantite', op: 'in', value: 3 })).toThrow(/needs a list/);
    expect(() => filterSql({ kind: 'cmp', property: 'quantite', op: 'eq' })).toThrow(/needs one value/);
    expect(() => filterSql({ kind: 'nope' } as never)).toThrow(/Unknown filter kind/);
  });
});

describe('compileObjectSet', () => {
  it('all reads the logic view', () => {
    expect(setSql({ kind: 'all', objectType: 'CuisineJour' }).sql).toBe('SELECT * FROM "logic"."cuisine_jour"');
  });

  it('filter wraps the inner set', () => {
    const q = setSql({ kind: 'filter', of: { kind: 'all', objectType: 'CuisineJour' }, where: { kind: 'rule', rule: 'surcharge' } });
    expect(q.sql).toBe('SELECT "s0".* FROM (SELECT * FROM "logic"."cuisine_jour") AS "s0" WHERE "s0"."surcharge" IS TRUE');
  });

  it('linked follows a forward link and a reverse composite link', () => {
    const fwd = compileObjectSet(model, { kind: 'linked', of: { kind: 'all', objectType: 'Commande' }, link: 'client' });
    expect(fwd.type.apiName).toBe('Client');
    expect(compile(fwd.sql).sql).toContain('WHERE "s0_src"."client_id" = "s0"."client_id"');

    const rev = compileObjectSet(model, { kind: 'linked', of: { kind: 'all', objectType: 'CuisineJour' }, link: 'lots' });
    expect(rev.type.apiName).toBe('LotProduction');
    expect(compile(rev.sql).sql).toContain('"s0_src"."lieu" = "s0"."lieu_production" AND "s0_src"."jour" = "s0"."jour"');
  });

  it('refs filters on the primary key as text', () => {
    const q = setSql({ kind: 'refs', refs: [{ objectType: 'Commande', primaryKey: 'SO-1' }] });
    expect(q.sql).toBe('SELECT "s0".* FROM "logic"."commande" AS "s0" WHERE "s0"."no_transaction"::text = ANY($1::text[])');
    expect(q.parameters).toEqual([['SO-1']]);
  });

  it('explains unknown types, links and mixed refs', () => {
    expect(() => setSql({ kind: 'all', objectType: 'Ticket' })).toThrow(/no published object type "Ticket"/);
    expect(() => setSql({ kind: 'linked', of: { kind: 'all', objectType: 'Client' }, link: 'lots' })).toThrow(/Client has no link "lots"/);
    expect(() =>
      setSql({ kind: 'refs', refs: [{ objectType: 'Client', primaryKey: 'C1' }, { objectType: 'Commande', primaryKey: 'SO-1' }] }),
    ).toThrow(/same object type/);
  });
});
