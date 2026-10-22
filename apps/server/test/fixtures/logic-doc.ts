import type { LinkTypeDef, LogicDef, ObjectTypeDef, PropertyDef } from '@mini/shared';
import type { LogicDoc } from '../../src/modules/logic/model.js';

// A small Kumo-shaped document for the logic tests: clients and their orders (L1),
// kitchen-days and the production lots linked by a composite key (L2).
// Type names are prefixed "Lg" so their ont/logic views don't clash with other test files.

const prop = (apiName: string, type: PropertyDef['type'], column = apiName.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)): PropertyDef => ({
  apiName,
  column,
  type,
  displayName: apiName,
  description: `The ${apiName}.`,
  aliases: [],
  editable: false,
});

const objectType = (apiName: string, primaryKey: string, properties: PropertyDef[]): ObjectTypeDef => ({
  apiName,
  displayName: apiName,
  pluralDisplayName: `${apiName}s`,
  description: `A ${apiName}.`,
  aliases: [],
  source: { kind: 'pipeline', pipeline: 'test', output: apiName.toLowerCase() },
  primaryKey,
  titleProperty: primaryKey,
  properties,
  status: 'active',
});

const link = (apiName: string, from: string, to: string, keys: LinkTypeDef['keys'], reverseApiName: string): LinkTypeDef => ({
  apiName,
  from,
  to,
  cardinality: 'many-to-one',
  keys,
  displayName: apiName,
  reverseApiName,
  reverseDisplayName: reverseApiName,
  description: `${from} → ${to}.`,
});

const derived = (objectType: string, apiName: string, type: PropertyDef['type'], expr: Extract<LogicDef, { kind: 'derived' }>['expr']): LogicDef => ({
  apiName,
  objectType,
  displayName: apiName,
  description: `Computed ${apiName}.`,
  kind: 'derived',
  type,
  expr,
});

const rule = (objectType: string, apiName: string, condition: Extract<LogicDef, { kind: 'rule' }>['condition']): LogicDef => ({
  apiName,
  objectType,
  displayName: apiName,
  description: `Rule ${apiName}.`,
  kind: 'rule',
  condition,
});

export function logicTestDoc(): LogicDoc {
  return {
    objectTypes: [
      objectType('LgClient', 'clientId', [prop('clientId', 'string'), prop('nom', 'string')]),
      objectType('LgCommande', 'commandeId', [
        prop('commandeId', 'string'),
        prop('clientId', 'string'),
        prop('statut', 'string'),
        prop('montant', 'double'),
      ]),
      objectType('LgCuisineJour', 'cle', [
        prop('cle', 'string'),
        prop('lieu', 'string'),
        prop('jour', 'date'),
        prop('capacite', 'integer'),
      ]),
      objectType('LgLot', 'lotId', [
        prop('lotId', 'string'),
        prop('lieu', 'string'),
        prop('jour', 'date'),
        prop('quantite', 'integer'),
      ]),
    ],
    linkTypes: [
      link('client', 'LgCommande', 'LgClient', [{ fromProperty: 'clientId', toProperty: 'clientId' }], 'commandes'),
      link(
        'cuisineJour',
        'LgLot',
        'LgCuisineJour',
        [
          { fromProperty: 'lieu', toProperty: 'lieu' },
          { fromProperty: 'jour', toProperty: 'jour' },
        ],
        'lots',
      ),
    ],
    logic: [
      derived('LgClient', 'nbLivrees', 'integer', {
        aggregate: { link: 'commandes', fn: 'count', where: { kind: 'cmp', property: 'statut', op: 'eq', value: 'livree' } },
      }),
      derived('LgClient', 'nbRetours', 'integer', {
        aggregate: { link: 'commandes', fn: 'count', where: { kind: 'cmp', property: 'statut', op: 'eq', value: 'retournee' } },
      }),
      derived('LgClient', 'tauxRetour', 'double', { div: [{ property: 'nbRetours' }, { property: 'nbLivrees' }] }),
      rule('LgClient', 'retoursEleves', { kind: 'cmp', property: 'tauxRetour', op: 'gt', value: 0.3 }),
      derived('LgCuisineJour', 'charge', 'integer', {
        coalesce: [{ aggregate: { link: 'lots', fn: 'sum', property: 'quantite' } }, { literal: 0 }],
      }),
      rule('LgCuisineJour', 'surcharge', { kind: 'cmpProps', left: 'charge', op: 'gt', right: 'capacite' }),
    ],
  };
}
