import type { AppDeps } from '../../services.js';
import { createSemanticsPort } from './port.js';
import { SemanticStore, type StoreOptions } from './store.js';

export {
  CardsError, createOnProfileDone, createProfileCards, type CardsDeps, type CardsResult, type ProfileCardsHook,
} from './cards.js';
export { createSemanticsPort } from './port.js';
export { SemanticStore, type Actor, type LoadedVersion, type StoreOptions, type VersionRef } from './store.js';

// Part B's semantic bank: the store (service of this module) and the real SemanticsPort for Part A.
// Wired by services.alfred.ts / main.ts at integration (09 §7); the onProfileDone hook of 09 §4.2 is
// createOnProfileDone({ db, store: semantics }) from cards.ts.
export function buildSemanticsServices(deps: Pick<AppDeps, 'db'>, opts: StoreOptions = {}) {
  const semantics = new SemanticStore(deps.db, opts);
  return { semantics, semanticsPort: createSemanticsPort(semantics) };
}
