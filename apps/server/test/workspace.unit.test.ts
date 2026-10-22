import type { DraftOp, WorkspaceDoc } from '@mini/shared';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/errors.js';
import { diffDocs, isEmptyDiff } from '../src/modules/workspace/diff.js';
import { applyOps, docToOps, emptyDoc } from '../src/modules/workspace/ops.js';
import { draftOpSchema, workspaceDocSchema } from '../src/modules/workspace/schemas.js';
import { searchOntology } from '../src/modules/workspace/service.js';
import { toSqlName, validateStructure, validateWorkspace } from '../src/modules/workspace/validate.js';
import { stubSemanticsPort, type SemanticsPort } from '../src/ports.js';
import { kumoCatalog, kumoWorkspace } from './fixtures/workspace-kumo.js';

// Pure workspace tests: no database (run with VITEST_NO_DB=1).

const codes = (v: { errors: { code: string }[] }) => v.errors.map((e) => e.code);
const clone = () => kumoWorkspace();

describe('T-11 schemas and ops', () => {
  it('the fixture document parses with the zod schemas', () => {
    expect(workspaceDocSchema.safeParse(kumoWorkspace()).success).toBe(true);
  });

  it('applying the document as ops to an empty draft yields the same document', () => {
    const ops = docToOps(kumoWorkspace());
    for (const op of ops) expect(draftOpSchema.safeParse(op).success).toBe(true);
    expect(applyOps(emptyDoc(''), ops)).toEqual(kumoWorkspace());
  });

  it('upsert replaces by apiName; remove and setMetadata target entities', () => {
    const doc = applyOps(kumoWorkspace(), [
      { op: 'upsertProperty', objectType: 'Client', value: { apiName: 'zone', column: 'zone', type: 'string', displayName: 'Zone', description: 'Delivery zone.', aliases: [], editable: false, allowedValues: ['IDF', 'LYON'] } },
      { op: 'setMetadata', target: { kind: 'objectType', apiName: 'Client' }, field: 'aliases', value: ['customer', 'compte'] },
      { op: 'setMetadata', target: { kind: 'logic', apiName: 'charge' }, field: 'description', value: 'Planned meals.' },
      { op: 'remove', kind: 'actionType', apiName: 'ReaffecterProduction' },
      { op: 'setSemanticVersion', version: 'v1' },
    ]);
    const client = doc.objectTypes.find((t) => t.apiName === 'Client')!;
    expect(client.properties.filter((p) => p.apiName === 'zone')).toHaveLength(1);
    expect(client.properties.find((p) => p.apiName === 'zone')!.allowedValues).toEqual(['IDF', 'LYON']);
    expect(client.aliases).toEqual(['customer', 'compte']);
    expect(doc.logic.find((l) => l.apiName === 'charge')!.description).toBe('Planned meals.');
    expect(doc.actionTypes).toHaveLength(0);
    expect(doc.semanticVersion).toBe('v1');
  });

  it('a batch with one bad op applies nothing and names the op', () => {
    const before = kumoWorkspace();
    const ops: DraftOp[] = [
      { op: 'setSemanticVersion', version: 'v9' },
      { op: 'remove', kind: 'objectType', apiName: 'Nope' },
    ];
    try {
      applyOps(before, ops);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
      expect((e as ApiError).extra.details?.[0]?.path).toBe('ops[1]');
    }
    expect(before.semanticVersion).toBe('v0');
  });

  it('unknown kinds and legacy fields fail parsing with a clear message', () => {
    const legacy = draftOpSchema.safeParse({
      op: 'upsertObjectType',
      value: { ...kumoWorkspace().objectTypes[1], datasetId: 'x' },
    });
    expect(legacy.success).toBe(false);
    const badKind = draftOpSchema.safeParse({
      op: 'upsertPipeline',
      value: { ...kumoWorkspace().pipelines[0], nodes: [{ id: 'a', kind: 'pivot', input: 'b' }] },
    });
    expect(badKind.success).toBe(false);
    expect(JSON.stringify(badKind.error?.issues)).toMatch(/source.*filter/);
  });
});

describe('T-11 diff', () => {
  it('lists every entity as an addition against an empty published doc', () => {
    const d = diffDocs(emptyDoc(''), kumoWorkspace());
    expect(d.added.map((e) => `${e.kind}:${e.apiName}`)).toEqual(
      expect.arrayContaining(['pipeline:commandes', 'objectType:Commande', 'linkType:Commande.client', 'logic:CuisineJour.surcharge', 'actionType:ReaffecterProduction']),
    );
    expect(d.added).toHaveLength(2 + 4 + 2 + 3 + 1);
    expect(d.changed).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.semanticVersion).toEqual({ from: '', to: 'v0' });
  });

  it('lists property-level changes and removals between two versions', () => {
    const base = kumoWorkspace();
    const next = applyOps(base, [
      { op: 'setMetadata', target: { kind: 'property', objectType: 'Client', apiName: 'nom' }, field: 'displayName', value: 'Nom' },
      { op: 'remove', kind: 'property', objectType: 'Client', apiName: 'zone' },
      { op: 'remove', kind: 'logic', apiName: 'nbCommandes' },
    ]);
    const d = diffDocs(base, next);
    expect(d.added).toEqual([]);
    expect(d.changed.map((e) => e.apiName)).toEqual(['Client.nom']);
    expect(d.removed.map((e) => e.apiName).sort()).toEqual(['Client.nbCommandes', 'Client.zone']);
    expect(isEmptyDiff(diffDocs(base, kumoWorkspace()))).toBe(true);
  });
});

describe('T-13 structural validation', () => {
  it('the fixture is valid (no errors) with its dataset catalog', () => {
    const v = validateStructure(kumoWorkspace(), kumoCatalog());
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('PIPELINE_CYCLE', () => {
    const doc = clone();
    doc.pipelines[0]!.nodes[1] = { id: 'so', kind: 'filter', input: 'doc', where: { kind: 'cmp', property: 'no_transaction', op: 'startsWith', value: 'SO-' } };
    expect(codes(validateStructure(doc, kumoCatalog()))).toContain('PIPELINE_CYCLE');
  });

  it('MISSING_DESCRIPTION', () => {
    const doc = clone();
    doc.objectTypes[0]!.properties[1]!.description = '  ';
    const v = validateStructure(doc, kumoCatalog());
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'MISSING_DESCRIPTION', path: 'objectTypes[0].properties[1].description' }));
  });

  it('RULE_SETS_READONLY for a derived property and a non-editable one', () => {
    const doc = clone();
    doc.actionTypes[0]!.parameters.push({ id: 'jour', kind: 'object', objectType: 'CuisineJour', displayName: 'Jour', description: 'Day.', required: true });
    doc.actionTypes[0]!.rules.push({ kind: 'modifyObject', object: 'jour', set: { charge: { kind: 'literal', value: 3 }, capacite: { kind: 'literal', value: 3 } } });
    const errors = validateStructure(doc, kumoCatalog()).errors.filter((e) => e.code === 'RULE_SETS_READONLY');
    expect(errors.map((e) => e.path)).toEqual(['actionTypes[0].rules[1].set.charge', 'actionTypes[0].rules[1].set.capacite']);
  });

  it('CRITERION_UNKNOWN_RULE (unknown, and derived instead of rule)', () => {
    const doc = clone();
    const c = doc.actionTypes[0]!.submissionCriteria[0]!;
    if (c.kind !== 'rule') throw new Error('fixture changed');
    c.rule = 'pleine';
    expect(codes(validateStructure(doc, kumoCatalog()))).toContain('CRITERION_UNKNOWN_RULE');
    c.rule = 'charge';
    expect(codes(validateStructure(doc, kumoCatalog()))).toContain('CRITERION_UNKNOWN_RULE');
  });

  it('DUPLICATE_API_NAME and BAD_API_NAME', () => {
    const doc = clone();
    doc.objectTypes.push({ ...doc.objectTypes[1]! });
    doc.linkTypes[0]!.apiName = 'Client_link';
    doc.pipelines[0]!.apiName = 'Commandes';
    const v = validateStructure(doc, kumoCatalog());
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'DUPLICATE_API_NAME', path: 'objectTypes[4].apiName' }));
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'BAD_API_NAME', path: 'linkTypes[0].apiName' }));
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'BAD_API_NAME', path: 'pipelines[0].apiName' }));
  });

  it('a logic name colliding with a property is a duplicate', () => {
    const doc = clone();
    doc.logic[1]!.apiName = 'capacite';
    expect(codes(validateStructure(doc, kumoCatalog()))).toContain('DUPLICATE_API_NAME');
  });

  it('UNKNOWN_REFERENCE: dataset, column, pipeline output, link target, PK', () => {
    const doc = clone();
    doc.objectTypes[1]!.source = { kind: 'dataset', datasetId: 'missing' };
    doc.objectTypes[0]!.properties[2]!.column = 'date_commande';
    doc.objectTypes[2]!.source = { kind: 'pipeline', pipeline: 'production_lots', output: 'nope' };
    doc.linkTypes[0]!.to = 'Customer';
    doc.objectTypes[3]!.primaryKey = 'id';
    const paths = validateStructure(doc, kumoCatalog()).errors.filter((e) => e.code === 'UNKNOWN_REFERENCE').map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'objectTypes[1].source.datasetId',
        'objectTypes[0].properties[2].column',
        'objectTypes[2].source',
        'linkTypes[0].to',
        'objectTypes[3].primaryKey',
      ]),
    );
  });

  it('pipeline columns are inferred: filters and checks on unknown columns are caught', () => {
    const doc = clone();
    doc.pipelines[0]!.checks.push({ output: 'commandes', kind: 'unique', columns: ['article'] }); // dropped by the aggregate
    const v = validateStructure(doc, kumoCatalog());
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_REFERENCE', path: 'pipelines[0].checks[1].columns[0]' }));
  });

  it('TYPE_MISMATCH: property vs column, link keys, derived formula, criterion lookup key', () => {
    const doc = clone();
    doc.objectTypes[0]!.properties[3]!.type = 'boolean'; // quantite is integer
    doc.linkTypes[1]!.keys[1] = { fromProperty: 'dateProduction', toProperty: 'capacite' };
    const charge = doc.logic[1]!;
    if (charge.kind !== 'derived') throw new Error('fixture changed');
    charge.type = 'date';
    const v = validateStructure(doc, kumoCatalog());
    expect(v.errors.filter((e) => e.code === 'TYPE_MISMATCH').map((e) => e.path)).toEqual(
      expect.arrayContaining(['objectTypes[0].properties[3].type', 'linkTypes[1].keys[1]', 'logic[1].type']),
    );
  });

  it('PK_EDITABLE', () => {
    const doc = clone();
    doc.objectTypes[1]!.properties[0]!.editable = true;
    expect(codes(validateStructure(doc, kumoCatalog()))).toContain('PK_EDITABLE');
  });

  it('LOGIC_CYCLE and LOGIC_UNKNOWN_LINK', () => {
    const doc = clone();
    doc.logic.push(
      { apiName: 'a', objectType: 'Client', kind: 'derived', type: 'integer', expr: { add: [{ property: 'b' }, { literal: 1 }] }, displayName: 'A', description: 'A.' },
      { apiName: 'b', objectType: 'Client', kind: 'derived', type: 'integer', expr: { property: 'a' }, displayName: 'B', description: 'B.' },
      { apiName: 'c', objectType: 'Client', kind: 'derived', type: 'integer', expr: { aggregate: { link: 'lots', fn: 'count' } }, displayName: 'C', description: 'C.' },
    );
    const v = validateStructure(doc, kumoCatalog());
    expect(codes(v)).toContain('LOGIC_CYCLE');
    expect(v.errors).toContainEqual(expect.objectContaining({ code: 'LOGIC_UNKNOWN_LINK', path: 'logic[5].expr.aggregate.link' }));
  });

  it('reports what publish refuses: a cycle through a case condition', () => {
    const doc = clone();
    doc.logic.push(
      {
        apiName: 'score', objectType: 'Client', kind: 'derived', type: 'integer',
        expr: { case: [{ when: { kind: 'rule', rule: 'risky' }, then: { literal: 1 } }], else: { literal: 0 } },
        displayName: 'Score', description: 'Score.',
      },
      { apiName: 'risky', objectType: 'Client', kind: 'rule', condition: { kind: 'cmp', property: 'score', op: 'gt', value: 0 }, displayName: 'Risky', description: 'Risky.' },
    );
    expect(codes(validateStructure(doc, kumoCatalog()))).toContain('LOGIC_CYCLE');
  });

  it('message templates must name real parameters', () => {
    const doc = clone();
    doc.actionTypes[0]!.successMessage = 'Moved {{lot.poids}} to {{cuisine}}';
    const paths = validateStructure(doc, kumoCatalog()).errors.map((e) => `${e.code}@${e.path}`);
    expect(paths.filter((p) => p.endsWith('successMessage'))).toHaveLength(2);
  });

  it('warns MISSING_TERM and ALIAS_COLLISION', () => {
    const doc = clone();
    delete doc.objectTypes[1]!.term;
    doc.objectTypes[2]!.aliases.push('Customer');
    const v = validateStructure(doc, kumoCatalog());
    expect(v.errors).toEqual([]);
    expect(v.warnings).toContainEqual(expect.objectContaining({ code: 'MISSING_TERM', path: 'objectTypes[1].term' }));
    expect(v.warnings).toContainEqual(expect.objectContaining({ code: 'ALIAS_COLLISION', path: 'objectTypes[2].aliases' }));
  });

  it('without a dataset catalog, dataset checks are skipped', () => {
    const doc = clone();
    doc.objectTypes[1]!.source = { kind: 'dataset', datasetId: 'missing' };
    expect(validateStructure(doc).errors).toEqual([]);
  });
});

describe('T-13 semantic references through SemanticsPort (09 §4.1)', () => {
  const portWith = (known: string[], active = 'v0'): SemanticsPort => ({
    activeVersion: async () => active,
    recordExists: async (_p, _v, id) => known.includes(id),
    getRecord: async () => null,
  });
  const ctx = (semantics: SemanticsPort) => ({ projectId: 'p', semantics, datasets: kumoCatalog() });

  it('passes with the Phase 0 stub', async () => {
    expect((await validateWorkspace(kumoWorkspace(), ctx(stubSemanticsPort))).errors).toEqual([]);
  });

  it('a missing term, relation or constraint is UNKNOWN_REFERENCE; a wrong prefix too', async () => {
    const doc = clone();
    doc.objectTypes[0]!.term = 'R_commande_client';
    const v = await validateWorkspace(doc, ctx(portWith(['T_client', 'T_lot_production', 'T_cuisine_jour', 'T_commande', 'R_commande_client'])));
    const paths = v.errors.filter((e) => e.code === 'UNKNOWN_REFERENCE').map((e) => e.path).sort();
    expect(paths).toEqual(['linkTypes[1].relation', 'logic[2].constraints[0]', 'objectTypes[0].term']);
  });

  it('warns SEM_VERSION_STALE when a newer version is active; errors without a version', async () => {
    const v = await validateWorkspace(kumoWorkspace(), ctx({ ...stubSemanticsPort, activeVersion: async () => 'v1' }));
    expect(v.warnings).toContainEqual(expect.objectContaining({ code: 'SEM_VERSION_STALE' }));
    const doc: WorkspaceDoc = { ...kumoWorkspace(), semanticVersion: '' };
    expect((await validateWorkspace(doc, ctx(stubSemanticsPort))).errors).toContainEqual(expect.objectContaining({ path: 'semanticVersion' }));
  });

  it('runs the DataChecker only when the structure is clean', async () => {
    let calls = 0;
    const dataChecker = {
      check: async () => {
        calls += 1;
        return { errors: [{ path: 'objectTypes[0].primaryKey', code: 'PK_NOT_UNIQUE', message: 'x' }], warnings: [] };
      },
    };
    const ok = await validateWorkspace(kumoWorkspace(), { ...ctx(stubSemanticsPort), dataChecker });
    expect(codes(ok)).toEqual(['PK_NOT_UNIQUE']);
    const broken = clone();
    broken.objectTypes[0]!.description = '';
    await validateWorkspace(broken, { ...ctx(stubSemanticsPort), dataChecker });
    expect(calls).toBe(1);
  });
});

describe('helpers', () => {
  it('toSqlName', () => {
    expect(toSqlName('CuisineJour')).toBe('cuisine_jour');
    expect(toSqlName('tauxRetour')).toBe('taux_retour');
    expect(toSqlName('noTransaction')).toBe('no_transaction');
  });

  it('searchOntology ranks names over aliases over descriptions, accents ignored', () => {
    const hits = searchOntology(kumoWorkspace(), ['commande', 'customer']);
    expect(hits[0]).toMatchObject({ kind: 'objectType', apiName: 'Commande' });
    expect(hits.find((h) => h.apiName === 'Client' && h.kind === 'objectType')?.why).toMatch(/alias/);
    expect(searchOntology(kumoWorkspace(), ['réaffecter'], ['actionType'])[0]?.apiName).toBe('ReaffecterProduction');
    expect(searchOntology(kumoWorkspace(), ['zzz'])).toEqual([]);
  });
});
