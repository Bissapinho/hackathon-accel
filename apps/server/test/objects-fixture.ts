import type { BaseType, LinkTypeDef, LogicDef, ObjectTypeDef, PropertyDef, WorkspaceDoc } from '@mini/shared';

// A small published workspace for the objects tests (T-15), Kumo-shaped: commandes and clients
// (single key), production lots linked to kitchen-days (composite key), a derived property and a rule.

const prop = (apiName: string, type: BaseType = 'string'): PropertyDef => ({
  apiName, column: apiName, type, displayName: apiName, description: apiName, aliases: [], editable: false,
});

const objectType = (apiName: string, primaryKey: string, properties: PropertyDef[], titleProperty = primaryKey): ObjectTypeDef => ({
  apiName, displayName: apiName, pluralDisplayName: `${apiName}s`, description: apiName, aliases: [],
  source: { kind: 'dataset', datasetId: '00000000-0000-4000-8000-000000000000' },
  primaryKey, titleProperty, properties, status: 'active',
});

const link = (l: Omit<LinkTypeDef, 'cardinality' | 'description'>): LinkTypeDef => ({ ...l, cardinality: 'many-to-one', description: '' });

const logic: LogicDef[] = [
  { apiName: 'nbCommandes', objectType: 'Client', displayName: 'Nombre de commandes', description: '', kind: 'derived', type: 'integer',
    expr: { aggregate: { link: 'commandes', fn: 'count' } } },
  { apiName: 'tauxCharge', objectType: 'CuisineJour', displayName: 'Taux de charge', description: '', kind: 'derived', type: 'double',
    expr: { div: [{ property: 'charge' }, { property: 'capacite' }] } },
  { apiName: 'surcharge', objectType: 'CuisineJour', displayName: 'En surcharge', description: '', kind: 'rule',
    condition: { kind: 'cmpProps', left: 'charge', op: 'gt', right: 'capacite' } },
];

export const objectsDoc: WorkspaceDoc = {
  semanticVersion: 'v0',
  pipelines: [],
  objectTypes: [
    objectType('Client', 'clientId', [prop('clientId'), prop('nom'), prop('zone')], 'nom'),
    objectType('Commande', 'noTransaction', [prop('noTransaction'), prop('clientId'), prop('quantite', 'integer'), prop('date', 'date')]),
    objectType('CuisineJour', 'cle', [prop('cle'), prop('lieu'), prop('jour', 'date'), prop('charge', 'integer'), prop('capacite', 'integer')]),
    objectType('LotProduction', 'lotId', [prop('lotId'), prop('lieuProduction'), prop('jour', 'date')]),
  ],
  linkTypes: [
    link({ apiName: 'client', from: 'Commande', to: 'Client', keys: [{ fromProperty: 'clientId', toProperty: 'clientId' }],
      displayName: 'Client', reverseApiName: 'commandes', reverseDisplayName: 'Commandes' }),
    link({ apiName: 'cuisineJour', from: 'LotProduction', to: 'CuisineJour',
      keys: [{ fromProperty: 'lieuProduction', toProperty: 'lieu' }, { fromProperty: 'jour', toProperty: 'jour' }],
      displayName: 'Cuisine du jour', reverseApiName: 'lots', reverseDisplayName: 'Lots' }),
  ],
  logic,
  actionTypes: [],
  apps: [],
  automations: [],
};

// Hand-made data + logic views standing in for what publish (T-14) and the logic compiler (T-18) will build.
export const objectsSetupSql = `
DROP VIEW IF EXISTS logic.client, logic.commande, logic.cuisine_jour, logic.lot_production CASCADE;
DROP TABLE IF EXISTS data.t15_client, data.t15_commande, data.t15_cuisine_jour, data.t15_lot CASCADE;

CREATE TABLE data.t15_client (client_id text, nom text, zone text);
INSERT INTO data.t15_client VALUES ('C001','Alpha','IDF'), ('C002','Beta','LYON'), ('C003','Gamma','IDF');

CREATE TABLE data.t15_commande (no_transaction text, client_id text, quantite integer, date date);
INSERT INTO data.t15_commande VALUES
  ('SO-1','C001',5,'2025-10-01'), ('SO-2','C001',3,'2025-10-02'), ('SO-3','C002',7,'2025-10-03'), ('RMA-1','C001',-2,'2025-10-04');

CREATE TABLE data.t15_cuisine_jour (lieu text, jour date, charge integer, capacite integer);
INSERT INTO data.t15_cuisine_jour VALUES
  ('Gennevilliers','2025-10-14',90,100), ('Frepillon','2025-10-14',130,100), ('Draveil','2025-10-14',50,100),
  ('Frepillon','2025-10-15',80,100);

CREATE TABLE data.t15_lot (lot_id text, lieu_production text, jour date);
INSERT INTO data.t15_lot VALUES ('L1','Frepillon','2025-10-14'), ('L2','Frepillon','2025-10-14'), ('L3','Gennevilliers','2025-10-14'), ('L4','Frepillon','2025-10-15');

CREATE VIEW logic.client AS
  SELECT c.client_id, c.nom, c.zone,
         (SELECT count(*) FROM data.t15_commande x WHERE x.client_id = c.client_id)::int AS nb_commandes
  FROM data.t15_client c;
CREATE VIEW logic.commande AS SELECT no_transaction, client_id, quantite, date FROM data.t15_commande;
CREATE VIEW logic.cuisine_jour AS
  SELECT lieu || '|' || jour AS cle, lieu, jour, charge, capacite,
         charge::float8 / NULLIF(capacite, 0) AS taux_charge, charge > capacite AS surcharge
  FROM data.t15_cuisine_jour;
CREATE VIEW logic.lot_production AS SELECT lot_id, lieu_production, jour FROM data.t15_lot;
`;
