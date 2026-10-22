# Passation — Partie A (Alexandre), 22/10/2026

État du travail de la Partie A (data platform, `build-package/09-work-split.md`) au moment de changer de session.

## 1. Environnement installé sur ce poste

- **Node 24** (`C:\Program Files\nodejs`), **pnpm 10** (`%APPDATA%\npm`), **Docker Desktop** (Postgres 16 dans le conteneur `hackathon-accel-db-1`, port 5432).
- `.env` créé depuis `.env.example` (base locale `mini`, base de test `mini_test`). **`ANTHROPIC_API_KEY` reste à ajouter** (pas nécessaire pour la Partie A avant la répétition).
- Identité git **locale à ce repo** : `Alexandre <alexandregalle3@gmail.com>` (les commits précédents du repo sont signés `stonksinho`).
- Dans le bash de Claude Code, `pnpm` échoue à cause du PATH : passer par PowerShell avec
  `$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;$env:Path"`.
- `npm`/`pnpm`/`winget` ont besoin de sortir du sandbox réseau (sinon `ECONNRESET`).

## 2. Ce qui est fait

### Poussé sur `origin/main` (commit `6499407`) — Alfred peut démarrer

| Tâche | Contenu | Vérifié |
|---|---|---|
| T-01 | Monorepo pnpm (`apps/server`, `packages/shared`), TS strict, ESLint, Vitest, `docker-compose.yml`, `.env.example`, `.gitignore` (données Kumo exclues), `NOTICE` | typecheck, lint |
| T-02 | Runner de migrations (`public.schema_migrations`, verrou, TLS + CA pour Aiven, `MINI_APP_PASSWORD`), `001_init.sql` = `schema.sql`, seed Ada (owner) / Ben (viewer) / « Kumo 2025 » | migrate et seed idempotents en local |
| T-03 | Fastify, `ApiError` + mapping HTTP, login par cookie signé (`GET /api/users`, `POST /api/login`, `POST /api/logout`), `/api/me`, `/api/projects/:pid`, `/api/health`, guard de rôle | tests + serveur réel démarré |
| P0 | `ports.ts` (`SemanticsPort`, `OnProfileDone` + stubs), `agent/tools/types.ts`, `db/readonly.ts` (`withReadOnly`), `register.*`, `services.*`, `agent/tools/index.*`, `agent/registry.ts` | tests |
| — | `pnpm db:wipe --yes` (effacement des données Kumo, 01 §7) | typecheck |
| T-15 | Object sets, query, aggregate, get object avec liens ; tools `query_objects`, `aggregate_objects`, `get_object` | O1, O2 |
| T-12 | Compilateur de pipelines → SQL, preview, checks, `buildPipeline` (pour T-14) ; tool `preview_pipeline` | W2 (codes pipeline), W3 (forme) |

### Sur la branche locale `alexandre/part-a` (non poussée)

Tout ce qui est sur `main` plus :

| Tâche | Contenu | Vérifié |
|---|---|---|
| T-18 | Compilateur de logique → vues `logic.*`, cycles, `test_logic`, `buildLogicViews` (pour T-14), helpers de règles pour les filtres ; tool `test_logic` | L1, L2, partie logique de O1 |
| T-19 | Moteur d'actions (paramètres, modify/create/delete, critères dont `afterEdits`, dry-run, test du brouillon, `edits.*`, journal) ; tools `test_action`, `run_action` (gated), `get_action_log` | A1–A5 (A4 approché) |

Dernier passage : **118 tests verts**. Un premier passage juste avant avait eu **2 échecs intermittents**, non identifiés (voir §4).

## 3. Branches d'agents pas encore fusionnées

Les agents ont travaillé dans des worktrees (`.claude/worktrees/`, ignorés par git).

| Branche | Tâche | État |
|---|---|---|
| `worktree-agent-af74cba07363565c9` | **T-11** brouillon du workspace + **moitié structurelle de T-13** + tools `get_workspace`, `search_ontology`, `edit_draft`, `validate_draft`, `diff_draft`, `discard_draft` | Terminé, 54 tests verts de son côté. **À fusionner** dans `alexandre/part-a` |
| `worktree-agent-a298be7e9dd5a44b7` | **T-05, T-06, T-08** ingestion (upload CSV/CSV.gz, profils en tâche de fond, `matchAgainst`, appel de `onProfileDone`, `pnpm seed:kumo`) + tools `list_datasets`, `get_dataset`, `preview_dataset`, `profile_columns` | Terminé (commit `77a6304`), 43 tests verts (D1–D4) de son côté ; 2,2 M lignes chargées en 13,7 s. **À fusionner** |

Notes de l'agent d'ingestion pour la fusion :
- `AppDeps` reçoit maintenant `pool: pg.Pool` (nécessaire pour `COPY`) ; `main.ts` et `test/helpers.ts` le passent.
- Nouveau `src/wiring.ts` : le port sémantique et le hook utilisés par `main.ts` et le script de seed. C'est **le seul endroit** où remplacer les stubs à l'intégration.
- L'upload fait `SET LOCAL ROLE mini_app` pour que les tables créées appartiennent à `mini_app`, ce qui règle les droits de `mini_reader`. Pipelines, logique et publish devraient faire pareil plutôt que des `GRANT` explicites.
- Écarts à la spec : il n'y a pas de table de staging texte (parsing dans Node puis `COPY` direct dans la table typée), et la preview renvoie les lignes en tableaux.
- Testé sur un échantillon généré (`test/kumo-like.ts`), car Alfred n'avait pas encore poussé `fixtures/kumo-mini/`. Les chiffres exacts de la fixture sont un TODO.

Fusion : `git merge --no-ff <branche>` depuis `alexandre/part-a`. Les conflits sont toujours dans `services.alexandre.ts`, `register.alexandre.ts`, `agent/tools/index.alexandre.ts`, `db/types.ts`, `test/api.test.ts` : **garder les lignes des deux côtés**. Puis `pnpm typecheck && pnpm lint && pnpm test`.

## 4. Points à régler en fusionnant

- **Tests intermittents** : 2 échecs non reproduits au premier `pnpm test` après la fusion de T-19. Probablement deux fichiers qui créent les mêmes tables ou vues (`actions-world.ts`, `logic.test.ts`, `objects-fixture.ts`) dans la base de test partagée. Relancer plusieurs fois et isoler les noms.
- **TODO de fusion laissés par les agents** :
  - pipelines : `getDraftPipeline` lit `meta.workspace_drafts` directement, à remplacer par le service workspace (T-11) ;
  - logic et actions lisent aussi le brouillon directement, et typent les documents sans zod : à brancher sur `modules/workspace/schemas.ts` ;
  - actions : `sqlName()` local dans `modules/actions/evaluate.ts`, à remplacer par `toSqlName()` de `modules/objects/model.ts` ;
  - plusieurs helpers d'erreur de tool (`toToolError`, `result.alexandre.ts`, `part-a-helpers.ts`) à fusionner en un seul ;
  - T-13 (workspace) expose une interface `DataChecker` : y brancher `validatePipelineData` (pipelines) et les colonnes des datasets.
- **Droits `mini_reader`** : en local le serveur se connecte en superuser, donc les tables qu'il crée n'héritent pas des droits par défaut de `mini_app`. Aujourd'hui, pipelines et logique font un `GRANT SELECT` explicite, et T-05 fait `SET LOCAL ROLE mini_app`. Il faut choisir une seule méthode (de préférence `SET LOCAL ROLE mini_app`) et l'appliquer aussi à T-14.

## 5. Ce qui reste à faire (Partie A)

1. **Fusionner T-11/T-13 puis T-05/06/08**, faire passer tous les tests, pousser sur `main`.
2. **T-13** : brancher les contrôles de données (colonnes de datasets, previews de pipeline) dans le `DataChecker`. Tests W1, W2.
3. **T-14 publish** : verrou consultatif (`PUBLISH_IN_PROGRESS`), événements de progression, `buildPipeline` pour chaque pipeline, index, tables `edits.*`, vues `ont.*` avec commentaires, `buildLogicViews`, historique avec version sémantique, rétention des gros datasets. Tests W4, W5, W6. Il assemble les modules pipelines, logic et workspace.
4. **Tools A restants** : `publish_draft` (gated, avec `summarize`), vérifier que les 20 tools de 09 §5 sont tous enregistrés.
5. **T-D1 Aiven** : créer le service (PostgreSQL 16, 1 CPU / 2 Go / 8 Go, région UE), CA dans `var/aiven-ca.pem`, `pnpm db:migrate` en `avnadmin` avec TLS (le critère « URL TLS type Aiven » de T-02 n'est pas encore testé), serveur en `mini_app`, `pnpm seed:kumo` des vrais fichiers. Tests X1, X2. Supabase reste le plan B.
6. **Intégration avec Alfred** (09 §7), puis **T-28** répétitions. Bonus : T-31, T-32.

## 6. À dire à Alfred / à l'équipe front

- **Specs** : les specs restent dans `build-package/`, pas de copie dans `docs/build-package/`. `CLAUDE.md` à la racine le dit.
- **Nouvelles routes de login** : `GET /api/users`, `POST /api/login {email}`, `POST /api/logout`.
- **Fichiers séparés par partie** : `services.alfred.ts` est son fichier de services, sur le même principe que `register.alfred.ts`.
- **Codes d'erreur absents de 04-api §5**, que `prompts/build.md` devra connaître :
  - pipelines : `INVALID_PIPELINE`, `INVALID_NODE`, `PREVIEW_TIMEOUT` ;
  - logique : `LOGIC_TOO_DEEP`, `LOGIC_TEST_FAILED` ;
  - objets : `UNKNOWN_OBJECT_TYPE`, `UNKNOWN_PROPERTY`, `UNKNOWN_RULE`, `UNKNOWN_LINK`, `INVALID_FILTER_VALUE`, `AGGREGATE_TYPE`, `INVALID_PAGE_TOKEN`, `NOTHING_PUBLISHED`, `MIXED_OBJECT_TYPES`, `OBJECT_SET_TOO_DEEP` ;
  - actions : `ACTION_REJECTED` (422) et `ACTION_FAILED` (500).
- **Candidats pour `packages/shared`** (09 §6.2, à valider avec Alfred) : `User`, `Me`, `ObjectWithLinks`, `ActionLogEntry`.
- **`expected-workspace.json` est périmé** : c'est encore la démo tickets, et il ne passe pas les types actuels (W1 ne peut pas l'utiliser). Il est à réécrire pour Kumo ; il appartient à Alexandre.
- **`LogicExpr` n'a pas de concaténation** : impossible de construire une clé composée comme `Frepillon|2025-10-14` (`CuisineJour`) dans un pipeline. Il faut soit ajouter `concat` à `packages/shared` (changement de contrat), soit qu'Alfred ajoute une colonne clé dans le générateur `kumo-mini`.
- **Faits sur la fixture `kumo-mini`** (envoyés par Alfred) :
  - booléens en minuscules `true`/`false` : l'inférence accepte les deux casses ;
  - aucune commande en août ou septembre ;
  - `kumo-mini.facts.json` est à côté du dossier de la fixture, pas dedans.
