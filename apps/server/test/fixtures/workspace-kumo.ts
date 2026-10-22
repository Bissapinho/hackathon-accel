import type { WorkspaceDoc } from '@mini/shared';
import type { DatasetCatalog } from '../../src/modules/workspace/validate.js';

// A small Kumo-shaped workspace document used by the workspace tests until fixtures/expected-workspace.json
// is rewritten for kumo-mini (T-24). Column names follow the kumo-mini files after snake_casing.

export const DS = {
  commandes: '11111111-1111-4111-8111-111111111111',
  clients: '22222222-2222-4222-8222-222222222222',
  capacite: '33333333-3333-4333-8333-333333333333',
};

export function kumoCatalog(): DatasetCatalog {
  return new Map([
    [
      DS.commandes,
      [
        { sqlName: 'no_transaction', type: 'string' },
        { sqlName: 'id_interne_client_netsuite', type: 'string' },
        { sqlName: 'date', type: 'date' },
        { sqlName: 'quantite', type: 'integer' },
        { sqlName: 'lieu_production', type: 'string' },
        { sqlName: 'article', type: 'string' },
      ],
    ],
    [
      DS.clients,
      [
        { sqlName: 'id_interne', type: 'string' },
        { sqlName: 'nom', type: 'string' },
        { sqlName: 'zone', type: 'string' },
        { sqlName: 'actif', type: 'boolean' },
      ],
    ],
    [
      DS.capacite,
      [
        { sqlName: 'cle', type: 'string' },
        { sqlName: 'cuisine', type: 'string' },
        { sqlName: 'date', type: 'date' },
        { sqlName: 'service', type: 'string' },
        { sqlName: 'capacite', type: 'integer' },
      ],
    ],
  ]);
}

const prop = (apiName: string, column: string, type: 'string' | 'integer' | 'date' | 'boolean', editable = false) => ({
  apiName,
  column,
  type,
  displayName: apiName,
  description: `The ${apiName} of the object.`,
  aliases: [],
  editable,
});

export function kumoWorkspace(): WorkspaceDoc {
  return {
    semanticVersion: 'v0',
    pipelines: [
      {
        apiName: 'commandes',
        description: 'One row per sales order, rolled up from order lines.',
        terms: ['T_commande'],
        nodes: [
          { id: 'src', kind: 'source', datasetId: DS.commandes },
          { id: 'so', kind: 'filter', input: 'src', where: { kind: 'cmp', property: 'no_transaction', op: 'startsWith', value: 'SO-' } },
          {
            id: 'doc',
            kind: 'aggregate',
            input: 'so',
            groupBy: ['no_transaction', 'id_interne_client_netsuite', 'date'],
            measures: [
              { as: 'lignes', fn: 'count' },
              { as: 'quantite', fn: 'sum', column: 'quantite' },
            ],
          },
        ],
        outputs: [{ apiName: 'commandes', node: 'doc' }],
        checks: [{ output: 'commandes', kind: 'unique', columns: ['no_transaction'] }],
      },
      {
        apiName: 'production_lots',
        description: 'One production lot per order produced in a kitchen.',
        nodes: [
          { id: 'src', kind: 'source', datasetId: DS.commandes },
          { id: 'produced', kind: 'filter', input: 'src', where: { kind: 'cmp', property: 'lieu_production', op: 'notNull' } },
          {
            id: 'lots',
            kind: 'aggregate',
            input: 'produced',
            groupBy: ['no_transaction', 'lieu_production', 'date'],
            measures: [{ as: 'quantite', fn: 'sum', column: 'quantite' }],
          },
          { id: 'named', kind: 'rename', input: 'lots', map: { date: 'date_production' } },
        ],
        outputs: [{ apiName: 'lots', node: 'named' }],
        checks: [{ output: 'lots', kind: 'notNull', columns: ['lieu_production'] }],
      },
    ],
    objectTypes: [
      {
        apiName: 'Commande',
        displayName: 'Commande',
        pluralDisplayName: 'Commandes',
        description: 'A sales order placed by a client.',
        aliases: ['order', 'SO'],
        term: 'T_commande',
        source: { kind: 'pipeline', pipeline: 'commandes', output: 'commandes' },
        primaryKey: 'noTransaction',
        titleProperty: 'noTransaction',
        status: 'active',
        properties: [
          prop('noTransaction', 'no_transaction', 'string'),
          prop('clientId', 'id_interne_client_netsuite', 'string'),
          prop('date', 'date', 'date'),
          prop('quantite', 'quantite', 'integer'),
        ],
      },
      {
        apiName: 'Client',
        displayName: 'Client',
        pluralDisplayName: 'Clients',
        description: 'A company that orders meals.',
        aliases: ['customer'],
        term: 'T_client',
        source: { kind: 'dataset', datasetId: DS.clients },
        primaryKey: 'clientId',
        titleProperty: 'nom',
        status: 'active',
        properties: [prop('clientId', 'id_interne', 'string'), prop('nom', 'nom', 'string'), prop('zone', 'zone', 'string')],
      },
      {
        apiName: 'LotProduction',
        displayName: 'Lot de production',
        pluralDisplayName: 'Lots de production',
        description: 'The meals of one order produced in one kitchen on one day.',
        aliases: ['lot'],
        term: 'T_lot_production',
        source: { kind: 'pipeline', pipeline: 'production_lots', output: 'lots' },
        primaryKey: 'lotId',
        titleProperty: 'lotId',
        status: 'active',
        properties: [
          prop('lotId', 'no_transaction', 'string'),
          prop('lieuProduction', 'lieu_production', 'string', true),
          prop('dateProduction', 'date_production', 'date'),
          prop('quantite', 'quantite', 'integer'),
        ],
      },
      {
        apiName: 'CuisineJour',
        displayName: 'Cuisine-jour',
        pluralDisplayName: 'Cuisines-jours',
        description: 'One kitchen on one day, with its capacity.',
        aliases: ['kitchen day'],
        term: 'T_cuisine_jour',
        source: { kind: 'dataset', datasetId: DS.capacite },
        primaryKey: 'cle',
        titleProperty: 'cle',
        status: 'active',
        properties: [
          prop('cle', 'cle', 'string'),
          prop('cuisine', 'cuisine', 'string'),
          prop('date', 'date', 'date'),
          prop('capacite', 'capacite', 'integer'),
        ],
      },
    ],
    linkTypes: [
      {
        apiName: 'client',
        from: 'Commande',
        to: 'Client',
        cardinality: 'many-to-one',
        keys: [{ fromProperty: 'clientId', toProperty: 'clientId' }],
        relation: 'R_commande_client',
        displayName: 'Client',
        reverseApiName: 'commandes',
        reverseDisplayName: 'Commandes',
        description: 'The client who placed the order.',
      },
      {
        apiName: 'cuisineJour',
        from: 'LotProduction',
        to: 'CuisineJour',
        cardinality: 'many-to-one',
        keys: [
          { fromProperty: 'lieuProduction', toProperty: 'cuisine' },
          { fromProperty: 'dateProduction', toProperty: 'date' },
        ],
        relation: 'R_lot_cuisine_jour',
        displayName: 'Cuisine-jour',
        reverseApiName: 'lots',
        reverseDisplayName: 'Lots',
        description: 'The kitchen and day where the lot is produced.',
      },
    ],
    logic: [
      {
        apiName: 'nbCommandes',
        objectType: 'Client',
        kind: 'derived',
        type: 'integer',
        expr: { aggregate: { link: 'commandes', fn: 'count' } },
        displayName: 'Nombre de commandes',
        description: 'How many orders the client placed.',
      },
      {
        apiName: 'charge',
        objectType: 'CuisineJour',
        kind: 'derived',
        type: 'integer',
        expr: { coalesce: [{ aggregate: { link: 'lots', fn: 'sum', property: 'quantite' } }, { literal: 0 }] },
        displayName: 'Charge',
        description: 'Meals planned in this kitchen on this day.',
      },
      {
        apiName: 'surcharge',
        objectType: 'CuisineJour',
        kind: 'rule',
        condition: { kind: 'cmpProps', left: 'charge', op: 'gt', right: 'capacite' },
        displayName: 'En surcharge',
        description: 'More meals planned than the kitchen can produce.',
        constraints: ['C_capacite_cuisine'],
      },
    ],
    actionTypes: [
      {
        apiName: 'ReaffecterProduction',
        displayName: 'Réaffecter une production',
        description: 'Move a production lot to another kitchen.',
        agentDescription: 'Use to move a lot to another kitchen; refused if the target kitchen would be over capacity.',
        parameters: [
          { id: 'lot', kind: 'object', objectType: 'LotProduction', displayName: 'Lot', description: 'The lot to move.', required: true },
          {
            id: 'cible',
            kind: 'value',
            type: 'string',
            allowedValues: ['Gennevilliers', 'Frepillon', 'Draveil'],
            displayName: 'Cuisine cible',
            description: 'Where to produce it.',
            required: true,
          },
        ],
        rules: [{ kind: 'modifyObject', object: 'lot', set: { lieuProduction: { kind: 'param', param: 'cible' } } }],
        submissionCriteria: [
          {
            kind: 'rule',
            objectType: 'CuisineJour',
            rule: 'surcharge',
            object: {
              kind: 'lookup',
              objectType: 'CuisineJour',
              keys: { cuisine: { kind: 'param', param: 'cible' }, date: { kind: 'paramProperty', param: 'lot', property: 'dateProduction' } },
            },
            expect: false,
            afterEdits: true,
            failureMessage: '{{cible}} would be over capacity.',
          },
        ],
        successMessage: 'Lot {{lot.lotId}} now produced in {{cible}}.',
      },
    ],
    apps: [],
    automations: [],
  };
}
