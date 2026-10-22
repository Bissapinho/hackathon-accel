import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BaseType, WorkspaceDoc } from '@mini/shared';
import { describe, expect, it } from 'vitest';
import { applyOps, docToOps, emptyDoc } from '../src/modules/workspace/ops.js';
import { compilePipeline, type PipelineResolver } from '../src/modules/pipelines/compiler.js';
import { workspaceDocSchema } from '../src/modules/workspace/schemas.js';
import { validateStructure, validateWorkspace, type DatasetCatalog } from '../src/modules/workspace/validate.js';
import { stubSemanticsPort } from '../src/ports.js';

// W1 (07 §1): build-package/fixtures/expected-workspace.json is a valid Kumo workspace document.
// Pure test, no database. Datasets are described by their columns (snake_cased headers of the kumo-mini files,
// plus the ASSUMED ones listed in the document's `_assumptions`); swap this catalog for the seeded fixture
// (pnpm seed:kumo fixtures/kumo-mini) once it exists in the repository.

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../build-package/fixtures/expected-workspace.json');

type Cols = [string, BaseType][];
const DATASETS: Record<string, { id: string; name: string; columns: Cols }> = {
  '<commandesDatasetId>': {
    id: 'ds-commandes',
    name: 'COMMANDES_NETSUITE_2025',
    columns: [['no_transaction', 'string'], ['date', 'date'], ['id_interne_client_netsuite', 'string'], ['id_interne_article', 'string'], ['quantite', 'integer'], ['lieu_production', 'string'], ['date_production', 'date']],
  },
  '<clientsDatasetId>': {
    id: 'ds-clients',
    name: 'CLIENTS_NETSUITE',
    columns: [['id_interne', 'string'], ['zone_distribution', 'string'], ['actif', 'boolean']],
  },
  '<articlesDatasetId>': {
    id: 'ds-articles',
    name: 'ARTICLES_NETSUITE',
    columns: [['id_interne', 'string'], ['nom_article', 'string'], ['dlc', 'string'], ['date_de_cr_ation', 'timestamp'], ['article_actif', 'boolean']],
  },
  '<cuisinesDatasetId>': { id: 'ds-cuisines', name: 'CUISINES_REFERENTIEL', columns: [['cuisine', 'string']] },
  '<capaciteDatasetId>': {
    id: 'ds-capacite',
    name: 'CAPACITE_CUISINES_JOUR_2025',
    columns: [['cle_cuisine_jour', 'string'], ['cuisine', 'string'], ['date', 'date'], ['capacite_unites', 'integer']],
  },
  '<invendusDatasetId>': {
    id: 'ds-invendus',
    name: 'APP_KIOSQUE_INVENDUS_2025',
    columns: [['id_invendu', 'string'], ['id_interne_client_netsuite', 'string'], ['id_interne_article', 'string'], ['date', 'date'], ['quantite', 'integer']],
  },
};

function load(): WorkspaceDoc {
  let text = readFileSync(file, 'utf8');
  for (const [placeholder, d] of Object.entries(DATASETS)) text = text.split(placeholder).join(d.id);
  const { _note, _assumptions, ...doc } = JSON.parse(text) as Record<string, unknown>;
  void _note;
  void _assumptions;
  return doc as unknown as WorkspaceDoc;
}

const catalog: DatasetCatalog = new Map(Object.values(DATASETS).map((d) => [d.id, d.columns.map(([sqlName, type]) => ({ sqlName, type }))]));
const permissive = { ...stubSemanticsPort, recordExists: async () => true };

describe('W1 expected-workspace.json (Kumo demo)', () => {
  it('parses with the zod schemas and covers the demo script', () => {
    const doc = load();
    expect(workspaceDocSchema.safeParse(doc).success).toBe(true);
    expect(doc.pipelines.map((p) => p.apiName)).toEqual(expect.arrayContaining(['commandes', 'retours', 'production', 'cuisine_jours']));
    expect(doc.objectTypes.map((t) => t.apiName)).toEqual(
      expect.arrayContaining(['Client', 'Article', 'Commande', 'Retour', 'Cuisine', 'CuisineJour', 'LotProduction']),
    );
    expect(doc.logic.map((l) => `${l.objectType}.${l.apiName}`)).toEqual(
      expect.arrayContaining(['Client.tauxRetour', 'Article.tauxRetour', 'CuisineJour.charge', 'CuisineJour.surcharge']),
    );
    expect(doc.actionTypes.map((a) => a.apiName)).toEqual(['ReaffecterProduction', 'DeclarerInvendus']);
    // A link on two keys (W6) and the Frepillon -> Gennevilliers move all point at real properties.
    expect(doc.linkTypes.find((l) => l.apiName === 'cuisineJour')!.keys).toHaveLength(2);
  });

  it('has no structural error and no warning against the dataset columns', () => {
    const v = validateStructure(load(), catalog);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
  });

  it('validates with a permissive semantics port (all term, relation and constraint ids exist)', async () => {
    const v = await validateWorkspace(load(), { projectId: 'p', semantics: permissive, datasets: catalog });
    expect(v.errors).toEqual([]);
  });

  it('applies as draft ops to an empty draft and gives the same document', () => {
    const doc = load();
    expect(applyOps(emptyDoc(doc.semanticVersion), docToOps(doc))).toEqual(doc);
  });

  it('every pipeline compiles to SQL on the dataset columns', () => {
    const doc = load();
    const byId = new Map(Object.values(DATASETS).map((d) => [d.id, d]));
    const resolver: PipelineResolver = {
      dataset: (ref) => {
        const d = byId.get(ref);
        return d
          ? { datasetId: d.id, name: d.name, version: 1, schema: 'data', table: `ds_${d.id.replace(/\W/g, '')}_v1`, columns: d.columns.map(([name, type]) => ({ name, type })) }
          : null;
      },
    };
    for (const p of doc.pipelines) {
      const c = compilePipeline(p, resolver, p.apiName);
      expect(c.errors, p.apiName).toEqual([]);
    }
  });

  it('is caught when a column goes missing', () => {
    const doc = load();
    doc.objectTypes.find((t) => t.apiName === 'Client')!.properties[1]!.column = 'raison_sociale';
    expect(validateStructure(doc, catalog).errors).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_REFERENCE' }));
  });
});
