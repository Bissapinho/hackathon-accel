import { stubOnProfileDone, stubSemanticsPort, type OnProfileDone, type SemanticsPort } from './ports.js';

// The semantics port and profile hook used by the server (main.ts) and the seed script.
// Phase 0 stubs (09 §4.1, §4.2): replaced here, in one place, by Part B's real ones at integration.
export const ports: { semantics: SemanticsPort; onProfileDone: OnProfileDone } = {
  semantics: stubSemanticsPort,
  onProfileDone: stubOnProfileDone,
};
