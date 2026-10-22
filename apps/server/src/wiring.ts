import type { Db } from './db/index.js';
import { createOnProfileDone, createSemanticsPort, SemanticStore } from './modules/semantics/index.js';
import type { OnProfileDone, SemanticsPort } from './ports.js';

// The semantics port and profile hook used by the server (main.ts) and the seed script (09 §7 step 1):
// Part B's real SemanticsPort (09 §4.1) and the minimal semantic cards as the onProfileDone hook (§4.2).
// The store keeps no state, so this instance and the one in services.alfred.ts see the same bank.
export function buildPorts(db: Db): { semantics: SemanticsPort; onProfileDone: OnProfileDone } {
  const store = new SemanticStore(db);
  return { semantics: createSemanticsPort(store), onProfileDone: createOnProfileDone({ db, store }) };
}
