// Draft operations on the semantic bank (04-api §2, `SemOp`). Applied all-or-nothing:
// one failing operation leaves the draft unchanged.

import type { SemBank } from './bank.js';
import { truncateText } from './trajectory.js';
import type { FieldError, SemOp, SemRecord } from '@mini/shared';
import { LIFECYCLES, SEM_KINDS } from './vocab.js';

export type OpsContext = {
  userId: string;
  now: () => string;
  /**
   * Runs an Evidence query with the read-only role and returns a short summary of its result
   * (T-09 plugs in the SQL module). Without it, query results stay empty.
   */
  runEvidenceQuery?: (query: string) => Promise<string>;
  /** Server-written records (minimal cards from the profile hook) may set Evidence `result` directly. */
  trusted?: boolean;
};

export type OpsOutcome = { ok: true; bank: SemBank } | { ok: false; errors: FieldError[] };

export async function applyOps(bank: SemBank, ops: SemOp[], ctx: OpsContext): Promise<OpsOutcome> {
  const records = new Map(bank.records);
  const errors: FieldError[] = [];
  const fail = (i: number, code: string, message: string) => errors.push({ path: `ops[${i}]`, code, message });

  for (const [i, op] of ops.entries()) {
    switch (op.op) {
      case 'upsertRecord': {
        const { kind, body } = op.record;
        if (!SEM_KINDS.includes(kind)) { fail(i, 'SEM_BAD_VOCABULARY', `Unknown record kind "${String(kind)}".`); break; }
        if (!body || typeof body.id !== 'string' || !body.id.trim()) { fail(i, 'SEM_MISSING_FIELD', 'The record needs an id.'); break; }
        const existing = records.get(body.id);
        if (existing && existing.kind !== kind) {
          fail(i, 'SEM_BAD_REFERENCE', `"${body.id}" is already a ${existing.kind}; use another id for a ${kind}.`);
          break;
        }
        const lifecycle = op.record.lifecycle ?? existing?.lifecycle ?? 'active';
        if (!LIFECYCLES.includes(lifecycle)) { fail(i, 'SEM_BAD_VOCABULARY', `Unknown lifecycle "${lifecycle}".`); break; }
        let next = { kind, lifecycle, body: structuredClone(body) } as SemRecord;
        if (next.kind === 'evidence') next = await groundEvidence(next, ctx);
        records.set(body.id, next);
        break;
      }
      case 'setLifecycle': {
        const r = records.get(op.recordId);
        if (!r) { fail(i, 'SEM_BAD_REFERENCE', `Record "${op.recordId}" doesn't exist in the draft.`); break; }
        if (!LIFECYCLES.includes(op.lifecycle)) { fail(i, 'SEM_BAD_VOCABULARY', `Unknown lifecycle "${op.lifecycle}".`); break; }
        records.set(op.recordId, { ...r, lifecycle: op.lifecycle } as SemRecord);
        break;
      }
      case 'resolveConstraint': {
        const r = records.get(op.recordId);
        if (r?.kind !== 'constraint') { fail(i, 'SEM_BAD_REFERENCE', `"${op.recordId}" is not a constraint of the draft.`); break; }
        const options = r.body.options ?? [];
        if (options.length && !options.includes(op.choice)) {
          fail(i, 'SEM_BAD_VOCABULARY', `"${op.choice}" is not one of the options: ${options.join(' / ')}.`);
          break;
        }
        const resolution = { choice: op.choice, ...(op.note ? { note: op.note } : {}), by: ctx.userId, at: ctx.now() };
        records.set(op.recordId, { ...r, body: { ...r.body, resolution } });
        break;
      }
      case 'remove': {
        if (!records.delete(op.recordId)) fail(i, 'SEM_BAD_REFERENCE', `Record "${op.recordId}" doesn't exist in the draft.`);
        break;
      }
      default:
        fail(i, 'SEM_BAD_VOCABULARY', `Unknown operation "${(op as { op: string }).op}".`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, bank: { version: bank.version, records } };
}

/** The server, not the agent, writes Evidence results: from the query when there is one. */
async function groundEvidence(record: Extract<SemRecord, { kind: 'evidence' }>, ctx: OpsContext): Promise<SemRecord> {
  const body = { ...record.body, timestamp: ctx.now() };
  if (body.query?.trim()) {
    delete body.result;
    if (ctx.runEvidenceQuery) body.result = truncateText(await ctx.runEvidenceQuery(body.query));
  } else if (!ctx.trusted) {
    delete body.result;
  } else if (body.result) {
    body.result = truncateText(body.result);
  }
  return { ...record, body };
}
