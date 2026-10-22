import type { BaseType, LinkTypeDef, LogicDef, ObjectTypeDef, PropertyDef, WorkspaceDoc } from '@mini/shared';

// Lookups over the workspace document used by the logic compiler and validation.
// Only the parts the logic needs: object types, links and logic (pipelines and actions are other modules').
export type LogicDoc = Pick<WorkspaceDoc, 'objectTypes' | 'linkTypes' | 'logic'>;

// What a name used in an expression or filter of an object type stands for.
export type Member =
  | { kind: 'property'; def: PropertyDef; type: BaseType }
  | { kind: 'derived'; def: Extract<LogicDef, { kind: 'derived' }>; type: BaseType }
  | { kind: 'rule'; def: Extract<LogicDef, { kind: 'rule' }>; type: 'boolean' };

// A link followed from an object type, forward (`from` holds the key) or reverse (`reverseApiName`).
export type ResolvedLink = {
  def: LinkTypeDef;
  direction: 'forward' | 'reverse';
  target: string; // object type reached
  // pairs of (property on the current type, property on the target type)
  keys: { here: string; there: string }[];
};

export function findType(doc: LogicDoc, apiName: string): ObjectTypeDef | undefined {
  return doc.objectTypes.find((t) => t.apiName === apiName);
}

export function logicOf(doc: LogicDoc, objectType: string): LogicDef[] {
  return doc.logic.filter((l) => l.objectType === objectType);
}

export function findMember(doc: LogicDoc, objectType: string, name: string): Member | undefined {
  const type = findType(doc, objectType);
  const prop = type?.properties.find((p) => p.apiName === name);
  if (prop) return { kind: 'property', def: prop, type: prop.type };
  const l = doc.logic.find((x) => x.objectType === objectType && x.apiName === name);
  if (!l) return undefined;
  return l.kind === 'derived' ? { kind: 'derived', def: l, type: l.type } : { kind: 'rule', def: l, type: 'boolean' };
}

export function resolveLink(doc: LogicDoc, objectType: string, name: string): ResolvedLink | undefined {
  const forward = doc.linkTypes.find((l) => l.from === objectType && l.apiName === name);
  if (forward) {
    return {
      def: forward,
      direction: 'forward',
      target: forward.to,
      keys: forward.keys.map((k) => ({ here: k.fromProperty, there: k.toProperty })),
    };
  }
  const reverse = doc.linkTypes.find((l) => l.to === objectType && l.reverseApiName === name);
  if (reverse) {
    return {
      def: reverse,
      direction: 'reverse',
      target: reverse.from,
      keys: reverse.keys.map((k) => ({ here: k.toProperty, there: k.fromProperty })),
    };
  }
  return undefined;
}
