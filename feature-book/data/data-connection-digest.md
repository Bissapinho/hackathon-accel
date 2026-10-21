# Crawl digest

Sources: out-f/data-ingestion-app

## Screen kinds (6)

### /workspace/data-ingestion-app/agents
- title: All agents | Data Connection
- reached by: Agents | Agents > Health | Agents > Version
- fields: Search by agent name, ID, hash… · checkbox
- columns: Name · Health · Version · Manager · Lifecycle · Actions
- empty states: No agents found.
- controls: New agent · Collapse · Name · Health · Version · Manager
- calls: POST /people/api/personal/get-favorites · GET /magritte-coordinator/api/agents · GET /magritte-coordinator/api/batch/agent/healthstatus · GET /magritte-coordinator/api/bootvisor/status

### /workspace/data-ingestion-app/external-stacks
- title: External Stacks | Data Connection
- reached by: External stacks
- headings: No external stacks
- columns: Name · Created · Source · Destination
- empty states: No external stacks
- calls: GET /magritte-coordinator/api/external-stack/rids/all · GET /magritte-coordinator/api/external-stack/front-end-preload-info · POST /magritte-coordinator/api/external-stack/metadata/bulk-load

### /workspace/data-ingestion-app/listeners
- title: All listeners | Data Connection
- reached by: Listeners
- headings: No listeners found
- fields: Search for listener by name…
- columns: Name · Output · Status · Actions
- empty states: No listeners found
- controls: New listener · Collapse
- calls: POST /graphql-gateway/api/bulk

### /workspace/data-ingestion-app/sources
- title: All sources | Data Connection
- reached by: Sources | Sources > Name | Sources > Collapse
- headings: No sources
- fields: Search for source by name… · Search for source types
- columns: Name · Connection type · Sync count · Actions · Favorite
- empty states: No sources Either no sources exist or you don't have permission to access them. Please create a new 
- controls: Collapse · Name · Favorite · Expand
- calls: POST /people/api/personal/get-favorites · GET /magritte-coordinator/api/source-store/sources/types · POST /graphql-gateway/api/bulk

### /workspace/data-ingestion-app/splash  [dialog: What's new in Data Connection]
- title: Data Connection
- reached by: (root) | Navigation link to Data Connection home page | 0 3 0
- headings: Data Connection · Set up new connections · You have no recent files · Explore reference examples · Connecting to AWS S3 · Connecting to Postgres · Register an LLM using function interfaces · What's new in Data Connection · Foundry Worker data ingest and export, media, and Iceberg extract operations available without compu · You have no favorites
- fields: checkbox
- columns: FILES · CREATOR · LAST EDITED BY · LAST VIEWED · LAST MODIFIED
- empty states: FILES CREATOR LAST EDITED BY LAST VIEWED You have no recent files · You have no recent files · You're all caught up! · FILES CREATOR LAST EDITED BY LAST MODIFIED You have no favorites · You have no favorites
- controls: Go to all platform updates · Close · Clear all · rea_open_tickets 1 of 1 jobs succeeded · Ran for 33s · 3h ago · Remove monitored item · all_orders 0 of 1 jobs succeeded · Ran for 1s · 3h ago · all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago
- overlays: What's new in Data Connection Data connectivity & integration Data Connection Feature Oct 16, 2026 F ‖ MONITORED ITEMS Clear all rea_open_tickets 1 of 1 jobs succeeded · Ran for 33s · 3h ago all_orders 0
- calls: GET /multipass/api/sessions/definitions/current · GET /magritte-coordinator/api/extract-store/extracts/source · GET /magritte-coordinator/api/source-store/sources/types · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /magritte-coordinator/api/external-stack/front-end-preload-info · GET /monocle/api/settings/monitored-items · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/bulk · GET /job-tracker/api/builds/{rid} · GET /workspace/api/lifecycleStatusByApplication · POST /documentation/api/v2/release-notes/paginationV2 · GET /marketplace/api/installation-app-service/{rid}/blockSet/version/{uuid}/attachments/{uuid}/use-cookie-auth

### /workspace/data-ingestion-app/syncs
- title: All syncs | Data Connection
- reached by: Syncs | Syncs > Dataset | Syncs > Status
- headings: No syncs
- fields: Search by sync, source or dataset… · checkbox · Search…
- columns: Name · Dataset · Source · Status · Next run · Actions
- empty states: No syncs Please create a sync from a source page or modify the active filters
- controls: Collapse · Name · Dataset · Status · Next run
- calls: POST /people/api/personal/get-favorites

## Actions not clicked (mutating, 8)

Close · Favorite · Input or generate data Synthesize a small quantity of data so you can start pipe · New agent · New listener · New source · Next run · Upload static data Manually upload a one-off extract from your production system

## Screenshots (6)

- out-f/data-ingestion-app/shots/01-dialog-what-s-new-in-data-connection.jpg — dialog:/workspace/data-ingestion-app/splash|What's new in Data Connection
- out-f/data-ingestion-app/shots/02-all-sources-data-connection.jpg — page:/workspace/data-ingestion-app/sources
- out-f/data-ingestion-app/shots/03-all-agents-data-connection.jpg — page:/workspace/data-ingestion-app/agents
- out-f/data-ingestion-app/shots/04-all-listeners-data-connection.jpg — page:/workspace/data-ingestion-app/listeners
- out-f/data-ingestion-app/shots/05-external-stacks-data-connection.jpg — page:/workspace/data-ingestion-app/external-stacks
- out-f/data-ingestion-app/shots/06-all-syncs-data-connection.jpg — page:/workspace/data-ingestion-app/syncs

## API surface (17 endpoints)

### GET /aip-assist/api/chat/checkAvailability
- count 1, status 200
- response: {available: boolean}

### GET /job-tracker/api/builds/{rid}
- count 3, status 200
- response: {buildId: rid, user: string, userId: uuid, startedTime: datetime, finishedTime: datetime, outputDatasets: [{datasetRid: rid, securedProperties: null|object}], buildStatus: string, jobs: [{buildId: rid, jobId: rid, jobSpecId: rid, startedWaitingTime: datetime, submittedTime: datetime, finishedTime: datetime, outputDatasets: [{…}], inputDatasetRids: [rid], outputTransactions: [{…}], syncDetails: null, vectorDetails: null, jobStatus: string, jobQueues: {}, canceledAttribution: null, securedProperties: {jobType: string, transformType: string, statusDetails: null|object}, branchId: string, projectRids: [rid], dockerArtifactIds: [], outputMediaSetWriteContexts: []}], syncs: [], vectorDetails: [], statusDetails: null, securedProperties: {branchId: string}, restrictedJobCount: number, scheduleId: null, projectRids: [rid], dockerArtifactIds: []}

### GET /magritte-coordinator/api/agents
- count 1, status 200
- response: []

### GET /magritte-coordinator/api/batch/agent/healthstatus
- count 1, status 200
- response: {}

### GET /magritte-coordinator/api/bootvisor/status
- count 1, status 200
- response: {}

### GET /magritte-coordinator/api/external-stack/front-end-preload-info
- count 2, status 200
- response: {enabledAsSource: boolean, enabledAsDestination: boolean, canCreateExternalStacks: boolean}

### GET /magritte-coordinator/api/external-stack/rids/all
- count 1, status 200
- response: {rids: []}

### GET /magritte-coordinator/api/extract-store/extracts/source
- count 1, status 200
- response: {}

### GET /magritte-coordinator/api/source-store/sources/types
- count 2, status 200
- response: {}

### GET /marketplace/api/installation-app-service/{rid}/blockSet/version/{uuid}/attachments/{uuid}/use-cookie-auth
- count 9, status 200

### GET /monocle/api/settings/monitored-items
- count 1, status 200
- response: {items: [{type: string, build: {itemType: string, id: uuid, buildRid: rid}}]}

### GET /workspace/api/lifecycleStatusByApplication
- count 1, status 200
- response: {lifecycleStatusByApplication: {showcase-app: string, vulcan: string, linter-app-v2: string, oauth2-clients-app: string, auth-redirect: string, authoring: string, standalone-object-view-asset: string, fforms: string, monocle: string, slate-standalone: string, templates: string, slate: string, aip-autopilot-app: string, workspace-debug-app: string, code-workspace-app: string, quiver: string, mcp-hub-app: string, checkpoints-app: string, m: string, ontology: string, fusion: string, aip-analyst-app: string, ml: string, retention-app: string, compute-module-app: string, …}}

### POST /documentation/api/v2/release-notes/pagination
- count 8, status 200
- request: {productId: string, applicationIds: [string], pageSize: number}
- response: {releaseNotes: [{id: string|uuid, type: string, description: string, categoryTitle: string, categoryId: string, applicationTitle: string, applicationId: string, date: datetime, title: string, prominence: string, releaseVersion: string, productId: string, frontendApplicationId: string, mediaFilenames: [string], longDescription: null|string, applications: [{…}]}], nextOffset: number}

### POST /documentation/api/v2/release-notes/paginationV2
- count 12, status 200
- request: {applicationIds: [string], filterMode: string, offset: number, pageSize: number, supportedApplicationIds: [string]}
- response: {releaseNotes: [{id: string|uuid, type: string, description: string, categoryTitle: string, categoryId: string, applicationTitle: string, applicationId: string, date: datetime, title: string, prominence: string, releaseVersion: string, productId: string, frontendApplicationId: string, mediaFilenames: [], longDescription: null|string, applications: [{…}]}], nextOffset: number}

### POST /graphql-gateway/api/bulk
- count 2, status 200
- request: {operations: {}, requests: [{hash: string, name: string, variables: {appRid: rid}}]}

### POST /magritte-coordinator/api/external-stack/metadata/bulk-load
- count 1, status 200
- request: {rids: []}
- response: {metadata: {}}

### POST /people/api/personal/get-favorites
- count 6, status 200
- request: {userId: uuid}
- response: {orderedFavorites: [{resourceRid: rid, lastFavorited: datetime}]}

