import type { ActionTypeDef, WorkspaceDoc } from '@mini/shared';
import { describe, expect, it } from 'vitest';
import {
  checkParams,
  coerceValue,
  compareValues,
  evaluateCompare,
  evaluateValue,
  renderTemplate,
  sqlName,
  type RunContext,
} from '../src/modules/actions/evaluate.js';
import { checkRules } from '../src/modules/actions/service.js';
import { kumoActionsDoc } from './actions-world.js';

const base = { currentUser: 'Ada', now: '2025-10-13T08:00:00.000Z' };
const doc: WorkspaceDoc = kumoActionsDoc();
const reaffecter = doc.actionTypes.find((a) => a.apiName === 'ReaffecterProduction')!;

describe('sqlName', () => {
  it('turns API names into snake_case SQL names', () => {
    expect(sqlName('CuisineJour')).toBe('cuisine_jour');
    expect(sqlName('lieuProduction')).toBe('lieu_production');
    expect(sqlName('tauxRetour')).toBe('taux_retour');
    expect(sqlName('LotProduction')).toBe('lot_production');
    expect(sqlName('id')).toBe('id');
  });
});

describe('coerceValue', () => {
  it('accepts values of the right type, from JSON or strings', () => {
    expect(coerceValue('integer', '6')).toEqual({ ok: true, value: 6 });
    expect(coerceValue('integer', 6.5)).toEqual({ ok: false });
    expect(coerceValue('double', '1.5')).toEqual({ ok: true, value: 1.5 });
    expect(coerceValue('boolean', 'True')).toEqual({ ok: true, value: true });
    expect(coerceValue('date', '2025-10-14')).toEqual({ ok: true, value: '2025-10-14' });
    expect(coerceValue('date', '14/10/2025')).toEqual({ ok: false });
    expect(coerceValue('string', '')).toEqual({ ok: true, value: null });
    expect(coerceValue('string', { a: 1 })).toEqual({ ok: false });
  });
});

describe('checkParams', () => {
  it('accepts an ObjectRef or a bare key for object parameters', () => {
    const r = checkParams(reaffecter, { lot: 'LOT-1', cuisineCible: 'Gennevilliers' }, base);
    expect(r.errors).toEqual([]);
    expect(r.refs.lot).toEqual({ objectType: 'LotProduction', primaryKey: 'LOT-1' });
    expect(r.values.cuisineCible).toBe('Gennevilliers');
  });

  it('reports missing, unknown, mistyped and disallowed parameters with paths', () => {
    const r = checkParams(
      reaffecter,
      { lot: { objectType: 'Client', primaryKey: 'C1' }, cuisineCible: 'Lyon', extra: 1 },
      base,
    );
    const codes = r.errors.map((e) => `${e.path}:${e.code}`).sort();
    expect(codes).toEqual(['params.cuisineCible:NOT_ALLOWED_VALUE', 'params.extra:UNKNOWN_PARAMETER', 'params.lot:WRONG_OBJECT_TYPE']);

    const missing = checkParams(reaffecter, {}, base);
    expect(missing.errors.map((e) => e.code)).toEqual(['REQUIRED', 'REQUIRED']);
  });

  it('applies defaults of value parameters', () => {
    const action: ActionTypeDef = {
      ...reaffecter,
      parameters: [{ id: 'quand', displayName: 'Quand', description: 'd', required: true, kind: 'value', type: 'timestamp', default: { kind: 'now' } }],
    };
    expect(checkParams(action, {}, base).values.quand).toBe(base.now);
  });
});

describe('value expressions and comparisons', () => {
  const ctx: RunContext = {
    ...base,
    values: { cible: 'Gennevilliers', n: 6 },
    objects: { lot: { ref: { objectType: 'LotProduction', primaryKey: 'LOT-1' }, values: { quantite: 6, lieuProduction: 'Frepillon' } } },
  };

  it('evaluates every ValueExpr kind', () => {
    expect(evaluateValue({ kind: 'literal', value: 3 }, ctx)).toBe(3);
    expect(evaluateValue({ kind: 'param', param: 'cible' }, ctx)).toBe('Gennevilliers');
    expect(evaluateValue({ kind: 'param', param: 'lot' }, ctx)).toBe('LOT-1');
    expect(evaluateValue({ kind: 'paramProperty', param: 'lot', property: 'lieuProduction' }, ctx)).toBe('Frepillon');
    expect(evaluateValue({ kind: 'paramProperty', param: 'lot', property: 'nope' }, ctx)).toBeNull();
    expect(evaluateValue({ kind: 'now' }, ctx)).toBe(base.now);
    expect(evaluateValue({ kind: 'currentUser' }, ctx)).toBe('Ada');
  });

  it('compares like SQL: numbers numerically, null is never equal', () => {
    expect(compareValues(6, 'eq', '6')).toBe(true);
    expect(compareValues('10', 'gt', 9)).toBe(true);
    expect(compareValues('2025-10-14', 'lt', '2025-10-15')).toBe(true);
    expect(compareValues(null, 'eq', null)).toBe(false);
    expect(compareValues(null, 'neq', 'x')).toBe(false);
    expect(compareValues(null, 'isNull', undefined)).toBe(true);
    expect(compareValues('a', 'in', ['a', 'b'])).toBe(true);
    expect(compareValues('c', 'notIn', ['a', 'b'])).toBe(true);
  });

  it('evaluates compare criteria, including lists', () => {
    expect(
      evaluateCompare(
        {
          kind: 'compare',
          left: { kind: 'paramProperty', param: 'lot', property: 'lieuProduction' },
          op: 'neq',
          right: { kind: 'param', param: 'cible' },
          failureMessage: 'x',
        },
        ctx,
      ),
    ).toBe(true);
    expect(
      evaluateCompare(
        { kind: 'compare', left: { kind: 'param', param: 'cible' }, op: 'in', right: { kind: 'list', values: ['Frepillon'] }, failureMessage: 'x' },
        ctx,
      ),
    ).toBe(false);
  });
});

describe('renderTemplate', () => {
  it('fills {{param}}, {{param.property}} and leaves unknown placeholders', () => {
    const scope = {
      cible: 'Gennevilliers',
      lot: { ref: { objectType: 'LotProduction', primaryKey: 'LOT-1' }, values: { quantite: 6 } },
      object: { ref: { objectType: 'CuisineJour', primaryKey: 'G|2025-10-14' }, values: { lieu: 'Gennevilliers' } },
    };
    expect(renderTemplate('Lot {{lot}} ({{lot.quantite}}) → {{ cible }}', scope)).toBe('Lot LOT-1 (6) → Gennevilliers');
    expect(renderTemplate('{{object.lieu}} would be over capacity', scope)).toBe('Gennevilliers would be over capacity');
    expect(renderTemplate('{{missing}}', scope)).toBe('{{missing}}');
  });
});

describe('checkRules', () => {
  it('passes for the demo actions', () => {
    for (const a of doc.actionTypes) expect(checkRules(doc, a)).toEqual([]);
  });

  it('refuses setting a derived, key or non-editable property (RULE_SETS_READONLY)', () => {
    const bad: ActionTypeDef = {
      ...reaffecter,
      rules: [{ kind: 'modifyObject', object: 'lot', set: { quantite: { kind: 'literal', value: 1 }, lotId: { kind: 'literal', value: 'X' } } }],
    };
    expect(checkRules(doc, bad).map((e) => e.code)).toEqual(['RULE_SETS_READONLY', 'RULE_SETS_READONLY']);

    const derived: ActionTypeDef = {
      ...reaffecter,
      parameters: [{ id: 'cj', displayName: 'CJ', description: 'd', required: true, kind: 'object', objectType: 'CuisineJour' }],
      rules: [{ kind: 'modifyObject', object: 'cj', set: { charge: { kind: 'literal', value: 0 } } }],
    };
    expect(checkRules(doc, derived)).toEqual([expect.objectContaining({ code: 'RULE_SETS_READONLY', path: 'rules[0].set.charge' })]);
  });
});
