# Crawl digest

Sources: out-d/builder, out-d/job-tracker-builds, out-d/scheduler, out-d/monocle, out-d2/builder-ri-eddie-main-pipeline-8b7b1ac7-54ee-4540-9706-aa91ef1b91d1-foundry-branch-rid-ri-branch-branch-be34a9c7-763a-40d5-ad56-4c90601cfdb1

## Screen kinds (15)

### /workspace/builder/
- title: Pipeline Builder
- reached by: (root) | Pipeline Builder Home | Recents
- headings: Explore reference examples · No-code approach to data cleaning with Pipeline Builder · Parse PDFs with LLMs in Pipeline Builder · Parse different data formats in Pipeline Builder · Reuse functions and parameters in Pipeline Builder · Use LLMs to classify data in Pipeline Builder
- tabs: My installations · All installations
- fields: Search pipelines… · Filter...
- controls: AIP Now Ontology · [user's project] · palantir learn · REA Sandbox · My installations · All installations · Pipeline Builder Home · Recent installations · Recents · Project · Created by… · New pipeline · Explore more · Scroll right
- overlays: Recents Favorites All ‖ AIP Now Ontology [user's project] palantir learn REA Sandbox ‖ My installations All installations Skeleton product 5 minutes ago Skeleton progress Skeleton product
- calls: GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · POST /foundry-search/api/compass/v0/search · GET /eddie/api/transformations/all · GET /language-model-service/api/config/v1/enabled · POST /eddie/api/natural-language-converter/aip-enabled · GET /eddie/api/pipeline-builder-settings · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/bulk · POST /eddie/api/pipelines-v2/get/by-rids · POST /multipass/api/users · GET /workspace/api/lifecycleStatusByApplication · POST /eddie/api/pipelines-v2/get-sandboxes-with-snapshots · POST /compass/api/batch/resources · GET /marketplace/api/installation-app-service/{rid}/blockSet/version/{uuid}/attachments/{uuid}/use-cookie-auth · GET /marketplace/api/block-set-installation/jobs · POST /people/api/personal/get-favorites

### /workspace/builder/  [dialog: No-code approach to data cleaning with Pipeline Builder]
- title: Pipeline Builder
- reached by: Explore more | Go to Pipeline Builder landing page > Explore more
- headings: Explore reference examples · No-code approach to data cleaning with Pipeline Builder · Parse PDFs with LLMs in Pipeline Builder · Parse different data formats in Pipeline Builder · Reuse functions and parameters in Pipeline Builder · Use LLMs to classify data in Pipeline Builder · Parse email files with Pipeline Builder for AIP claim validation · Transform geospatial data in Pipeline Builder · Use LLMs for entity extraction from PDFs in Pipeline Builder · Use LLMs for sentiment analysis in Pipeline Builder · Use LLMs for translation in Pipeline Builder · Use LLMs to summarize data in Pipeline …
- fields: Search pipelines… · Search examples and templates…
- controls: Close
- overlays: No-code approach to data cleaning with Pipeline Builder Clean and standardize raw data using no-code
- calls: GET /marketplace/api/installation-app-service/{rid}/blockSet/version/{uuid}/attachments/{uuid}/use-cookie-auth · POST /people/api/personal/get-favorites

### /workspace/builder/{rid}/history/{uuid}
- title: Open Orders Pipeline · Version history
- reached by: Tabs > History | Tabs > History > History | Tabs > History > Toggle collapse deployment
- tabs: Graph · Proposals · History
- fields: checkbox
- controls: Graph · Proposals · History · Filter · Toggle collapse deployment · Additional timeline event actions · 3 saved versions · Build report · Create branch · Reset to this version
- overlays: Create branch Reset to this version ‖ Deployments Pipeline changes
- calls: POST /graphql-gateway/api/bulk · POST /people/api/personal/get-favorites

### /workspace/builder/{rid}/sandbox/{uuid}
- title: Open Orders Pipeline · Pipeline Builder
- reached by: (root) | Selection preview Suggestions | Tabs
- fields: Search outputs… · textarea
- empty states: Select a single node to preview data
- controls: Graph · Proposals · History · Tabs · Additional branch actions · Deploy · Modify build settings · Layout nodes · Toggle grid snapping · Add data · Reusables · Generate pipeline transforms using natural language · Explain pipeline transforms in natural language · Search · Toggle legend · Zoom in · Zoom out · Zoom to fit · Toggle bottom bar · Pipeline outputs · Settings · View lineage, opens in a new window · Add · Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.e3707fc6-d1ab-4e60-9645-a2ab9096cbe3/ · Edit output settings · More options · Search pipeline · View changes · Deploy pi…
- overlays: Graph Proposals History ‖ Zoom to fit ‖ Build settings Output settings Packaging settings Replace with objects
- calls: GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /eddie/api/transformations/all · GET /language-model-service/api/config/v1/enabled · POST /eddie/api/natural-language-converter/aip-enabled · GET /eddie/api/pipeline-builder-settings · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/bulk · POST /graphql-gateway/api/graphql · GET /workspace/api/lifecycleStatusByApplication · GET /eddie/api/pipelines-v2/{rid} · PUT /eddie/api/pipelines-v2/get-sandbox-with-snapshot-for-global-branch · POST /ontology-metadata/api/ontology/v2/load/all · POST /multipass/api/authz/batch/operations · GET /eddie/api/pipelines-v2/{rid}/all-information · POST /eddie/api/transformations/available-logical-types · GET /eddie/api/pipelines-v2/markings/{rid}/settings · GET /eddie/api/external-transforms/{rid}/is-udf-enabled-v2 · POST /eddie/api/transformations/logical-types · (+30)

### /workspace/dataset/preview/{rid}/master
- title: all_orders
- reached by: 0 1 0 > all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago > Compare > Job for: all_o…
- tabs: Preview · History · Details · Health · Compare · Time Travel Beta
- fields: Search columns…
- controls: Go to Dataset Preview landing page · palantir learn · billytraining · File · Theme · Help · 1 · master · 0 2 0 · Share · View details · Preview · History · Details · Health · Compare · Time Travel Beta · SQL console · Analyze data · Explore pipeline · All actions · Build · Open build menu · About · Columns · Schedules · timezone · Timezone · Calculate row count · New Create table · (+2)
- calls: GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /soho-service/api/noho/{rid}/projections3 · GET /foundry-catalog/api/catalog/datasets/{rid}/reverse-transactions2/master · POST /people/api/eventsink/create-events · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/graphql · POST /build2/api/jobspecs/get-jobspecs-for-datasets · POST /multipass/api/authz/batch/operations · POST /monocle/api/links/graphV3 · GET /stream-catalog/api/catalog/streams/{rid}/branches/master/views/latest · POST /graphql-gateway/api/bulk · GET /monocle/api/settings/monitored-items · GET /foundry-metadata/api/schemas/datasets/{rid}/branches/master · GET /job-tracker/api/builds/{rid} · GET /multipass/api/authz/access/ri.rowlevelpolicyservice..resource.admin · GET /compass/api/linked-items/{rid} · GET /workspace/api/lifecycleStatusByApplication · GET /row-level-policy-service/api/dataset/{rid}/transactions/{rid}/info · (+12)

### /workspace/job-tracker/builds
- title: Your builds · Builds
- reached by: (root) | 0 1 0 | 0 1 0 > all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago > Telemetry > Job type: Tr…
- fields: Search for resource names or RIDs… · checkbox · Search for object types… · radio · text · Filter job type… · Start date · End date · Search for people…
- empty states: No visible builds
- controls: Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.e3707fc6-d1ab-4e60-9645-a2ab9096cbe3/ · REA Sandbox · View build actions · Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.30c4f902-2b2b-40b7-88e6-0ca9837bfc1a/ · palantir learn · billytraining · Clear all · all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago · Remove monitored item · Settings · Search for resource names or RIDs… · Clear · Filter job type… · Remove tag · Clear all filters · All · Running · Finished · Select statuses… · Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.76e8f188-35e1-4…
- overlays: MONITORED ITEMS Clear all all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago ‖ Data integration Include all Data connection task (legacy) magritte-task Data export magritte-export
- calls: GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/bulk · GET /monocle/api/settings/monitored-items · GET /workspace/api/lifecycleStatusByApplication · GET /job-tracker/api/builds/{rid} · POST /people/api/personal/get-favorites

### /workspace/job-tracker/builds/{rid}
- title: all_orders (Succeeded) · Builds
- reached by: 0 1 0 > all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago | 0 1 0 > all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago > Rebuild | 0 1 0 > all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago > Rebuild > View progress
- headings: Build is up to date · No metric data available
- tabs: Logs · _driver.log · Metrics
- fields: text · checkbox · Dataset path… · Start date · End date
- empty states: Build is up to date · No metric data available Try expanding the date range to load more metrics
- controls: Builds · Build of: all_orders · all_orders · Explore lineage · Actions · Rebuild · Build options · Copy to clipboard · Job status · Progress details · Critical path · Start time · Duration · Status · Compare · Telemetry · View progress · Close · A build · Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.30c4f902-2b2b-40b7-88e6-0ca9837bfc1a/ · Logs · _driver.log · Metrics · Download logs · Filter logs… · Clear all · Tabular · Columns · Oldest first · Disable message column wrapping · (+33)
- overlays: Rebuild stale datasets in this build ‖ Open View in dataset history Build history Explore data lineage Manage Schedules More ‖ Open View in dataset history Build history Explore data lineage Manage Schedules More Download as CS
- calls: POST /graphql-gateway/api/graphql · GET /job-tracker/api/builds/{rid} · POST /graphql-gateway/api/bulk · GET /compass/api/registry/actions · POST /compass/api/batch/resources · POST /compass/api/resources/batch/branches-by-name · POST /scheduler/api/scheduler/get-schedule-runs-by-result · GET /job-tracker/api/stats/builds/{rid} · POST /build2/api/info/jobs3 · POST /scheduler/api/scheduler/get-schedules · POST /build2/api/info/jobs3/runs · GET /spark-reporter/api/log-stream-availability/{uuid} · POST /spark-reporter/api/progress/jobs/batch · GET /build2/api/manager/can-rerun-job-with-debug/{rid} · GET /spark-reporter/api/incremental-resolution/{uuid} · POST /checkpoints/api/checkpoints/configuration/getConfigsV5 · POST /build2/api/manager/rerun-build · POST /monocle/api/settings/monitored-items · GET /monocle/api/settings/monitored-items · POST /people/api/personal/get-favorites · (+10)

### /workspace/job-tracker/builds/{rid}  [dialog: Stage details]
- title: all_orders (Succeeded) · Builds
- reached by: 0 1 0 > all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago > Telemetry > Stage detail…
- headings: Stage details
- fields: text · checkbox · Dataset path…
- controls: Copy · Close · Copy to clipboard
- overlays: Stage details Waiting in resource queue (Resource queue rid: ri.resource-policy-manager.global.resou
- calls: GET /spark-ui/api/v1/applications/{rid}

### /workspace/job-tracker/builds/{rid}/{rid}
- title: Job report · Builds
- reached by: 0 1 0 > all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago > Telemetry > Job details
- headings: Stages
- tabs: Overview · Query plan · RDD Graph · Executors · Environment · Dependencies · Incrementality
- controls: Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.30c4f902-2b2b-40b7-88e6-0ca9837bfc1a/ · Debug information · all_orders 34s · Overview · Query plan · Executors · Environment · Dependencies · Incrementality · Stage progress · Stage attempt · Stage 2 attempt 0 $anonfun$withThreadLocalCaptured$1 at FutureTask.java:317 Writing dataset ri.found · Stage 1 attempt 0 $anonfun$withThreadLocalCaptured$1 at FutureTask.java:317 Writing dataset ri.found · Stage 3 attempt 0 saveAsTable at FoundrySparkDatasetWriterImpl.java:261 Writing dataset ri.foundry.m
- overlays: all_orders 34s
- calls: POST /graphql-gateway/api/graphql · POST /graphql-gateway/api/bulk · POST /spark-reporter/api/batch · GET /spark-reporter/api/queryplan/v2/sparkJobId/{uuid}/OPTIMIZED · GET /spark-reporter/api/graph/queryplan/sparkExecutionId/{uuid} · GET /spark-reporter/api/envSettings/{uuid} · GET /spark-reporter/api/jobs/{uuid}/dependencies · GET /spark-reporter/api/graph/sparkJobId/{uuid} · GET /spark-reporter/api/module/job/{uuid} · GET /job-tracker/api/builds/{rid} · POST /build2/api/info/jobs3/runs · GET /spark-ui/api/v1/applications/{rid} · GET /spark-reporter/api/queryplan/v3/{uuid}/1 · GET /spark-reporter/api/graph/queryplan/{uuid}/1 · POST /people/api/personal/get-favorites

### /workspace/job-tracker/compare/{rid}
- title: Comparing Job (Oct 16 at 7:25 PM) with most recent successful job · Builds
- reached by: 0 1 0 > all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago > Compare | 0 1 0 > all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago > Compare > Comparison
- headings: Diff cannot be generated
- empty states: Diff cannot be generated The previous transaction could not be read. There are no successful transac
- controls: Job for: all_orders · Comparison
- calls: GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /aip-assist/api/chat/checkAvailability · POST /build2/api/info/jobs3 · POST /graphql-gateway/api/bulk · GET /job-tracker/api/builds/{rid} · GET /foundry-catalog/api/catalog/datasets/{rid}/reverse-transactions2/{rid} · GET /workspace/api/lifecycleStatusByApplication · POST /people/api/personal/get-favorites

### /workspace/monocle/
- title: Data Lineage
- reached by: Data Lineage Home
- tabs: Preview · SQL scratchpad · History · Code · Build timeline · Data health · Search Foundry · View node properties · Manage builds · Manage schedules · Access information · Related items
- fields: Search...
- empty states: Add datasets to the graph to view build timeline · Select node(s) to view properties
- calls: GET /monocle/api/refresh/status

### /workspace/monocle/graph
- title: Data Lineage
- reached by: (root) | Data health | Data health > Monitoring rules
- headings: No monitoring rules found
- tabs: Preview · SQL scratchpad · History · Code · Build timeline · Data health · Search Foundry · View node properties · Manage builds · Manage schedules · Access information · Related items
- fields: Search...
- empty states: No monitoring rules found Please setup new monitoring rules by clicking the button below Create moni · No monitoring rules found Please setup new monitoring rules by clicking the button below · Add datasets to the graph to view build timeline · Select node(s) to view properties
- controls: Collapse bottom bar · Maximize · Monitoring rules · Health checks · Create monitoring rules · Collapse sidebar · A build · Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.30c4f902-2b2b-40b7-88e6-0ca9837bfc1a/ · Close · Clear all · all_orders 0 of 1 jobs succeeded · Running for 15s · Remove monitored item · Clear all completed · all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago · Layout all nodes A
- overlays: MONITORED ITEMS Clear all all_orders 0 of 1 jobs succeeded · Running for 15s COMPLETED Clear all com ‖ Layout all nodes A Hierarchy L Vertical hierarchy V Level L Force-directed U Color G Grid G Vertical
- calls: GET /multipass/api/sessions/definitions/current · GET /monocle/api/refresh/status · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /compass/api/folders/home/v2 · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/bulk · GET /monocle/api/settings · GET /monocle/api/settings/monitored-items · GET /foundry-sync/api/targets/info · GET /workspace/api/lifecycleStatusByApplication · GET /job-tracker/api/builds/{rid} · GET /data-health/api/checkgroups/all · GET /data-health/api/checks/v2/available · POST /people/api/personal/get-favorites

### /workspace/monocle/graph  [dialog: Fallback branches]
- title: Data Lineage
- reached by: Fallback branches
- headings: Fallback branches
- tabs: Preview · SQL scratchpad · History · Code · Build timeline · Data health · Search Foundry · View node properties · Manage builds · Manage schedules · Access information · Related items
- fields: Search... · Search branches…
- empty states: Add datasets to the graph to view build timeline · Select node(s) to view properties
- controls: Close · Save and close · Cancel
- overlays: Fallback branches 1. master Save and close Cancel
- calls: GET /monocle/api/refresh/status

### /workspace/monocle/graph  [dialog: Settings]
- title: Data Lineage
- reached by: User settings
- headings: Settings
- tabs: Preview · SQL scratchpad · History · Code · Build timeline · Data health · Search Foundry · View node properties · Manage builds · Manage schedules · Access information · Related items
- fields: Search... · checkbox
- empty states: Add datasets to the graph to view build timeline · Select node(s) to view properties
- controls: Close
- overlays: Settings User Settings Enable curved edges Simple presentations mode

### /workspace/scheduler/find
- title: Build Schedules
- reached by: (root) | 0 1 0 | Sorted by most recently updated
- fields: Filter by name or rid…
- empty states: No schedules found. Add search criteria to find more schedules. · No schedules matching your search were found
- controls: Clear all · all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago · Remove monitored item · Last updated · Name · Creation date · Last run · Ascending · Descending · Sorted by name · All · Enabled · Paused · Project Scoped · User Scoped
- overlays: MONITORED ITEMS Clear all all_orders 1 of 1 jobs succeeded · Ran for 36s · 4d ago ‖ Sort by Last updated Name Creation date Last run Sort direction Ascending Descending ‖ Filter schedule list Pause state All Enabled Paused Scope All Project Scoped User Scoped
- calls: GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/bulk · GET /monocle/api/settings/monitored-items · GET /workspace/api/lifecycleStatusByApplication · GET /job-tracker/api/builds/{rid}

## Actions not clicked (mutating, 37)

A build · Add · Add data · Add resources Search for resources to add to graph · Add text node · Build Schedules Home · Build history · Build of: all_orders · Build options · Build schedules · Build settings · Build timeline · Clear all · Clear all completed · Clear all filters · Close · Copy to clipboard · Create monitoring rules · Create schedule · Deploy · Deploy pipeline · Disable message column wrapping · Edit output settings · Generate pipeline transforms using natural language · Last run · Light · Merge proposal · Modify build settings · New pipeline · Open in a new tab · Remove monitored item · Save and close · Set search parameters · Share · Start time · View build actions · View lineage, opens in a new window

## Screenshots (16)

- out-d/builder/shots/01-pipeline-builder.jpg — page:/workspace/builder/
- out-d/builder/shots/02-dialog-no-code-approach-to-data-cleaning-with-pipe.jpg — dialog:/workspace/builder/|No-code approach to data cleaning with Pipeline Builder
- out-d/job-tracker-builds/shots/01-your-builds-builds.jpg — page:/workspace/job-tracker/builds
- out-d/job-tracker-builds/shots/02-all-orders-succeeded-builds.jpg — page:/workspace/job-tracker/builds/{rid}
- out-d/job-tracker-builds/shots/03-comparing-job-oct-16-at-7-25-pm-with-most-recent-s.jpg — page:/workspace/job-tracker/compare/{rid}
- out-d/job-tracker-builds/shots/04-all-orders.jpg — page:/workspace/dataset/preview/{rid}/master
- out-d/job-tracker-builds/shots/05-dialog-stage-details.jpg — dialog:/workspace/job-tracker/builds/{rid}|Stage details
- out-d/scheduler/shots/01-build-schedules.jpg — page:/workspace/scheduler/find
- out-d/monocle/shots/01-data-lineage.jpg — page:/workspace/monocle/graph
- out-d/monocle/shots/02-data-lineage.jpg — page:/workspace/monocle/
- out-d/monocle/shots/03-dialog-fallback-branches.jpg — dialog:/workspace/monocle/graph|Fallback branches
- out-d/monocle/shots/04-dialog-settings.jpg — dialog:/workspace/monocle/graph|Settings
- out-d2/builder-ri-eddie-main-pipeline-8b7b1ac7-54ee-4540-9706-aa91ef1b91d1-foundry-branch-rid-ri-branch-branch-be34a9c7-763a-40d5-ad56-4c90601cfdb1/shots/01-open-orders-pipeline-pipeline-builder.jpg — page:/workspace/builder/{rid}/sandbox/{uuid}
- out-d2/builder-ri-eddie-main-pipeline-8b7b1ac7-54ee-4540-9706-aa91ef1b91d1-foundry-branch-rid-ri-branch-branch-be34a9c7-763a-40d5-ad56-4c90601cfdb1/shots/02-pipeline-builder.jpg — page:/workspace/builder/
- out-d2/builder-ri-eddie-main-pipeline-8b7b1ac7-54ee-4540-9706-aa91ef1b91d1-foundry-branch-rid-ri-branch-branch-be34a9c7-763a-40d5-ad56-4c90601cfdb1/shots/03-dialog-no-code-approach-to-data-cleaning-with-pipe.jpg — dialog:/workspace/builder/|No-code approach to data cleaning with Pipeline Builder
- out-d2/builder-ri-eddie-main-pipeline-8b7b1ac7-54ee-4540-9706-aa91ef1b91d1-foundry-branch-rid-ri-branch-branch-be34a9c7-763a-40d5-ad56-4c90601cfdb1/shots/04-open-orders-pipeline-version-history.jpg — page:/workspace/builder/{rid}/history/{uuid}

## API surface (102 endpoints)

### GET /aip-assist/api/chat/checkAvailability
- count 3, status 200
- response: {available: boolean}

### GET /build2/api/info/jobs3/{rid}
- count 2, status 200
- response: {jobRid: rid, buildRid: rid, jobSpecRid: rid, resolvedInputSpecs: [{inputType: string, branch: string, datasetLocator: {datasetRid: rid, datasetProperties: {…}}, assumedMarkings: {}, inputFailureStrategy: null, identifier: uuid}], resolvedOutputSpecs: [{outputType: string, datasetLocator: {datasetRid: rid, datasetProperties: {…}}, outputMetadata: {}}], finishedOutputSpecs: null, extraResolvedInputSpecs: null, resolvedConnectionInfo: null, startedTime: datetime, submittedToWorkerTime: datetime, finishedTime: datetime, retryCount: number, jobStatus: string, jobStatusReason: null, jobDetails: string, jobQueues: {}, jobResults: {{key}: {provenance: {provenanceRecords: [{…}]}, schemaVersionId: uuid, notModified: boolean}}, inputResults: {}, jobError: null, canceledAttribution: null, debugParameters: null, constraintInfo: null, isRedacted: boolean, incrementalResolutionResult: {outcome: string…

### GET /build2/api/jobspecs/get-historical-jobspec/{rid}
- count 2, status 200
- response: {rid: rid, attribution: {userId: uuid, time: datetime}, workerType: string, inputSpecs: [{inputType: string, branch: null, datasetLocator: {datasetRid: rid, datasetProperties: {…}}, assumedMarkings: {}, inputFailureStrategy: null, identifier: uuid}], outputSpecs: [{outputType: string, datasetLocator: {datasetRid: rid, datasetProperties: {…}}, outputMetadata: {}}], computationParameters: {transforms: {transformType: string, transformAlias: string, minimumVersion: string, transformLogicVersion: string, transformParameters: {inputs: {…}, outputs: {…}, enableUdfContainers: boolean, udfBatchSize: number, trustedArtifactoryCerts: [string], artifactoryCertDir: string, udfDownloadDir: string, commitEmptyIncrementalTransactions: boolean}, computeFunction: string}}, runtimeParameters: {transforms: {transformProfiles: [string], supportsArtifactsDownloadV2: boolean, useJobTokenAsTempCredentialsToken…

### GET /build2/api/manager/can-rerun-job-with-debug/{rid}
- count 3, status 200
- response: boolean

### GET /compass/api/linked-items/{rid}
- count 3, status 200
- response: []

### GET /compass/api/registry/actions
- count 3, status 200
- response: [{category: null|string, displayHint: {description: null|string, icon: string, label: string}, match: [{type: string, value: null|string, key: string}], method: string, name: string, url: string, precedence: null, actionType: null|string}]

### GET /compass/api/resources/{rid}
- count 1, status 200
- response: {rid: rid, name: string, created: {time: datetime, userId: uuid}, modified: {time: datetime, userId: uuid}, lastModified: number, description: null, operations: [string], urlVariables: {compass:isProject: string}, favorite: null, branches: null, defaultBranch: null, defaultBranchWithMarkings: null, branchesCount: null, hasBranches: null, hasMultipleBranches: null, backedObjectTypes: null, path: string, longDescription: null, directlyTrashed: boolean, inTrash: boolean, isAutosave: boolean, isHidden: boolean, isPreviewResource: boolean, collections: [], namedCollections: [], …}

### GET /compass/api/resources/{rid}/parent
- count 3, status 200
- response: {rid: rid, name: string, created: {time: datetime, userId: uuid}, modified: {time: datetime, userId: uuid}, lastModified: number, urlVariables: {}, directlyTrashed: boolean, isAutosave: boolean, isHidden: boolean, isPreviewResource: boolean, status: null}

### GET /contour/api/dataset-preview/v2/{rid}/branches/master/async
- count 1, status 200
- response: {type: string, success: {foundryFields: [{type: string, name: string, nullable: boolean, userDefinedTypeClass: null, customMetadata: {…}, arraySubtype: null, precision: null, scale: null, mapKeyType: null, mapValueType: null, subSchemas: null}], rows: [[number|string|uuid]], isTruncated: boolean, warningMessage: null}}

### GET /data-health/api/checkgroups/all
- count 1, status 200
- response: []

### GET /data-health/api/checks/v2/available
- count 1, status 200
- response: [{checkName: string, displayName: string, checkDescription: string, eventType: string, checkCategory: string, datasetArity: string, columnArity: string, valueType: null|string, validationInfos: [{validationType: string, isRequired: boolean, allowMultipleSeverities: boolean, allowMultipleChecks: boolean}], triggerTypes: [string], supportedTargetTypes: [string], isCheckCreationAllowed: boolean}]

### GET /data-health/api/checks/v2/{rid}/master
- count 1, status 200
- response: []

### GET /eddie/api/external-transforms/{rid}/is-udf-enabled-v2
- count 3, status 200
- response: {enablementStatus: string, canUdfsRunInContainers: boolean}

### GET /eddie/api/pipeline-backend-feature-flags/{rid}
- count 3, status 200
- response: [string]

### GET /eddie/api/pipeline-builder-settings
- count 3, status 200
- response: {edgeType: {type: string, curved: {}}, previewMode: {type: string, automatic: {}}}

### GET /eddie/api/pipelines-v2/markings/{rid}/settings
- count 3, status 200
- response: {enableUnmarkingInPipeline: boolean, requireReapproval: {}}

### GET /eddie/api/pipelines-v2/{rid}
- count 2, status 200
- response: {pipeline: {rid: rid, name: string, attribution: {time: datetime, user: uuid}, publishedSandboxes: [uuid], heartbeats: {}, compassDetails: {trashed: boolean, favorite: boolean}}}

### GET /eddie/api/pipelines-v2/{rid}/all-information
- count 5, status 200
- response: {pipeline: {rid: rid, name: string, attribution: {time: datetime, user: uuid}, publishedSandboxes: [uuid], heartbeats: {}, compassDetails: {trashed: boolean, favorite: boolean}}, sandbox: {id: uuid, name: string, backingBranch: string, fallbackBranches: [string], attribution: {time: datetime, user: uuid}, version: uuid, isArchived: boolean, fromSandbox: {id: uuid, backingBranch: string, version: uuid}, isPublished: boolean, globalBranchRid: rid}, version: {id: uuid, message: string, attribution: {time: datetime, user: uuid}, backend: string}, snapshot: {transforms: [{id: uuid, transformId: string, transformVersion: {…}, arguments: {…}}], targets: [{id: uuid, target: {…}, source: {…}, unmarkings: []}], groups: [], groupedExpressions: [], outputs: [], arguments: {}, backendSettings: {computeProfile: {computeProfileId: uuid, arguments: {…}}, configuration: {commitEmptyIncrementalTransaction…

### GET /eddie/api/pipelines-v2/{rid}/sandboxes/get/all
- count 3, status 200
- response: {sandboxes: [{id: uuid, name: string, backingBranch: string, fallbackBranches: [string], attribution: {time: datetime, user: uuid}, version: uuid, isArchived: boolean, isPublished: boolean, fromSandbox: {id: uuid, backingBranch: string, version: uuid}, globalBranchRid: rid}]}

### GET /eddie/api/pipelines-v2/{rid}/sandboxes/{uuid}/session-heartbeats
- count 5, status 200
- response: {heartbeats: {{key}: [{type: string, timestamp: datetime, sessionId: uuid}]}}

### GET /eddie/api/transformations/all
- count 3, status 200
- response: {allTransformDefinitions: [{id: string, version: {major: number}, displayName: string, description: string, displayNameAliases: [string], argumentOrder: [], typeVariables: [], arguments: {dataset: {…}, column: {…}, minValue: {…}, maxValue: {…}, bucketCount: {…}, keyByColumns: {…}, window: {…}, trigger: {…}, accumulationMode: {…}, aggregations: {…}, left: {…}, right: {…}, leftColumnsToKeep: {…}, joinCondition: {…}, sorting: {…}, joinKeys: {…}, rightColumnsToKeep: {…}, rightHandSidePrefix: {…}}, outputs: {dataset: {…}, output: {…}}, categories: [string], isExpandable: boolean, source: {type: string, builtIn: {…}}, capabilities: []}], allExpressionDefinitions: [{typeVariables: [{…}], id: string, version: {major: number}, displayName: string, description: string, arguments: {left: {…}, right: {…}, attributePrefix: {…}, valueTag: {…}, schema: {…}, ignoreNamespace: {…}, xml: {…}, outputMode: {…

### GET /foundry-catalog/api/catalog/datasets/{rid}/reverse-transactions2/master
- count 4, status 200
- response: {values: [{rid: rid, transaction: {type: string, status: string, filePathType: string, startTime: datetime, closeTime: datetime, permissionPath: string, record: {…}, attribution: {…}, metadata: {…}, isDataDeleted: boolean, hasCompleteDeletionStarted: null, isDeletionComplete: boolean, rid: rid, provenance: {…}, datasetRid: rid}}], nextPageToken: null}

### GET /foundry-catalog/api/catalog/datasets/{rid}/reverse-transactions2/{rid}
- count 1, status 200
- response: {values: [{rid: rid, transaction: {type: string, status: string, filePathType: string, startTime: datetime, closeTime: datetime, permissionPath: string, record: {…}, attribution: {…}, metadata: {…}, isDataDeleted: boolean, hasCompleteDeletionStarted: null, isDeletionComplete: boolean, rid: rid, provenance: {…}, datasetRid: rid}}], nextPageToken: null}

### GET /foundry-catalog/api/catalog/datasets/{rid}/transactions/{rid}/files/paged2
- count 2, status 200
- response: {values: [{logicalPath: string, physicalPath: string, physicalUri: null, transactionRid: rid, fileMetadata: {length: number}, isOpen: boolean, timeModified: datetime}], nextPageToken: null}

### GET /foundry-metadata/api/schemas/datasets/{rid}/branches/master
- count 2, status 200
- response: {branchId: string, transactionRid: rid, versionId: uuid, schema: {fieldSchemaList: [{type: string, name: string, nullable: boolean, userDefinedTypeClass: null, customMetadata: {…}, arraySubtype: null, precision: null, scale: null, mapKeyType: null, mapValueType: null, subSchemas: null}], primaryKey: null, dataFrameReaderClass: string, customMetadata: {format: string, path: string, options: {}}}, attribution: {userId: uuid, time: datetime}}

### GET /foundry-stats/api/stats/datasets/{rid}/branches/master
- count 1, status 200
- response: {view: {datasetRid: rid, schemaId: uuid, endTransactionRid: rid}, status: string, result: null, metadata: {}}

### GET /foundry-sync/api/targets/info
- count 1, status 200
- response: [{targetType: string, targetName: string, targetDisplayName: string, targetRid: rid}]

### GET /foundry-telemetry-service/api/containers/{rid}/sessions/{uuid}/logs/throttle-status
- count 1, status 200
- response: {hasDroppedLogs: boolean, approximateDroppedRecordCount: number}

### GET /job-tracker/api/builds/{rid}
- count 6, status 200
- response: {buildId: rid, user: string, userId: uuid, startedTime: datetime, finishedTime: datetime, outputDatasets: [{datasetRid: rid, securedProperties: null|object}], buildStatus: string, jobs: [{buildId: rid, jobId: rid, jobSpecId: rid, startedWaitingTime: datetime, submittedTime: datetime, finishedTime: datetime, outputDatasets: [{…}], inputDatasetRids: [rid], outputTransactions: [{…}], syncDetails: null, vectorDetails: null, jobStatus: string, jobQueues: {}, canceledAttribution: null, securedProperties: {jobType: string, transformType: string, statusDetails: null|object}, branchId: string, projectRids: [rid], dockerArtifactIds: [], outputMediaSetWriteContexts: []}], syncs: [], vectorDetails: [], statusDetails: null, securedProperties: {branchId: string}, restrictedJobCount: number, scheduleId: null, projectRids: [rid], dockerArtifactIds: []}

### GET /job-tracker/api/stats/builds/{rid}
- count 3, status 200
- response: {buildId: rid, jobStats: {{key}: {jobSpecId: rid, typicalDuration: number}}, estimatedDuration: number}

### GET /language-model-service/api/config/v1/enabled
- count 3, status 200
- response: boolean

### GET /marketplace/api/block-set-installation/jobs
- count 1, status 200
- response: {jobs: [{jobRid: rid, submittedAt: datetime, lastActivityAt: datetime, secondsElapsed: number, installationCreator: uuid, blockSetInstallations: [rid], blockSetInstallationsV2: [{…}], status: {type: string, success: {…}}, isRetryableV2: boolean, isRetryable: boolean}]}

### GET /marketplace/api/installation-app-service/{rid}/blockSet/version/{uuid}/attachments/{uuid}/use-cookie-auth
- count 16, status 200

### GET /monocle/api/refresh/status
- count 6, status 200
- response: {refreshing: boolean, refreshStartTimeEpoch: number, version: string}

### GET /monocle/api/settings
- count 1, status 200
- response: {settings: {}}

### GET /monocle/api/settings/monitored-items
- count 3, status 200
- response: {items: [{type: string, build: {itemType: string, id: uuid, buildRid: rid}}]}

### GET /multipass/api/authz/access/ri.rowlevelpolicyservice..resource.admin
- count 1, status 200
- response: boolean

### GET /multipass/api/authz/operations/{rid}
- count 1, status 200
- response: [string]

### GET /row-level-policy-service/api/dataset/{rid}/transactions/{rid}/info
- count 2, status 200
- response: {viewType: string, datasetPolicyInfo: {policyColumn: null, showPolicyColumn: boolean, usesColumnAcls: boolean, aclGroup: null, datasetPolicyStatus: string}}

### GET /soho-service/api/noho/{rid}/projections3
- count 1, status 200
- response: {projections: []}

### GET /spark-reporter/api/envSettings/{uuid}
- count 1, status 200
- response: {adaptiveExecutionEnabled: null, advisoryPartitionSize: null, appName: null, autoBroadcastJoinThreshold: null, crossJoinEnabled: null, driverCores: string, driverExtraJavaOptions: null, driverRequestCores: string, driverMaxResultSize: null, driverMemory: string, driverMemoryOverhead: string, driverGpus: null, dynamicAllocationEnabled: string, dynamicAllocationExecutorIdleTimeout: null, dynamicAllocationSchedulerBacklogTimeout: null, dynamicAllocationMaxExecutors: null, dynamicAllocationMinExecutors: null, executorCores: null, executorExtraJavaOptions: null, executorRequestCores: null, executorInstances: string, executorMemory: null, executorMemoryOffHeap: null, executorMemoryOverhead: null, executorGpus: null, …}

### GET /spark-reporter/api/graph/queryplan/sparkExecutionId/{uuid}
- count 1, status 200
- response: {sparkExecutionIds: [string]}

### GET /spark-reporter/api/graph/queryplan/{uuid}/1
- count 1, status 200
- response: {nodes: [{id: string, name: string, description: string, metrics: [], metricsV2: [{…}], codegenId: null, cachedUpstreamPlanId: null, inputColumns: [{…}], outputColumns: [{…}], expressions: [{…}], datasetIdentifier: null|object}], edges: [{from: string, to: string}]}

### GET /spark-reporter/api/graph/sparkJobId/{uuid}
- count 1, status 200
- response: {sparkJobIds: []}

### GET /spark-reporter/api/incremental-resolution/{uuid}
- count 1, status 404
- response: {errorCode: string, errorName: string, errorInstanceId: uuid, parameters: {jobId: uuid}}

### GET /spark-reporter/api/jobs/{uuid}/dependencies
- count 1, status 404
- response: {errorCode: string, errorName: string, errorInstanceId: uuid, parameters: {jobId: uuid}}

### GET /spark-reporter/api/log-stream-availability/{uuid}
- count 3, status 200
- response: string

### GET /spark-reporter/api/module/job/{uuid}
- count 1, status 200
- response: {rid: rid, type: string, version: string, sparkVersion: string, backendName: string, kubernetesNamespace: string, supportedCpuArchitectures: [string]}

### GET /spark-reporter/api/queryplan/v2/sparkJobId/{uuid}/OPTIMIZED
- count 1, status 200
- response: {sparkExecutionIds: [string]}

### GET /spark-reporter/api/queryplan/v3/{uuid}/1
- count 1, status 200
- response: {OPTIMIZED: {queryString: string}, PHYSICAL: {queryString: string}, PHYSICAL_FORMATTED: {queryString: string}}

### GET /spark-ui/api/v1/applications/{rid}
- count 16, status 404
- response: {errorCode: string, errorName: string, errorInstanceId: uuid, parameters: {appId: rid, message: string}}

### GET /workspace/api/lifecycleStatusByApplication
- count 3, status 200
- response: {lifecycleStatusByApplication: {showcase-app: string, vulcan: string, linter-app-v2: string, oauth2-clients-app: string, auth-redirect: string, authoring: string, standalone-object-view-asset: string, fforms: string, monocle: string, slate-standalone: string, templates: string, slate: string, aip-autopilot-app: string, workspace-debug-app: string, code-workspace-app: string, quiver: string, mcp-hub-app: string, checkpoints-app: string, m: string, ontology: string, fusion: string, aip-analyst-app: string, ml: string, retention-app: string, compute-module-app: string, …}}

### POST /build2/api/info/jobs3
- count 4, status 200
- request: [rid]
- response: {{key}: {jobRid: rid, buildRid: rid, jobSpecRid: rid, resolvedInputSpecs: null|object, resolvedOutputSpecs: null|object, finishedOutputSpecs: null, extraResolvedInputSpecs: null, resolvedConnectionInfo: null, startedTime: datetime, submittedToWorkerTime: datetime|null, finishedTime: datetime, retryCount: number, jobStatus: string, jobStatusReason: null|object, jobDetails: string, jobQueues: {}, jobResults: null|object, inputResults: null|object, jobError: null, canceledAttribution: null, debugParameters: null, constraintInfo: null, isRedacted: boolean, incrementalResolutionResult: null|object, adjudicatedJobSpecProperties: null|object, …}}

### POST /build2/api/info/jobs3/runs
- count 5, status 200
- request: [rid]
- response: {{key}: [{runRid: rid, stages: [{…}], setupReports: [], finishedDetails: string, finishedTime: datetime}]}

### POST /build2/api/jobspecs/get-jobspecs-for-datasets
- count 2, status 200
- request: {datasetRids: [rid], branch: string, branchFallbacks: {branches: []}}
- response: {{key}: {jobSpec: {rid: rid, attribution: {userId: uuid, time: datetime}, workerType: string, inputSpecs: [{…}], outputSpecs: [{…}], computationParameters: {transforms: {…}}, runtimeParameters: {transforms: {…}, transformsLang: {…}}, adjudicationParameters: {assetName: string, version: {…}}, sourceProvenance: {details: {…}}, tokenMode: string, useScopedTokens: null, useInputScopedTokens: null, maxAllowedDuration: null, maxAllowedDurationPerStage: null, executionConstraint: null, jobParameters: null, resourceManagementMetadata: {usageType: string, attribution: {…}}, resourceManagementMetadataV2: null, allowRunOnTrashedResources: null, jobVariant: null, incrementalSpec: {type: string, strictSubsetConsensusStrategy: {…}}}, branch: string}}

### POST /build2/api/manager/rerun-build
- count 1, status 200
- request: {buildId: rid, excludeSucceededJobs: boolean}
- response: {buildRid: rid, buildGroupRid: rid, jobsCreated: {{key}: rid}, jobsInOtherBuilds: {}}

### POST /checkpoints/api/checkpoints/configuration/getConfigsV5
- count 1, status 200
- request: {checkpointedItems: [{checkpointedItemId: {checkpointedJobSpecRid: rid, type: string}, branches: []}], checkpointType: string}
- response: {checkpointConfigs: [], classificationInferabilityStatus: {type: string, uninferableClassifcation: string}}

### POST /comments/api/comments/batch/page-v2
- count 3, status 200
- request: {requests: [{resourceId: rid, locator: string, nextPageToken: null, pageSize: number}]}
- response: {responses: [{request: {resourceId: rid, locator: string, nextPageToken: null, pageSize: number, sortOrder: null}, response: {comments: [], resolvedReferences: [], nextPageToken: null, totalCommentCount: number}}]}

### POST /compass/api/batch/resources
- count 4, status 200
- request: [rid]
- response: {{key}: {rid: rid, name: string, created: {time: datetime, userId: uuid}, modified: {time: datetime, userId: uuid}, lastModified: number, description: string, operations: [string], urlVariables: {compass:isProject: string}, favorite: null, branches: [{name: string, rid: rid, urlVariables: {…}, classificationRids: [rid]}], defaultBranch: null, defaultBranchWithMarkings: null, branchesCount: null, hasBranches: null, hasMultipleBranches: null, backedObjectTypes: null, path: string, longDescription: null, directlyTrashed: boolean, inTrash: boolean, isAutosave: boolean, isHidden: boolean, isPreviewResource: boolean, collections: null, namedCollections: [], …}}

### POST /compass/api/resources/batch/branches-by-name
- count 2, status 200
- request: {rids: [rid], names: [string]}
- response: {branchesByName: [{rid: rid, branchesByName: {master: [{…}]}}]}

### POST /compass/api/resources/{rid}/branches-by-name
- count 1, status 200
- request: [string]
- response: {rid: rid, branchesByName: {master: [{branch: {…}, markings: [{…}], satisfiesConstraints: boolean, classificationBanner: null}]}}

### POST /data-health/api/code-checks/results/batch/jobs
- count 1, status 200
- request: {jobRids: [rid]}
- response: {latestRunResultsByJob: {}}

### POST /documentation/api/v2/release-notes/pagination
- count 12, status 200
- request: {productId: string, applicationIds: [string], pageSize: number}
- response: {releaseNotes: [{id: string|uuid, type: string, description: string, categoryTitle: string, categoryId: string, applicationTitle: string, applicationId: string, date: datetime, title: string, prominence: string, releaseVersion: string, productId: string, frontendApplicationId: string, mediaFilenames: [string], longDescription: null|string, applications: [{…}]}], nextOffset: number}

### POST /eddie/api/deployment/{rid}/sandboxes/{uuid}/version/{uuid}/targets/status
- count 10, status 200
- response: {statuses: {{key}: {type: string, dataset: {type: string, deployed: {…}}}}}

### POST /eddie/api/examples/get
- count 3, status 200
- request: {identifiers: [{expression: {expressionId: string, version: {…}}, type: string}], pipelineRid: rid}
- response: [{type: string, success: {identifier: {type: string, expression: {…}}, examples: [{…}]}}]

### POST /eddie/api/input-resolution/resolve-v2
- count 5, status 200
- request: {inputs: [{dataset: {rid: rid}, type: string}], branch: string, backend: string, fallbackBranches: [string]}
- response: {resolvedInputs: [{unresolvedInput: {type: string, dataset: {…}}, resolvedInput: {type: string, dataset: {…}}}]}

### POST /eddie/api/instantiated-transforms/check-buildable-compacted
- count 7, status 200
- request: {pipeline: {transforms: [{id: uuid, transformId: string, transformVersion: {…}, arguments: {…}}], groups: [], groupedExpressions: [], targets: [{id: uuid, target: {…}, source: {…}, unmarkings: []}], outputs: [], arguments: {}, backendSettings: {computeProfile: {computeProfileId: uuid, arguments: {…}}, configuration: {commitEmptyIncrementalTransactions: {…}, udfBatchSize: {…}, unzipMaxParallelism: {…}, enableColumnStats: {…}, requireIncrementalExecution: {…}}}, samplingStrategies: {ridToStrategy: {}}, skippedTransforms: [], persistedTransforms: []}, backendType: string, branch: string, scope: {pipeline: {pipelineRid: rid}, type: string}, pinnedInputs: [{dataset: {datasetParameter: {…}, startT…
- response: {compactedTypes: {{key}: {types: [{…}]}}, result: {type: string, success: {transforms: {{key}: {…}}, targets: {{key}: {…}}, globalWarnings: []}}}

### POST /eddie/api/instantiated-transforms/check-testable-compacted
- count 7, status 200
- request: {pipeline: {transforms: [{id: uuid, transformId: string, transformVersion: {…}, arguments: {…}}], groups: [], groupedExpressions: [], targets: [{id: uuid, target: {…}, source: {…}, unmarkings: []}], outputs: [], arguments: {}, backendSettings: {computeProfile: {computeProfileId: uuid, arguments: {…}}, configuration: {commitEmptyIncrementalTransactions: {…}, udfBatchSize: {…}, unzipMaxParallelism: {…}, enableColumnStats: {…}, requireIncrementalExecution: {…}}}, samplingStrategies: {ridToStrategy: {}}, skippedTransforms: [], persistedTransforms: []}, backendType: string, scope: {pipeline: {pipelineRid: rid}, type: string}, tests: [], testData: []}
- response: {compactedTypes: {}, result: []}

### POST /eddie/api/natural-language-converter/aip-enabled
- count 3, status 200
- request: {}
- response: {aipEnabled: boolean, enabledFeatures: [{type: string, errorEnhancer: {}, suggestions: {}, search: {}, proposalDescription: {}, crs: {}}], disabledFeatures: [], availableModels: [rid]}

### POST /eddie/api/pipelines-v2/get-sandboxes-with-snapshots
- count 10, status 200
- request: {requests: [{pipelineRid: rid, sandboxId: uuid}]}
- response: {sandboxes: [{pipelineRid: rid, sandbox: {id: uuid, name: string, backingBranch: string, fallbackBranches: [string], attribution: {…}, version: uuid, isArchived: boolean, fromSandbox: {…}, isPublished: boolean, globalBranchRid: rid}, version: {id: uuid, message: string, attribution: {…}, backend: string}, snapshot: {transforms: [{…}], targets: [{…}], groups: [], groupedExpressions: [], outputs: [], arguments: {…}, backendSettings: {…}, skippedTransforms: [], persistedTransforms: [], samplingStrategies: {…}}, display: {transforms: [{…}], targets: [{…}], groups: [], datasets: [{…}], mediaSets: [], charts: [], sources: [], clusters: [{…}], colorDisplayNodes: [], displayFolders: [], textNodes: [], colorPalettes: []}, packaging: {inputDatasets: []}, unitTests: {tests: [], data: []}, evalSuites: {evalSuites: [], metInputsByEvalSuite: []}}]}

### POST /eddie/api/pipelines-v2/get/by-rids
- count 2, status 200
- request: [rid]
- response: {pipelines: {{key}: {rid: rid, name: string, attribution: {time: datetime, user: uuid}, publishedSandboxes: [uuid], heartbeats: {}, compassDetails: {trashed: boolean, favorite: boolean}}}}

### POST /eddie/api/pipelines-v2/markings/{rid}/markings-propagation/{uuid}
- count 3, status 200
- request: {backendType: string, pipelineSnapshot: {transforms: [{id: uuid, transformId: string, transformVersion: {…}, arguments: {…}}], groups: [], groupedExpressions: [], targets: [{id: uuid, target: {…}, source: {…}, unmarkings: []}], outputs: [], arguments: {}, backendSettings: {computeProfile: {computeProfileId: uuid, arguments: {…}}, configuration: {commitEmptyIncrementalTransactions: {…}, udfBatchSize: {…}, unzipMaxParallelism: {…}, enableColumnStats: {…}, requireIncrementalExecution: {…}}}, samplingStrategies: {ridToStrategy: {}}, skippedTransforms: [], persistedTransforms: []}}
- response: {markings: {{key}: {orgPropagatedMarkings: {{key}: [rid]}, orgGroupPropagatedMarkings: {}, propagatedMarkings: {}, groupPropagatedMarkings: {}, resultingCbacMarkings: []}}, inputsForTargets: {{key}: {connectedOnBuilderGraph: [rid], inputsInheritedFromJobGrouping: []}}}

### POST /eddie/api/pipelines-v2/resolve-job-groupings
- count 5, status 200
- request: {pipelineRid: rid, pipelineSnapshot: {transforms: [{id: uuid, transformId: string, transformVersion: {…}, arguments: {…}}], groups: [], groupedExpressions: [], targets: [{id: uuid, target: {…}, source: {…}, unmarkings: []}], outputs: [], arguments: {}, backendSettings: {computeProfile: {computeProfileId: uuid, arguments: {…}}, configuration: {commitEmptyIncrementalTransactions: {…}, udfBatchSize: {…}, unzipMaxParallelism: {…}, enableColumnStats: {…}, requireIncrementalExecution: {…}}}, targetSettings: {jobGroupings: []}, samplingStrategies: {ridToStrategy: {}}, skippedTransforms: [], persistedTransforms: []}, backend: string}
- response: {jobGroupings: [{type: string, backendDefault: {pipelineTargetIds: [uuid]}}]}

### POST /eddie/api/pipelines-v2/{rid}/proposals/by-created-at
- count 5, status 200
- request: {statusKind: string, sourceSandboxIds: [uuid]}
- response: {proposals: [{pipelineRid: rid, id: uuid, proposalRid: rid, details: {name: string, description: string, sourceSandbox: uuid, targetSandbox: uuid}, status: {type: string, open: {…}}, attribution: {time: datetime, user: uuid}, version: uuid}]}

### POST /eddie/api/transformations/available-logical-types
- count 3, status 200
- request: {scope: {pipeline: {pipelineRid: rid}, type: string}}
- response: {logicalTypes: []}

### POST /eddie/api/transformations/logical-types
- count 3, status 200
- request: {scope: {pipeline: {pipelineRid: rid}, type: string}, logicalTypes: []}
- response: {definitions: []}

### POST /foundry-metadata/api/metadata/batch/namespaced-dataset-view-metadatas
- count 4, status 200
- request: [{branchId: string, datasetRid: rid, endTransactionRid: rid, namespace: string}]
- response: {entries: [{key: {datasetRid: rid, branchId: string, namespace: string, endTransactionRid: rid, versionId: null}, value: null}]}

### POST /foundry-metadata/api/schemas/batch/schemas
- count 4, status 200
- request: [{datasetAndBranchId: {branchId: string, datasetRid: rid}, endTransactionRid: rid, versionId: uuid}]
- response: {entries: [{key: {datasetAndBranchId: {…}, endTransactionRid: rid, versionId: uuid}, value: {branchId: string, transactionRid: rid, versionId: uuid, schema: {…}, attribution: {…}}}]}

### POST /foundry-search/api/compass/v0/search
- count 2, status 200
- request: {query: {includeResources: [string], filter: {isProjectPreview: boolean, type: string}, text: string}, limit: number, sort: {order: string, category: string}, offset: number}
- response: {result: [{indexedResource: {type: string, service: string, name: string, displayName: string, resource: {…}, instance: string, locator: uuid, shortDescription: string, path: string, inTrash: boolean, directlyTrashed: boolean, isAutosave: boolean, isPreviewResource: boolean, collections: [], tags: [], linkedItems: [], branchUrlVariables: [], deprecation: null, markings: [uuid], directRoleGrants: [{…}], projectRid: rid, namespaceRid: rid, portfolioRid: null, isProject: boolean, isNamespace: boolean, …}, highlights: {}}], scrollId: null, nextSearchAfterPageToken: null}

### POST /foundry-stats/api/computed-stats-v2/get-v2
- count 1, status 200
- request: {datasetRid: rid, branch: string, endTransactionRid: rid}
- response: {datasetRid: rid, branch: string, endTransactionRid: rid, schemaId: uuid, computedDatasetStats: {rowCount: string, approximateRowCount: null, sizeInBytes: string, columnStats: {item_name: {type: string, emptyColumnStats: {…}}, quantity: {type: string, emptyColumnStats: {…}}, consolidated_customer_id: {type: string, emptyColumnStats: {…}}, days_until_due: {type: string, emptyColumnStats: {…}}, order_due_date: {type: string, emptyColumnStats: {…}}, assignee: {type: string, emptyColumnStats: {…}}, customer_name: {type: string, emptyColumnStats: {…}}, status: {type: string, emptyColumnStats: {…}}, customer_id: {type: string, emptyColumnStats: {…}}, order_id: {type: string, emptyColumnStats: {…}}, unit_price: {type: string, emptyColumnStats: {…}}}}}

### POST /foundry-telemetry-service/api/containers/{rid}/sessions/{uuid}/logs/read/v3
- count 2, status 200
- request: {fromInclusive: number, toExclusive: number, pageSizeLimit: number, chronological: boolean, filter: {andLogFilter: {filters: []}, type: string}}
- response: {logEntries: [{type: string, payload: {type: string, serviceLogV1: {…}}, entityName: string, entityVersion: string}]}

### POST /foundry-telemetry-service/api/containers/{rid}/sessions/{uuid}/metrics/read
- count 6, status 200
- request: {fromInclusive: number, toExclusive: number, metricSeriesIds: [{name: string, tags: [{…}]}]}
- response: {metricSeries: [{id: {name: string, tags: [{…}]}, values: [{…}]}]}

### POST /foundry-telemetry-service/api/info/sessions/by-run-rids/get-batch
- count 2, status 200
- request: {runRids: [rid]}
- response: {runRidsToContainerAndSessionIds: {{key}: {containerRid: rid, sessionId: uuid}}}

### POST /foundry-telemetry-service/api/v2/containers/{rid}/sessions/{uuid}/metrics/search
- count 8, status 200
- request: {query: {filter: {name: {name: string}, type: string}}, fromInclusive: number, toExclusive: number}
- response: {matchingSeriesIds: [{name: string, tags: [{…}]}]}

### POST /graphql-gateway/api/bulk
- count 5, status 200
- request: {operations: {}, requests: [{hash: string, name: string, variables: {pipelineRid: rid, sandboxId: uuid, filter: {…}, markingId: uuid}}]}

### POST /job-tracker/api/builds/bulkV2
- count 4, status 200
- request: [{buildFilter: {filter: {userIds: [], excludedUserIds: [], datasetRids: [], branchIds: [string], scheduleIds: [], excludedBranchIds: [], jobDatasetRids: [rid], buildStatuses: [], jobTypes: [], excludedJobTypes: [], transformTypes: [], excludedTransformTypes: [], inputDatasetRids: [], buildIds: [], projectRids: []}, type: string}, sort: {type: string, direction: string}, limit: number}]
- response: [{buildDetails: [{buildId: rid, user: string, userId: uuid, startedTime: datetime, finishedTime: datetime, outputDatasets: [{…}], buildStatus: string, jobs: [{…}], syncs: [], vectorDetails: [], statusDetails: null, securedProperties: {…}, restrictedJobCount: number, scheduleId: null, projectRids: [rid], dockerArtifactIds: []}], buildCount: number}]

### POST /job-tracker/api/jobs
- count 1, status 200
- request: {limit: number, jobFilter: {outputDatasetRids: [rid], branchIds: [string], statuses: [string], outputDatasetRidsMatchStrategy: string, buildIds: [], projectRids: []}}
- response: {jobDetails: [{buildId: rid, jobId: rid, jobSpecId: rid, startedWaitingTime: datetime, submittedTime: datetime, finishedTime: datetime, outputDatasets: [{…}], inputDatasetRids: [rid], outputTransactions: [{…}], syncDetails: null, vectorDetails: null, jobStatus: string, jobQueues: {}, canceledAttribution: null, securedProperties: {jobType: string, transformType: string, statusDetails: null}, branchId: string, projectRids: [rid], dockerArtifactIds: [], outputMediaSetWriteContexts: []}]}

### POST /job-tracker/api/jobs/driverLog
- count 1, status 200
- request: {datasetRid: rid, transactionRid: rid, fileRange: {min: number, max: number}, logType: string}

### POST /monocle/api/links
- count 5, status 200
- request: {resourceIdentifiers: [rid], branch: string, fallbacks: [string], serviceTypeFilter: []}
- response: {nodes: [{resourceIdentifier: rid, links: [{…}]}]}

### POST /monocle/api/links/graphV3
- count 1, status 200
- request: {resourceIdentifiers: [rid], branch: {type: string, legacyBranch: {branch: string, fallbacks: []}}, serviceTypeFilter: []}
- response: {nodes: [{resourceIdentifier: rid, links: [{…}]}]}

### POST /multipass/api/authz/batch/operations
- count 3, status 200
- request: [rid]
- response: {resourceToOperationsMap: {{key}: [string]}}

### POST /multipass/api/users
- count 2, status 200
- request: [uuid]
- response: [{id: uuid, username: string, attributes: {multipass:email:primary: [string], multipass:given-name: [string], multipass:organization-rid: [rid], multipass:family-name: [string], multipass:realm: [uuid], multipass:organization: [string], multipass:realm-name: [string]}}]

### POST /ontology-metadata/api/ontology/v2/load/all
- count 3, status 200
- request: {externalMappingConfigurationFilters: []}
- response: {ontologies: {{key}: {apiName: string, displayName: string, description: string, currentOntologyVersion: uuid, currentSystemOntologyVersion: uuid, defaultBranchRid: rid, namespace: string, ontologyOwnersGroupId: uuid, ontologyOwnersGroupIds: [uuid], governanceBoardGroupId: null|uuid, organizationMarkingIds: [uuid], ontologyAdminConfig: {enableUsage: boolean, suggestProjectsPermissionModel: boolean}, isShared: boolean, compassNamespaceRid: rid, ontologyProjectRid: rid, areOrganizationMarkingsInheritedFromNamespace: boolean, areRolesEnabled: boolean, roleGrants: [{…}], restrictedRoleGrants: [], externalMappingConfigurations: [], permissionModel: {type: string, rolesEnabled: {…}, rolesEnforced: {…}}, isDefaultOntologyMultiOrg: boolean, semanticSearchIndexingStatus: string, enabledObjectStoragesStatus: string, ontologyApiNamespaceIdentifier: null}}}

### POST /people/api/eventsink/create-events
- count 3, status 200
- request: {createEventRequests: [{viewEvent: {metadataAdditions: {…}, resourceParameters: {…}, resourceRid: rid, userId: uuid}, type: string}]}
- response: {createEventResponses: [{eventRid: rid}]}

### POST /people/api/personal/get-favorites
- count 8, status 200
- request: {userId: uuid}
- response: {orderedFavorites: [{resourceRid: rid, lastFavorited: datetime}]}

### POST /scheduler/api/scheduler/get-schedule-runs-by-result
- count 8, status 200
- request: [rid]
- response: {}

### POST /scheduler/api/scheduler/get-schedules
- count 8, status 200
- request: []
- response: {}

### POST /spark-reporter/api/batch
- count 1, status 200
- request: [uuid]
- response: {{key}: {jobGroupMetadata: {resourceManagementUsageType: string, resourceManagementMetadata: null, appName: string, inputDatasetRids: [rid], metadata: {}, sparkConfig: null, outputDatasetRids: [rid], branch: string, projectRid: null, userId: uuid, originatorRid: null, jobInitializer: null, requestedResources: {driverCores: number, driverMemoryInMib: number, gpuResources: null, executorCores: number, executorMemoryInMib: number, executorInstances: number}, jobResources: {type: string, static: {…}}, resourceChannel: null, resourcePoolRid: rid, buildId: null, jobResourceAttribution: [{…}], sparkModuleMetadata: {sparkModuleId: rid, sparkModuleType: string, sparkModuleVersion: string, kubernetesNamespace: null}, foundryJobLifeCycleBehaviour: null}, jobGroupProgress: {stageProgress: {{key}: [{…}]}, isProgressComplete: boolean}}}

### POST /spark-reporter/api/progress/jobs/batch
- count 3, status 200
- request: [uuid]
- response: {{key}: {progress: {{key}: {stageAttemptInfo: {…}, runningTaskMetrics: {…}, failedTaskMetrics: {…}, succeededTaskMetrics: {…}}}, isProgressComplete: boolean}}

### PUT /eddie/api/external-transforms/all
- count 3, status 200
- request: {scope: {pipeline: {pipelineRid: rid}, type: string}}
- response: {transforms: []}

### PUT /eddie/api/external-transforms/installed-functions-for-snapshot
- count 5, status 200
- request: {snapshot: {transforms: [{id: uuid, transformId: string, transformVersion: {…}, arguments: {…}}], targets: [{id: uuid, target: {…}, source: {…}, unmarkings: []}], groups: [], groupedExpressions: [], outputs: [], arguments: {}, backendSettings: {computeProfile: {computeProfileId: uuid, arguments: {…}}, configuration: {commitEmptyIncrementalTransactions: {…}, udfBatchSize: {…}, unzipMaxParallelism: {…}, enableColumnStats: {…}, requireIncrementalExecution: {…}}}, skippedTransforms: [], persistedTransforms: []}, scope: {pipeline: {pipelineRid: rid}, type: string}}
- response: {models: []}

### PUT /eddie/api/pipelines-v2/get-sandbox-with-snapshot-for-global-branch
- count 2, status 200
- request: {pipelineRid: rid, globalBranchRid: rid}
- response: {pipelineRid: rid, sandbox: {id: uuid, name: string, backingBranch: string, fallbackBranches: [string], attribution: {time: datetime, user: uuid}, version: uuid, isArchived: boolean, fromSandbox: {id: uuid, backingBranch: string, version: uuid}, isPublished: boolean, globalBranchRid: rid}, version: {id: uuid, message: string, attribution: {time: datetime, user: uuid}, backend: string}, snapshot: {transforms: [{id: uuid, transformId: string, transformVersion: {…}, arguments: {…}}], targets: [{id: uuid, target: {…}, source: {…}, unmarkings: []}], groups: [], groupedExpressions: [], outputs: [], arguments: {}, backendSettings: {computeProfile: {computeProfileId: uuid, arguments: {…}}, configuration: {commitEmptyIncrementalTransactions: {…}, udfBatchSize: {…}, unzipMaxParallelism: {…}, enableColumnStats: {…}, requireIncrementalExecution: {…}}}, skippedTransforms: [], persistedTransforms: []}…

