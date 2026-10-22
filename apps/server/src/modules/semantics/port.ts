import type { SemanticsPort } from '../../ports.js';
import type { SemanticStore } from './store.js';

// The real SemanticsPort of 09 §4.1: what Part A reads from the bank (meta.sem_versions / meta.sem_records).
export function createSemanticsPort(store: SemanticStore): SemanticsPort {
  return {
    activeVersion: (projectId) => store.activeVersion(projectId),
    recordExists: (projectId, version, recordId) => store.recordExists(projectId, version, recordId),
    getRecord: (projectId, version, recordId) => store.getRecord(projectId, version, recordId),
  };
}
