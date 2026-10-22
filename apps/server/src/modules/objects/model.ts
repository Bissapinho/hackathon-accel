import type { BaseType, LinkTypeDef, ObjectTypeDef, WorkspaceDoc } from '@mini/shared';
import { ApiError } from '../../errors.js';

// The queryable shape of a published workspace: for each object type, the columns of its
// logic.<type> view (03-data-model §3: view column names = snake_case of the API names).

export type ColumnKind = 'property' | 'derived' | 'rule';
export type ObjectColumn = { apiName: string; sqlName: string; type: BaseType; kind: ColumnKind };

export type ObjectTypeModel = {
  apiName: string;
  sqlName: string;
  displayName: string;
  primaryKey: ObjectColumn;
  title: ObjectColumn;
  columns: Map<string, ObjectColumn>; // by apiName: properties, derived properties and rules
};

// A link seen from one side: forward (from → to) under its apiName, reverse (to → from) under reverseApiName.
export type LinkSide = {
  apiName: string;
  displayName: string;
  source: string; // object type we start from
  target: string; // object type we arrive at
  keys: { sourceProperty: string; targetProperty: string }[];
  reverse: boolean;
};

export type ObjectModel = {
  types: Map<string, ObjectTypeModel>;
  links: Map<string, LinkSide[]>; // by source object type
};

// camelCase / PascalCase API name → snake_case SQL name (03-data-model §8): CuisineJour → cuisine_jour.
export function toSqlName(apiName: string): string {
  return apiName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

export function buildObjectModel(doc: Pick<WorkspaceDoc, 'objectTypes' | 'linkTypes' | 'logic'>): ObjectModel {
  const types = new Map<string, ObjectTypeModel>();
  for (const ot of doc.objectTypes) types.set(ot.apiName, typeModel(ot, doc));
  const links = new Map<string, LinkSide[]>();
  const add = (side: LinkSide) => links.set(side.source, [...(links.get(side.source) ?? []), side]);
  for (const lt of doc.linkTypes) {
    add(forward(lt));
    add(reverse(lt));
  }
  return { types, links };
}

function typeModel(ot: ObjectTypeDef, doc: Pick<WorkspaceDoc, 'logic'>): ObjectTypeModel {
  const columns = new Map<string, ObjectColumn>();
  for (const p of ot.properties) {
    columns.set(p.apiName, { apiName: p.apiName, sqlName: toSqlName(p.apiName), type: p.type, kind: 'property' });
  }
  for (const l of doc.logic.filter((x) => x.objectType === ot.apiName)) {
    columns.set(l.apiName, {
      apiName: l.apiName,
      sqlName: toSqlName(l.apiName),
      type: l.kind === 'rule' ? 'boolean' : l.type,
      kind: l.kind === 'rule' ? 'rule' : 'derived',
    });
  }
  const pk = columns.get(ot.primaryKey);
  const title = columns.get(ot.titleProperty) ?? pk;
  if (!pk || !title) {
    throw new ApiError(500, 'INVALID_PUBLISHED_WORKSPACE', `The object type ${ot.apiName} has no primary key property "${ot.primaryKey}".`);
  }
  return { apiName: ot.apiName, sqlName: toSqlName(ot.apiName), displayName: ot.displayName, primaryKey: pk, title, columns };
}

function forward(lt: LinkTypeDef): LinkSide {
  return {
    apiName: lt.apiName,
    displayName: lt.displayName,
    source: lt.from,
    target: lt.to,
    keys: lt.keys.map((k) => ({ sourceProperty: k.fromProperty, targetProperty: k.toProperty })),
    reverse: false,
  };
}

function reverse(lt: LinkTypeDef): LinkSide {
  return {
    apiName: lt.reverseApiName,
    displayName: lt.reverseDisplayName,
    source: lt.to,
    target: lt.from,
    keys: lt.keys.map((k) => ({ sourceProperty: k.toProperty, targetProperty: k.fromProperty })),
    reverse: true,
  };
}

export function getType(model: ObjectModel, apiName: string): ObjectTypeModel {
  const t = model.types.get(apiName);
  if (!t) {
    const known = [...model.types.keys()].sort().join(', ') || 'none';
    throw new ApiError(404, 'UNKNOWN_OBJECT_TYPE', `There is no published object type "${apiName}".`, {
      hint: `Published object types: ${known}.`,
    });
  }
  return t;
}

export function getColumn(t: ObjectTypeModel, apiName: string, kinds: ColumnKind[] = ['property', 'derived', 'rule']): ObjectColumn {
  const c = t.columns.get(apiName);
  if (!c || !kinds.includes(c.kind)) {
    const known = [...t.columns.values()].filter((x) => kinds.includes(x.kind)).map((x) => x.apiName);
    const onlyRules = kinds.length === 1 && kinds[0] === 'rule';
    throw new ApiError(400, onlyRules ? 'UNKNOWN_RULE' : 'UNKNOWN_PROPERTY',
      `${t.apiName} has no ${onlyRules ? 'rule' : 'property'} "${apiName}".`,
      { hint: `Available: ${known.join(', ') || 'none'}.` });
  }
  return c;
}

export function getLink(model: ObjectModel, source: string, apiName: string): LinkSide {
  const sides = model.links.get(source) ?? [];
  const side = sides.find((s) => s.apiName === apiName);
  if (!side) {
    throw new ApiError(400, 'UNKNOWN_LINK', `${source} has no link "${apiName}".`, {
      hint: `Links of ${source}: ${sides.map((s) => s.apiName).join(', ') || 'none'}.`,
    });
  }
  return side;
}
