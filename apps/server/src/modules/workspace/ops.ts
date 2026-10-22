import type { DraftOp, EntityKind, FieldError, WorkspaceDoc } from '@mini/shared';
import { ApiError } from '../../errors.js';

// Pure application of DraftOp[] to a WorkspaceDoc (04-api §3). All or nothing: the first op that can't
// apply rejects the whole batch with 422 and the op's index. Ops never validate the result; validation does.

export function emptyDoc(semanticVersion: string): WorkspaceDoc {
  return {
    semanticVersion,
    pipelines: [],
    objectTypes: [],
    linkTypes: [],
    logic: [],
    actionTypes: [],
    apps: [],
    automations: [],
  };
}

export function applyOps(doc: WorkspaceDoc, ops: DraftOp[]): WorkspaceDoc {
  const next = structuredClone(doc);
  ops.forEach((op, i) => {
    const problem = applyOne(next, op);
    if (problem) {
      const detail: FieldError = { path: `ops[${i}]`, code: 'UNKNOWN_REFERENCE', message: problem };
      throw new ApiError(422, 'OP_REJECTED', `Operation ${i + 1} (${op.op}) can't be applied: ${problem}`, {
        hint: 'Read the draft with get_workspace and fix the names; no operation of this batch was applied.',
        details: [detail],
      });
    }
  });
  return next;
}

// Replace the item with the same key, or append it.
function upsert<T>(list: T[], value: T, key: (t: T) => string): void {
  const i = list.findIndex((t) => key(t) === key(value));
  if (i >= 0) list[i] = value;
  else list.push(value);
}

function applyOne(doc: WorkspaceDoc, op: DraftOp): string | null {
  switch (op.op) {
    case 'upsertPipeline':
      upsert(doc.pipelines, op.value, (p) => p.apiName);
      return null;
    case 'upsertObjectType':
      upsert(doc.objectTypes, op.value, (t) => t.apiName);
      return null;
    case 'upsertProperty': {
      const type = doc.objectTypes.find((t) => t.apiName === op.objectType);
      if (!type) return `there is no object type "${op.objectType}" in the draft`;
      upsert(type.properties, op.value, (p) => p.apiName);
      return null;
    }
    case 'upsertLinkType':
      // Link names are unique per "from" type.
      upsert(doc.linkTypes, op.value, (l) => `${l.from}.${l.apiName}`);
      return null;
    case 'upsertLogic':
      upsert(doc.logic, op.value, (l) => `${l.objectType}.${l.apiName}`);
      return null;
    case 'upsertActionType':
      upsert(doc.actionTypes, op.value, (a) => a.apiName);
      return null;
    case 'upsertApp':
      upsert(doc.apps, op.value, (a) => a.id);
      return null;
    case 'upsertAutomation':
      upsert(doc.automations, op.value, (a) => a.id);
      return null;
    case 'remove':
      return remove(doc, op.kind, op.apiName, op.objectType);
    case 'setMetadata': {
      const target = findMetadataTarget(doc, op.target.kind, op.target.apiName, op.target.objectType);
      if (typeof target === 'string') return target;
      if (op.field === 'aliases') {
        if (!Array.isArray(op.value)) return 'aliases must be a list of words';
        if (!('aliases' in target)) return `a ${op.target.kind} has no aliases`;
        target.aliases = op.value;
      } else {
        if (typeof op.value !== 'string') return `${op.field} must be text`;
        target[op.field] = op.value;
      }
      return null;
    }
    case 'setSemanticVersion':
      doc.semanticVersion = op.version;
      return null;
  }
}

function removeWhere<T>(list: T[], pred: (t: T) => boolean): boolean {
  const i = list.findIndex(pred);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

function remove(doc: WorkspaceDoc, kind: EntityKind, apiName: string, objectType?: string): string | null {
  const missing = `there is no ${kind} "${objectType ? `${objectType}.` : ''}${apiName}" in the draft`;
  switch (kind) {
    case 'pipeline':
      return removeWhere(doc.pipelines, (p) => p.apiName === apiName) ? null : missing;
    case 'objectType':
      return removeWhere(doc.objectTypes, (t) => t.apiName === apiName) ? null : missing;
    case 'property': {
      if (!objectType) return 'removing a property needs its objectType';
      const type = doc.objectTypes.find((t) => t.apiName === objectType);
      if (!type) return `there is no object type "${objectType}" in the draft`;
      return removeWhere(type.properties, (p) => p.apiName === apiName) ? null : missing;
    }
    case 'linkType': {
      const matches = doc.linkTypes.filter((l) => l.apiName === apiName && (!objectType || l.from === objectType));
      if (matches.length > 1) return `several links are named "${apiName}"; give objectType (the link's "from" type)`;
      return removeWhere(doc.linkTypes, (l) => l === matches[0]) ? null : missing;
    }
    case 'logic': {
      const matches = doc.logic.filter((l) => l.apiName === apiName && (!objectType || l.objectType === objectType));
      if (matches.length > 1) return `several logic items are named "${apiName}"; give objectType`;
      return removeWhere(doc.logic, (l) => l === matches[0]) ? null : missing;
    }
    case 'actionType':
      return removeWhere(doc.actionTypes, (a) => a.apiName === apiName) ? null : missing;
    case 'app':
      return removeWhere(doc.apps, (a) => a.id === apiName) ? null : missing;
    case 'automation':
      return removeWhere(doc.automations, (a) => a.id === apiName) ? null : missing;
  }
}

type MetadataTarget = { description: string; displayName: string; aliases?: string[] };

function findMetadataTarget(
  doc: WorkspaceDoc,
  kind: 'objectType' | 'property' | 'linkType' | 'logic' | 'actionType',
  apiName: string,
  objectType?: string,
): MetadataTarget | string {
  const missing = `there is no ${kind} "${objectType ? `${objectType}.` : ''}${apiName}" in the draft`;
  let found: MetadataTarget | undefined;
  switch (kind) {
    case 'objectType':
      found = doc.objectTypes.find((t) => t.apiName === apiName);
      break;
    case 'property': {
      if (!objectType) return 'a property target needs its objectType';
      found = doc.objectTypes.find((t) => t.apiName === objectType)?.properties.find((p) => p.apiName === apiName);
      break;
    }
    case 'linkType': {
      const matches = doc.linkTypes.filter((l) => l.apiName === apiName && (!objectType || l.from === objectType));
      if (matches.length > 1) return `several links are named "${apiName}"; give objectType`;
      found = matches[0];
      break;
    }
    case 'logic': {
      const matches = doc.logic.filter((l) => l.apiName === apiName && (!objectType || l.objectType === objectType));
      if (matches.length > 1) return `several logic items are named "${apiName}"; give objectType`;
      found = matches[0];
      break;
    }
    case 'actionType':
      found = doc.actionTypes.find((a) => a.apiName === apiName);
      break;
  }
  return found ?? missing;
}

// The ops that build `doc` from an empty document (used by tests and the mock script).
export function docToOps(doc: WorkspaceDoc): DraftOp[] {
  return [
    { op: 'setSemanticVersion', version: doc.semanticVersion },
    ...doc.pipelines.map((value): DraftOp => ({ op: 'upsertPipeline', value })),
    ...doc.objectTypes.map((value): DraftOp => ({ op: 'upsertObjectType', value })),
    ...doc.linkTypes.map((value): DraftOp => ({ op: 'upsertLinkType', value })),
    ...doc.logic.map((value): DraftOp => ({ op: 'upsertLogic', value })),
    ...doc.actionTypes.map((value): DraftOp => ({ op: 'upsertActionType', value })),
    ...doc.apps.map((value): DraftOp => ({ op: 'upsertApp', value })),
    ...doc.automations.map((value): DraftOp => ({ op: 'upsertAutomation', value })),
  ];
}
