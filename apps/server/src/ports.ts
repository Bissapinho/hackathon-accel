import type { SemRecord } from '@mini/shared';

// Shared contract between Part A and Part B (09 §4). Changes follow 09 §6.2.

// 09 §4.1 — what Part A needs from the semantic bank. Real implementation: modules/semantics/port.ts (Part B).
export interface SemanticsPort {
  activeVersion(projectId: string): Promise<string | null>; // 'v0', 'v1'… or null if never published
  recordExists(projectId: string, version: string, recordId: string): Promise<boolean>;
  getRecord(projectId: string, version: string, recordId: string): Promise<SemRecord | null>;
}

// Phase 0 stub: a published 'v0' where every reference exists and no record has data.
export const stubSemanticsPort: SemanticsPort = {
  activeVersion: async () => 'v0',
  recordExists: async () => true,
  getRecord: async () => null,
};

// 09 §4.2 — called by Part A's job runner when a dataset version's profile is done; implemented by
// Part B (T-07, minimal semantic cards). An error is logged and recorded on the job, never fails the profile.
export type OnProfileDone = (ctx: { projectId: string; datasetId: string; version: number }) => Promise<void>;

export const stubOnProfileDone: OnProfileDone = async () => {};
