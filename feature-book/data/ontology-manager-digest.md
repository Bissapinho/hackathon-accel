# Crawl digest

Sources: out/ontology, out-targeted/ontology-home-action-type, out-test/ontology-home-object-type, out-shapes/ontology

## Screen kinds (57)

### /workspace/ontology/action-type/{rid}/automations
- title: Automations | Add One State Callout · Automations | Edit Callout
- reached by: Add One State Callout Create object Experimental > Automations | Action types 6 > Edit Callout Modify object Experimental > Automations
- headings: Ontology Manager · No automations defined for this action type
- fields: View all related resources
- empty states: No automations defined for this action type Configure an automation to run this action type automati
- controls: Add automation
- calls: POST /graphql-gateway/api/bulk · POST /people/api/personal/get-favorites

### /workspace/ontology/action-type/{rid}/capabilities
- title: Capabilities | Add One State Callout · Capabilities | Edit Callout
- reached by: Add One State Callout Create object Experimental > Capabilities | Add One State Callout Create object Experimental > Capabilities > Only actions without ext… | Add One State Callout Create object Experimental > Capabilities > Retry mode on transient …
- headings: Ontology Manager
- fields: View all related resources · checkbox · radio
- controls: Only actions without external calls · Retry mode on transient errors
- overlays: Only actions without external calls All actions Disabled
- calls: POST /people/api/personal/get-favorites

### /workspace/ontology/action-type/{rid}/observability
- title: Observability | Add One State Callout · Observability | Edit Callout
- reached by: Add One State Callout Create object Experimental > Observability | Add One State Callout Create object Experimental > Observability > Show my runs only | Add One State Callout Create object Experimental > Observability > Past 1 day
- headings: Ontology Manager · Observability · No metric data available · No requests found
- fields: View all related resources · Blueprint6.RadioGroup-0 · text · Any · Select a user…
- empty states: No metric data available Try expanding the date range to load more metrics · No requests found
- controls: Past 1 day · Workflow Lineage · Collapse sidebar · Show my runs only · Select a user… · s · Select a reason… · Select a resource… · Monitor this action · Reset · Clear · Past 15 minutes · Past 30 minutes · Past 1 hour · Past 4 hours · Past 2 days · Past 1 week · Past 30 days · Select from calendar · milliseconds · seconds · minutes · Expand sidebar
- overlays: Past 15 minutes Past 30 minutes Past 1 hour Past 4 hours Past 1 day Past 2 days Past 1 week Past 30  ‖ milliseconds seconds minutes ‖ Authentication failure Conflict failure Invalid parameter failure Non-user-facing function failure S
- calls: POST /foundry-telemetry-service/api/execution-history-query/logs/retention/metric/load · POST /graphql-gateway/api/bulk · POST /foundry-telemetry-service/api/execution-history-query/logs/retention/request/load · GET /multipass/api/authz/access/{rid} · POST /foundry-telemetry-service/api/owning-rid/{rid}/metrics/expression · POST /people/api/personal/get-favorites

### /workspace/ontology/action-type/{rid}/overview
- title: Add One State Callout · Edit Callout · [Example] Assign Alert
- reached by: Add One State Callout Create object Experimental | Add One State Callout Create object Experimental > Workshop 1 | Add One State Callout Create object Experimental > Automation 0
- headings: Ontology Manager · No Automations
- fields: View all related resources · Search resources…
- empty states: None · No Automations Automations allow you to trigger effects based on ontology data changes. Learn more
- controls: Marketplace · Open AIP Now Ontology · Actions · Open in · Show help text · Copy to clipboard · Edit · Edit action type classes · Experimental · [Example] Explainer · Zoom in · Zoom out · Zoom to fit · Workshop 1 · Automation 0 · Developer Console App 0 · Object View 0 · Process 0 · Quiver Dashboard 0 · Navigate to /workspace/module/view/latest/ri.workshop.main.module.1957ceda-9152-455a-8c6e-f562aa5fa3 · Action types · Overview · Rules · Parameters · User Interface · Capabilities · Security & Submission Criteria · Automations · Observability · No tool description · (+14)
- overlays: Workshop 1 Automation 0 Developer Console App 0 Object View 0 Process 0 Quiver Dashboard 0 ‖ Duplicate Project permission migration Delete ‖ Workflow Lineage I
- calls: POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · GET /multipass/api/authz/markings/usable · PUT /ontology-metadata/api/permissions/actionTypes · PUT /multipass/api/organizations/v2/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/usageMetadata · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · PUT /ontology-metadata/api/permissions/objectTypes · POST /ontology-metadata/api/entityMetadata/load · POST /data-health/api/monitoring/global/statuses · POST /multipass/api/authz/batch/operations · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · GET /language-model-service/api/config/v1/enabled · POST /ontology-metadata/api/ontology/v2/modification/history/entity · PUT /foundry-dependency-service/api/dependencies/get-tagged-dependents-all-versions · POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/usage/checkActionTypeProvenanceStatus · POST /people/api/profile/get-profiles · GET /compass/api/registry/actions · POST /compass/api/batch/resources · POST /people/api/personal/get-favorites · (+1)

### /workspace/ontology/action-type/{rid}/overview  [dialog: Agent tool description]
- title: Edit Callout
- reached by: Action types 6 > Edit Callout Modify object Experimental > No tool description | Action types 6 > Edit Callout Modify object Experimental > No tool description > Workshop … | Action types 6 > Edit Callout Modify object Experimental > No tool description > Automatio…
- headings: Ontology Manager · Agent tool description · No Automations
- fields: View all related resources · Add an in-depth description that helps agents understand how to use this action within the ontology.
- empty states: None · No Automations Automations allow you to trigger effects based on ontology data changes. Learn more
- controls: Workshop 1 · Automation 0 · Developer Console App 0 · Object View 0 · Process 0 · Quiver Dashboard 0 · Close · Cancel · Save
- overlays: Workshop 1 Automation 0 Developer Console App 0 Object View 0 Process 0 Quiver Dashboard 0 ‖ Agent tool description Write Preview This editor supports Markdown. Learn more. Cancel Save
- calls: POST /people/api/personal/get-favorites

### /workspace/ontology/action-type/{rid}/overview  [dialog: Duplicate action type]
- title: Add One State Callout
- reached by: Add One State Callout Create object Experimental > Actions > Duplicate
- headings: Ontology Manager · No Automations
- fields: Search resources… · text
- empty states: None · No Automations Automations allow you to trigger effects based on ontology data changes. Learn more
- controls: Workshop 1 · Automation 0 · Developer Console App 0 · Object View 0 · Process 0 · Quiver Dashboard 0 · palantir learn · Browse · expand section · Cancel · Permissions
- overlays: Workshop 1 Automation 0 Developer Console App 0 Object View 0 Process 0 Quiver Dashboard 0 ‖ Duplicate action type New action type name Select a location to save this action type to palantir le
- calls: POST /graphql-gateway/api/bulk

### /workspace/ontology/action-type/{rid}/parameters
- title: Parameters | Add One State Callout · Parameters | Edit Callout
- reached by: Add One State Callout Create object Experimental > Parameters | Add One State Callout Create object Experimental > Parameters > Preview | Add One State Callout Create object Experimental > Parameters > Test run
- headings: Ontology Manager · Test run
- tabs: Preview · Test run
- fields: View all related resources · text · textarea · Type to search…
- empty states: Test run Fill in the form and click submit to run a test
- controls: Add new parameter · Add section · Close sidebar · Preview · Test run · 1 issue · Cancel · Submit · Title Used in Rules and Submission Criteria · Text Used in Rules · New section · Link Text Used in Rules · Link Url Used in Rules · Select an option… · One State Callout Used in Rules · Advanced Charts · Chart Filtering · Comparing Cohorts · Complex Pivot Tables · Conditional Formatting · Conditional Section Visibility · Dynamic Descriptions with Object References · Enriched Chart Layout · Exporting Data · Filter to the Current User · Free-Form Analysis · Global Filters · Headers in Workshop · Ma…
- overlays: Advanced Charts Chart Filtering Comparing Cohorts Complex Pivot Tables Conditional Formatting Condit
- calls: POST /actions/api/actions/validatePreview · POST /graphql-gateway/api/bulk · POST /checkpoints/api/checkpoints/configuration/getConfigsV5 · POST /people/api/personal/get-favorites · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /ontology-metadata/api/ontology/linkTypesForObjectTypesV2 · POST /objects-data-funnel/api/view/currentV4 · PUT /object-set-service/api/objectSets/objects/top/initial · POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /ontology-metadata/api/ontology/v2/modification/history/entity

### /workspace/ontology/action-type/{rid}/parameters/parameter/{rid}
- title: One State Callout | Edit Callout · Title | Edit Callout
- reached by: Action types 6 > Edit Callout Modify object Experimental > One State Callout | Action types 6 > Edit Callout Modify object Experimental > One State Callout > Value | Action types 6 > Edit Callout Modify object Experimental > One State Callout > Overrides
- headings: Ontology Manager · One State Callout · Title
- tabs: Value · Display · Overrides · Details · Preview · Test run
- fields: View all related resources · Visible · Disabled · Required · Toggle allow multiple values · Toggle default value · text · textarea · Search... · checkbox · Search type... · 0 · radio
- empty states: Override this parameter when conditions are met. "One State Callout is hidden when current user is a
- controls: Back to Form · Add new section · Add new parameter · Delete parameter · Value · Display · Overrides · Details · Object reference · [Example] Explainer Example · Add override · [Example] Explainer · Remove object set · On a property · Get linked objects · Close sidebar · Preview · Test run · Select an option… · 1 issue · Cancel · Submit · New section SECTION · Status · Boolean · String · Integer · Long · Double · Date · (+25)
- overlays: Status Recents An Order [Example] Aircraft [Example] Airport [Example] Carrier [Example] Explainer [ ‖ Recents An Order [Example] Aircraft [Example] Airport [Example] Carrier [Example] Explainer [Example ‖ Promoted Experimental Example Active Deprecated
- calls: POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /actions/api/actions/validatePreview · POST /ontology-metadata/api/ontology/linkTypesForObjectTypesV2 · POST /objects-data-funnel/api/view/currentV4 · POST /checkpoints/api/checkpoints/configuration/getConfigsV5 · PUT /object-set-service/api/objectSets/objects/top/initial · POST /people/api/personal/get-favorites

### /workspace/ontology/action-type/{rid}/parameters/section/section-2
- title: New section | Add One State Callout
- reached by: Add One State Callout Create object Experimental > Parameters > Add section
- headings: Ontology Manager · Test run
- tabs: Preview · Test run
- fields: View all related resources · Add display name… · Add description… · checkbox
- empty states: Test run Fill in the form and click submit to run a test
- controls: 2 edits 1 1 · Save · Back to Form · Add new section · Delete section · Create new parameter · Add existing parameter · Add conditional override · Title · Text · New section SECTION · Link Text · Link Url · 2 Columns · Hidden
- calls: POST /graphql-gateway/api/bulk

### /workspace/ontology/action-type/{rid}/rules
- title: Rules | Add One State Callout · Rules | Edit Callout
- reached by: Add One State Callout Create object Experimental > Rules | Add One State Callout Create object Experimental > Rules > TypeScript v1 | Add One State Callout Create object Experimental > Rules > Python
- headings: Ontology Manager
- tabs: TypeScript v1 · Python · TypeScript v2
- fields: View all related resources · textarea · Search...
- controls: Delete · [Example] Explainer Example · Add new rule · TypeScript v1 · Python · TypeScript v2 · 1. Create object [Example] Explainer · Unique Identifier 1 · Status · Please select a parameter · Add property · 1. Modify object One State Callout · One State Callout · Link Url · Text · Title · Link Text
- overlays: Status Recents [Example] Explainer All [Example] Airport [Example] Carrier [Example] Route Alert [Ex ‖ Recents [Example] Explainer All [Example] Airport [Example] Carrier [Example] Route Alert [Example] 
- calls: POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /people/api/personal/get-favorites

### /workspace/ontology/action-type/{rid}/security
- title: Security | Add One State Callout · Security | Edit Callout
- reached by: Add One State Callout Create object Experimental > Security & Submission Criteria | Add One State Callout Create object Experimental > Security & Submission Criteria > Ontolo… | Add One State Callout Create object Experimental > Security & Submission Criteria > Ontolo…
- headings: Ontology Manager
- fields: View all related resources · checkbox · Add a user or group… · radio · text
- controls: Migrate to project permissions · ontology-metadataontology-metadata · Ontology Owner · Remove · Ontology Viewer · Copy or paste Submission Criteria · Foundry Automate · Title is not null · condition · logical operator · Ontology Owner Can edit ontology entities and has full control over their security. · Ontology Viewer Can view ontology entities, but can't edit them. · Ontology Editor Can edit ontology entities. · Ontology Discoverer Can only see ontology entities' name and metadata, excluding their schema. · Open user in new tab · Delete condition · Change selection · Title · Select a parame…
- overlays: Ontology Owner Can edit ontology entities and has full control over their security. Ontology Viewer  ‖ Ontology Viewer Can view ontology entities, but can't edit them. Ontology Discoverer Can only see on ‖ O ontology-metadata (ontology-metadata) Open user in new tab
- calls: PUT /multipass/api/authz/markings/usable · POST /graphql-gateway/api/bulk · POST /people/api/personal/get-favorites · POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata

### /workspace/ontology/action-type/{rid}/user-interface
- title: User interface | Add One State Callout · User interface | Edit Callout
- reached by: Add One State Callout Create object Experimental > User Interface | Action types 6 > Edit Callout Modify object Experimental > User Interface
- headings: Ontology Manager · This configuration currently only applies to Actions in Workshop and Slate apps.
- tabs: Preview · Test run
- fields: View all related resources · radio · checkbox · Customize submit button · Enable success message · Edits successfully applied. · Enable applying message · Applying edits... · Allow revert after action submission · text · textarea
- controls: Add new parameter · Add section · Close sidebar · Preview · Test run · Collapse form section New section · 1 issue · Cancel · Title Used in Rules and Submission Criteria · Text Used in Rules · New section · Link Text Used in Rules · Link Url Used in Rules · New section New Empty · Select an option… · Submit · One State Callout Used in Rules
- calls: POST /actions/api/actions/validatePreview · POST /graphql-gateway/api/bulk · POST /checkpoints/api/checkpoints/configuration/getConfigsV5 · POST /people/api/personal/get-favorites

### /workspace/ontology/home/action-type
- title: Action types
- reached by: Action types 6 | Action types 6 > Action type rule | Action types 6 > Add One State Callout Create object Experimental
- headings: Ontology Manager
- fields: Search resources… · checkbox
- columns: Name · Rules · Status
- controls: New action type · Search… · Status · Action type rule · Add filter · Show column options · Configure columns · Add One State Callout Create object Experimental · Edit Callout Modify object Experimental · Navigate to resource · [Example] Add Route Alert Comment Create object Experimental · [Example] Assign Alert Modify object Experimental · [Example] Close Alert Modify object Experimental · [Example] Update Route Alert Status Modify object Experimental · Discover · Proposals · Object types 13 · Properties · Shared properties 0 · Link types 13 · Action types 6 · Groups 0 · Interfaces 0 · Value t…
- overlays: Filter by Action type rule Create object 2 Modify object 4 Create or modify object 0 Delete object 0 ‖ Sort ascending Sort descending ‖ Filter by Status Active 0 Experimental 6 Example 0 Deprecated 0
- calls: POST /graphql-gateway/api/bulk · GET /multipass/api/authz/markings/usable · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · PUT /ontology-metadata/api/permissions/actionTypes · PUT /multipass/api/organizations/v2/all · GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /ontology-metadata/api/ontology/featureConfigurations · POST /ontology-metadata/api/ontology/v2/load/all · POST /ontology-metadata/api/organization/getSettings/user · GET /aip-assist/api/chat/checkAvailability · POST /ontology-metadata/api/ontology/ontology/load/{rid}/summary · POST /ontology-metadata/api/ontology/ontology/load/{rid}/{uuid}/loadAllObjectTypes · POST /ontology-metadata/api/actions/types/load/all/{rid}/{uuid} · POST /multipass/api/authz/batch/operations · GET /ontology-metadata/api/permissions/ontology/{rid} · GET /workspace/api/lifecycleStatusByApplication · POST /people/api/personal/get-favorites

### /workspace/ontology/home/advanced
- title: Ontology configuration
- reached by: Ontology configuration | Ontology configuration > Ontology Owner | Ontology configuration > ontology-e0d434c7-694a-4310-8c70-b83f19bf74c5
- headings: Ontology Manager · No ontology products available
- fields: Search resources… · Add a group… · checkbox
- empty states: No ontology products available
- controls: Navigate to /workspace/compass/view/ri.compass.main.folder.376bada7-e6b7-41bc-9378-4ff6ee6bb7ce · Ontology Owner · Remove · Ontology Editor · Proceed to migration · billysorg Ontology · Ontology · ontology-e0d434c7-694a-4310-8c70-b83f19bf74c5 · Ontology Editor Can edit ontology entities. · Ontology Owner Can edit ontology entities and has full control over their security.
- overlays: Ontology Editor Can edit ontology entities. Ontology Owner Can edit ontology entities and has full c
- calls: PUT /multipass/api/roles/v2/roleSets · POST /graphql-gateway/api/bulk · POST /multipass/api/users · POST /multipass/api/authz/batch/operations · GET /multipass/api/me/groups · POST /people/api/personal/get-favorites

### /workspace/ontology/home/cleanup
- title: Cleanup
- reached by: Cleanup
- headings: Ontology Manager · Ontology Cleanup
- fields: Search resources…
- controls: Start cleanup · Flag settings

### /workspace/ontology/home/cleanup-settings
- title: Flag settings
- reached by: Cleanup > Flag settings | Cleanup > Flag settings > Custom Choose custom flags to use
- headings: Ontology Manager
- fields: Search resources… · radio · checkbox · select-one · text
- controls: Custom Choose custom flags to use · increment · decrement · Optimized for usage Default Recommended flags for usage optimization
- calls: POST /ontology-metadata/api/usage/getSettings/user

### /workspace/ontology/home/discover
- title: Ontology Manager
- reached by: (root) | Discover
- headings: Ontology Manager
- fields: Search resources…
- calls: GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · POST /ontology-metadata/api/ontology/v2/load/all · GET /ontology-metadata/api/ontology/featureConfigurations · POST /ontology-metadata/api/organization/getSettings/user · GET /aip-assist/api/chat/checkAvailability · POST /ontology-metadata/api/ontology/ontology/load/{rid}/summary · POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/ontology/load/{rid}/{uuid}/loadAllObjectTypes · POST /ontology-metadata/api/actions/types/load/all/{rid}/{uuid} · GET /multipass/api/authz/markings/usable · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · POST /multipass/api/authz/batch/operations · PUT /multipass/api/organizations/v2/all · GET /ontology-metadata/api/permissions/ontology/{rid} · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · GET /workspace/api/lifecycleStatusByApplication · POST /phonograph2/api/objects/registry/bulk/objectTypes/usageMetadata · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · (+3)

### /workspace/ontology/home/function
- title: Functions
- reached by: Functions 427 | Functions 427 > Llama 3.3 70b Instruct Failed to load source — Active Aug 4, 12:09 PM | Functions 427 > Claude 3.5 Haiku Failed to load source — Active Aug 4, 12:09 PM
- headings: Ontology Manager
- fields: Search resources… · checkbox
- columns: Name · Source · Owning project · Status · Published Date
- controls: New function · Search… · Filter by status · Configure columns · GPT-5.4 nano Failed to load source — Active Aug 4, 12:09 PM · GPT-6 Astra Failed to load source — Active Sep 14, 3:28 PM · Gemini 2.5 Pro Failed to load source — Active Aug 4, 12:10 PM · Gemini 3.7 Flash Failed to load source — Active Aug 19, 11:10 AM · GPT-4.1 nano Failed to load source — Active Aug 4, 12:11 PM · GPT-6 Sol Failed to load source — Active Sep 22, 11:32 PM · GPT-OSS-120B Failed to load source — Active Aug 4, 12:10 PM · GPT-5.2 Pro Failed to load source — Active Aug 4, 12:11 PM · Grok 3 Mini (with Thinking) Failed to…
- overlays: Name Required Source Owning project Status Published Date ‖ Status Promoted 0 Active 427
- calls: POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/v2/load/all · POST /people/api/personal/get-favorites · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata

### /workspace/ontology/home/health-issues
- title: Health issues
- reached by: Health issues | Health issues > Filter entities
- headings: Ontology Manager
- fields: Search resources… · checkbox
- empty states: No health issues found There might be more items on the server Click here to run a search for all re · No health issues found
- controls: Filter entities · Click here to run a search for all registration and index failures
- overlays: No health issues found There might be more items on the server Click here to run a search for all re ‖ Filters Health Issues Index failed Data issue Unregistered Deindexed Status Promoted Active Experime
- calls: POST /people/api/personal/get-favorites

### /workspace/ontology/home/history
- title: History
- reached by: History
- headings: Ontology Manager · Ontology history
- fields: Search resources…
- controls: Filter edit history · Navigate to · An Order Created · Billy's Orders Created · [Example] Route Created · [Example] Flight Created · [Example] Route Alert Created · [Example] Explainer Created · [Example] Runway Created · [Example] Flight Sensor Created · [Example] Aircraft Created · [Example] Carrier Created · [Example] Route Alert Comment Created · [Example] Airport Created · [Example][Log] Update Route Alert Status Created · Flights Carriers Created · Route Alert Comments Route Alert Created · Flight Sensors Flight Created · Arriving Flights Arrival Airport Created · [Logs] Update Route Ale…
- calls: POST /ontology-metadata/api/ontology/v2/{rid}/modification/history · POST /people/api/profile/get-profiles · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · PUT /ontology-metadata/api/schemamigrations/load/objecttypes · POST /multipass/api/authz/batch/operations · POST /ontology-metadata/api/ontology/v2/load/all · POST /people/api/personal/get-favorites · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata

### /workspace/ontology/home/interfaces
- title: Interfaces
- reached by: Interfaces 0 | Interfaces 0 > Show column options | Interfaces 0 > Show column options > Sort descending
- headings: Ontology Manager
- fields: Search resources… · checkbox
- columns: Name · Status
- empty states: Could not find any Interfaces
- controls: Learn more · Dismiss · New interface · Search… · Status · Add filter · Show column options · Configure columns · Sort ascending · Sort descending
- overlays: Sort ascending Sort descending ‖ Filter by Status Active 0 Experimental 0 Example 0 Deprecated 0
- calls: POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/v2/load/all · POST /people/api/personal/get-favorites · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata

### /workspace/ontology/home/link-type
- title: Link types
- reached by: Link types 13 | Link types 13 > Aircraft Carrier Example | Link types 13 > Arriving Flights Arrival Airport Example
- headings: Ontology Manager
- fields: Search resources… · checkbox
- columns: Name · Status
- controls: New link type · Search… · Status · Add filter · Show column options · Configure columns · Aircraft Carrier Example · Arriving Flights Arrival Airport Example · Arriving Routes Destination Airport Example · Departing Flights Departure Airport Example · Departing Routes Departure Airport Example · Flights Route Example · Flights Aircraft Example · Flight Sensors Flight Example · Flights Carriers Example · Route Alerts Route Example · Route Alert Comments Route Alert Example · Runways Airports Example · [Logs] Update Route Alert Status Route Alert Example
- overlays: Add filter Reset Status Storage backend Cardinality Permission model Migration from OSv1 to OSv2 Def
- calls: POST /data-health/api/monitoring/global/statuses · POST /graphql-gateway/api/bulk · GET /multipass/api/authz/markings/usable · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · PUT /multipass/api/organizations/v2/all · PUT /ontology-metadata/api/permissions/linkTypes · POST /phonograph2/api/objects/registry/bulk/relations/usageMetadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata · POST /phonograph2/api/objects/registry/bulk/objectTypes/usageMetadata · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · PUT /ontology-metadata/api/permissions/objectTypes · POST /ontology-metadata/api/entityMetadata/load · POST /multipass/api/authz/batch/operations · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · POST /people/api/personal/get-favorites

### /workspace/ontology/home/link-type  [dialog: Create a new link type]
- title: Link types
- reached by: Link types 13 > New link type | Link types 13 > New link type > 1 Relationship type | Link types 13 > New link type > 2 Link resources
- headings: Ontology Manager · Create a new link type · Relationship type · Link resources
- tabs: 1 Relationship type · 2 Link resources · 3 Link type names · 4 Save location
- fields: Search resources… · checkbox · radio
- columns: Name · Status
- controls: Close · 1 Relationship type · 2 Link resources · 3 Link type names · 4 Save location · Next · Select object type · Back
- overlays: Create a new link type 1 Relationship type 2 Link resources 3 Link type names 4 Save location STEP 1 ‖ Create a new link type 1 Relationship type 2 Link resources 3 Link type names 4 Save location STEP 2
- calls: POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · GET /multipass/api/authz/markings/usable · PUT /multipass/api/organizations/v2/all · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata · POST /people/api/personal/get-favorites · POST /graphql-gateway/api/bulk

### /workspace/ontology/home/object-type
- title: Object types
- reached by: Object types 13 | Object types 13 > [Example] Airport Example Loading… | Object types 13 > Visibility
- headings: Ontology Manager
- fields: Search resources… · checkbox
- columns: Name · Status · Groups · Number of objects
- controls: New object type · Search… · Status · Visibility · Add filter · Show column options · Configure columns · [Example] Airport Example Loading… · [Example] Carrier Example Loading… · [Example] Route Alert Example Loading… · [Example] Flight Sensor Example Loading… · [Example] Route Alert Comment Example Loading… · [Example] Route Example Loading… · An Order Experimental Loading… · [Example] Aircraft Example Loading… · Billy's Orders Experimental Loading… · [Example][Log] Update Route Alert Status Example Loading… · [Example] Flight Example Loading… · [Example] Runway Example Loading… · [Example] E…
- overlays: Filter by Visibility Normal 13 Hidden 0 Prominent 0
- calls: POST /data-health/api/monitoring/global/statuses · POST /graphql-gateway/api/bulk · POST /multipass/api/authz/batch/operations · POST /people/api/personal/get-favorites · GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /ontology-metadata/api/ontology/featureConfigurations · POST /ontology-metadata/api/ontology/v2/load/all · POST /ontology-metadata/api/organization/getSettings/user · GET /aip-assist/api/chat/checkAvailability · POST /ontology-metadata/api/ontology/ontology/load/{rid}/summary · POST /ontology-metadata/api/ontology/ontology/load/{rid}/{uuid}/loadAllObjectTypes · POST /ontology-metadata/api/actions/types/load/all/{rid}/{uuid} · GET /multipass/api/authz/markings/usable · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · GET /ontology-metadata/api/permissions/ontology/{rid} · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · PUT /multipass/api/organizations/v2/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/usageMetadata · (+4)

### /workspace/ontology/home/properties
- title: Properties
- reached by: Properties | Properties > Order Id Experimental Normal order_id | Properties > Item Name Experimental Normal item_name
- headings: Ontology Manager
- fields: Search resources… · checkbox
- columns: Name · Status · Visibility · Backing Column
- controls: Search… · Property type · Render hints · Add filter · Configure columns · Collapse group · Order Id Experimental Normal order_id · Item Name Experimental Normal item_name · Assignee Experimental Normal assignee · Consolidated Customer Id Experimental Normal consolidated_customer_id · Customer Id Experimental Normal customer_id · Customer Name Experimental Normal customer_name · Days Until Due Experimental Normal days_until_due · Order Due Date Experimental Normal order_due_date · Quantity Experimental Normal quantity · Status Experimental Normal status · Unit Price Experimental Normal unit_pri…
- overlays: Filter by Property type Boolean Date Decimal Integer String Attachment Byte Double Floating Point Ge ‖ Filter by Render hints Long text Low cardinality Identifier Disable formatting Keywords Sortable Sel
- calls: POST /graphql-gateway/api/bulk · GET /multipass/api/authz/markings/usable · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /phonograph2/api/objects/registry/bulk/objectTypes/usageMetadata · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · PUT /ontology-metadata/api/permissions/objectTypes · POST /ontology-metadata/api/entityMetadata/load · PUT /multipass/api/organizations/v2/all · POST /data-health/api/monitoring/global/statuses · POST /multipass/api/authz/batch/operations · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/relations/metadata · POST /people/api/personal/get-favorites

### /workspace/ontology/home/proposals
- title: Proposals
- reached by: Proposals | Proposals > Your proposals | Proposals > Assigned to you
- headings: Ontology Manager · No proposals
- tabs: Your proposals · Assigned to you · In review · Merged proposals · Closed proposals
- fields: Search resources… · Search for requests…
- empty states: No proposals Create branch · No proposals
- controls: Your proposals · Assigned to you · In review · Merged proposals · Closed proposals · Sort: Recently created · Create branch · Sort: Oldest created
- overlays: Sort: Recently created Sort: Oldest created
- calls: GET /multipass/api/me/groups · PUT /approvals/api/search/task-requests · POST /people/api/personal/get-favorites · POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata

### /workspace/ontology/home/type-groups
- title: Groups
- reached by: Groups 0 | Groups 0 > User activity
- headings: Ontology Manager
- fields: Search resources… · checkbox
- columns: Name · Number of resources
- empty states: Could not find any Groups
- controls: New group · Search… · User activity · Add filter · Show column options · Configure columns
- overlays: Filter by User activity Favorite 0 Recently viewed 0
- calls: POST /graphql-gateway/api/bulk

### /workspace/ontology/home/value-types
- title: Value types
- reached by: Value types 0
- headings: Ontology Manager
- fields: Search resources…
- columns: Name · Type · Created
- empty states: Could not find any Value types
- controls: New value type · Search… · Configure columns
- calls: POST /graphql-gateway/api/bulk

### /workspace/ontology/link-type/{x}/overview
- title: [Example] Flight — [Example] Carrier
- reached by: History > Navigate to | History > Navigate to > Flights > [Example] Flight — [Example] Carrier | History > Navigate to > Airline Id
- headings: Ontology Manager · No properties
- fields: View all related resources · text · Select foreign key
- empty states: No properties Only link types with the object-type join method have properties. Use object type as j · No properties Only link types with the object-type join method have properties.
- controls: Marketplace · Open AIP Now Ontology · Actions · Example · Copy to clipboard · Select foreign key · Airline Id · Switch to Primary Key · Clear search · Double-click to edit · Normal · Add type classes · many · Use object type as join method · Flights · Carriers · Overview · Security · Datasources · Usage · Dataset · Object type · Carrier Name · Destination Airport · Flight Number · Flight Title · Origin Airport · Route Id · Tail Num · Cancellation Code · (+11)
- overlays: Carrier Name Destination Airport Flight Number Flight Title Origin Airport Route Id Tail Num Airline
- calls: POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · GET /multipass/api/authz/markings/usable · PUT /ontology-metadata/api/permissions/linkTypes · POST /phonograph2/api/objects/registry/bulk/relations/usageMetadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata · PUT /multipass/api/organizations/v2/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/usageMetadata · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · PUT /ontology-metadata/api/permissions/objectTypes · POST /ontology-metadata/api/entityMetadata/load · POST /data-health/api/monitoring/global/statuses · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · POST /ontology-metadata/api/ontology/v2/modification/history/entity

### /workspace/ontology/object-type/{id}/automations
- title: Automations | An Order
- reached by: History > Navigate to > Automations
- headings: Ontology Manager · No automations defined for this object type
- fields: Search resources…
- empty states: No automations defined for this object type Configure an automation to run automatically when an ins
- controls: Add automation
- calls: POST /graphql-gateway/api/bulk · POST /people/api/personal/get-favorites

### /workspace/ontology/object-type/{id}/capabilities
- title: Capabilities | An Order
- reached by: History > Navigate to > Capabilities | History > Navigate to > Capabilities > Measures Learn more | History > Navigate to > Capabilities > Event Learn more
- headings: Ontology Manager
- fields: Search resources… · checkbox
- controls: Learn more · Time series Set up time series properties or a sensor object type Learn more · Media reference properties Set up a media reference property · Measures Learn more · Event Learn more · Geospatial Each Object represents a geospatial feature Learn more · Vertex Each Object is the title object for a Vertex graph Learn more · Each Object represents a series of values over time · Each Object represents a single interval of time, optionally with associated information

### /workspace/ontology/object-type/{id}/capabilities  [dialog: Analyze time series data]
- title: Capabilities | An Order
- reached by: History > Navigate to > Capabilities > Learn more
- headings: Ontology Manager
- fields: Search resources… · checkbox
- controls: Close · Next · Close dialog
- overlays: Analyze time series data Time series data are a series of measurements taken over time, usually at a

### /workspace/ontology/object-type/{id}/capabilities  [dialog: Process overview]
- title: Capabilities | An Order
- reached by: History > Navigate to > Capabilities > Learn more > Next
- headings: Ontology Manager
- fields: Search resources… · checkbox · Show example
- controls: Back · Next · Close dialog
- overlays: Show example Process overview Follow these steps to set up time series: Start with this object type.
- calls: POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /people/api/personal/get-favorites · POST /objects-data-funnel/api/status/object-type

### /workspace/ontology/object-type/{id}/datasources
- title: Datasources | An Order
- reached by: History > Navigate to > Datasources
- headings: Ontology Manager
- fields: Search resources… · checkbox · radio
- controls: Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.30c4f902-2b2b-40b7-88e6-0ca9837bfc1a/ · Replace · Expand menu · Add new backing datasource · 11 properties · collapse section · Backing datasource · Edits · all_orders 11 properties · Object Storage V2 · Indexing Metadata · Object Storage v1
- calls: POST /ontology-metadata/api/experimental/getObjectDbs · GET /build2/api/info/jobs3/{rid} · POST /graphql-gateway/api/bulk · POST /objects-data-funnel/api/status/object-type · POST /people/api/personal/get-favorites

### /workspace/ontology/object-type/{id}/interfaces
- title: Interfaces | An Order
- reached by: History > Navigate to > Interfaces
- headings: Ontology Manager · No interfaces implemented
- fields: Search resources… · checkbox
- empty states: No interfaces implemented Interfaces are used to model object types that share common properties or 
- controls: Implement new interface
- calls: POST /people/api/personal/get-favorites

### /workspace/ontology/object-type/{id}/materializations
- title: Materializations | An Order
- reached by: History > Navigate to > Materializations
- headings: Ontology Manager · No object datasets created
- fields: Search resources…
- empty states: No object datasets created No object datasets have been created. Click the button below to create a 
- calls: POST /objects-writeback/api/writeback/getDatasetsForObjectType/{rid} · POST /people/api/personal/get-favorites

### /workspace/ontology/object-type/{id}/object-views
- title: Object views | An Order
- reached by: History > Navigate to > Object views | History > Navigate to > Object views > Printer | History > Navigate to > Object views > List view
- headings: Ontology Manager · Object has no links configured
- fields: Search resources… · Search...
- empty states: Object has no links configured
- controls: Printer · Set as the default displayed object · Full view · Panel view · Edit full view · View in Object Explorer · Selected object view mode · List view · Grid view · Light mode preview · Dark mode preview
- overlays: Printer Office Desk File Folders 30" Monitor Multifunction Printer 30" Monitor File Folders Office C
- calls: POST /graphql-gateway/api/bulk · POST /people/api/personal/get-favorites · PUT /object-set-service/api/objectSets/objects/top/initial · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /ontology-metadata/api/ontology/linkTypesForObjectTypesV2 · POST /objects-data-funnel/api/view/currentV4

### /workspace/ontology/object-type/{id}/observability
- title: Observability | An Order
- reached by: History > Navigate to > Observability
- headings: Ontology Manager · Observability
- fields: Search resources…
- controls: Monitor this object type
- calls: POST /graphql-gateway/api/bulk · POST /people/api/personal/get-favorites

### /workspace/ontology/object-type/{id}/overview
- title: An Order
- reached by: History > Navigate to | History > Navigate to > Object View 3 | History > Navigate to > Automation 0
- headings: Ontology Manager · No Automations
- fields: Search resources… · Add aliases… · Editor content
- empty states: No action types using this object type · No implemented interfaces Implement new interface · No implemented interfaces · No Automations Automations allow you to trigger effects based on ontology data changes. Learn more · No link type defined yet Create new link type · No link type defined yet
- controls: Actions · Open in · Add to group · Show help text · Navigate to /workspace/compass/view/ri.compass.main.folder.87445a93-c2ce-4d83-bc40-7d5ca2c590c3 · palantir learn · Move · Contact details · Edit point of contact · Copy to clipboard · Edit · Experimental · Normal · Indexed · Disabled · Not protected · Search… · Item Name · Order Id · Assignee · Consolidated Customer Id · Customer Id · Customer Name · Days Until Due · Order Due Date · Open graph view · Open list view · An Order · Create new link type · Zoom in · (+43)
- overlays: AL ‖ Item Name Order Id Assignee Consolidated Customer Id Customer Id Customer Name Days Until Due Order  ‖ Object View 3 Automation 0 Developer Console App 0 Function 0 Graph Template 0 Map Layer 0 Map Templ
- calls: POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · PUT /ontology-metadata/api/schemamigrations/load/objecttypes · GET /multipass/api/authz/markings/usable · POST /ontology-metadata/api/ontology/linkTypesForObjectTypes · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectTypes · POST /phonograph2/api/objects/registry/bulk/objectTypes/usageMetadata · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · PUT /ontology-metadata/api/permissions/objectTypes · POST /ontology-metadata/api/entityMetadata/load · PUT /multipass/api/organizations/v2/all · POST /data-health/api/monitoring/global/statuses · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · GET /row-level-policy-service/api/datasets/{rid} · GET /row-level-policy-service/api/groups · POST /multipass/api/authz/batch/operations · GET /language-model-service/api/config/v1/enabled · POST /ontology-metadata/api/ontology/v2/modification/history/entity · PUT /foundry-dependency-service/api/dependencies/get-tagged-dependents-all-versions · POST /job-tracker/api/builds/bulkV2 · (+13)

### /workspace/ontology/object-type/{id}/properties-tab
- title: Properties | An Order
- reached by: History > Navigate to > Properties 11
- headings: Ontology Manager
- tabs: Properties · Column mapping
- fields: Search resources… · checkbox
- columns: Property name · Status · Visibility · Column
- controls: Properties · Column mapping · 11 of 11 Columns mapped · Create property · Filter entities · Show column options · Configure columns · Order Id Experimental Normal order_id · Item Name Experimental Normal item_name · Assignee Experimental Normal assignee · Consolidated Customer Id Experimental Normal consolidated_customer_id · Customer Id Experimental Normal customer_id · Customer Name Experimental Normal customer_name · Days Until Due Experimental Normal days_until_due · Order Due Date Experimental Normal order_due_date · Quantity Experimental Normal quantity · Status Experimental Normal statu…
- calls: POST /ontology-metadata/api/ontology/v2/load/all · POST /people/api/personal/get-favorites · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata

### /workspace/ontology/object-type/{id}/properties-tab/{rid}
- title: Properties | An Order
- reached by: History > Navigate to > Item Name | History > Navigate to > Order Id | History > Navigate to > Actions > Item Name
- headings: Ontology Manager
- tabs: Properties · Column mapping · General · Source · Display · Interaction · Dependents
- fields: Search resources… · checkbox · text · textarea · Editor content
- columns: Property name · Status · Visibility · Column
- controls: Properties · Column mapping · 11 of 11 Columns mapped · Create property · Filter entities · Show column options · Configure columns · Close sidebar · Delete property · General · Source · Display · Interaction · Dependents · More · Clear search · String · Select a value type · Advanced value requiredness configuration · Choose shared property · Convert to a shared property · Order Id Experimental Normal order_id · Item Name Experimental Normal item_name · Assignee Experimental Normal assignee · Consolidated Customer Id Experimental Normal consolidated_customer_id · Customer Id Experimental Norm…
- calls: PUT /multipass/api/authz/markings/usable · GET /foundry-metadata/api/metadata/datasets/{rid}/branches/master/view/namespace/foundryColumnMetadata · POST /foundry-stats/api/computed-stats-v2/get-v2 · POST /graphql-gateway/api/bulk · POST /objects-data-funnel/api/status/object-type

### /workspace/ontology/object-type/{id}/security
- title: Security | An Order
- reached by: History > Navigate to > Security
- headings: Ontology Manager · View object type · Edit object type · No security policies configured
- tabs: Object type · Object instances
- fields: Search resources…
- columns: Policy name · Type · Applies to · Access summary · Actions
- empty states: No security policies configured Object instances are secured by their datasource.
- controls: Object type · Object instances · Navigate to /workspace/compass/cover-page/ri.compass.main.folder.313fad62-0e3f-42f3-b492-1929b85355d · More actions · Create object security policy · Configure columns · Save location · Permission breakdown · Branch protection Not protected · Security policies
- calls: PUT /multipass/api/authz/markings/usable · POST /graphql-gateway/api/bulk · POST /multipass/api/authz/markings/resources/summaries

### /workspace/ontology/object-type/{id}/usage
- title: Usage | An Order
- reached by: History > Navigate to > Usage | History > Navigate to > Usage > Reads & Writes | History > Navigate to > Usage > Reads & Writes > Reads & Writes
- headings: Ontology Manager
- fields: Search resources… · Start date · End date
- controls: Reads & Writes · Search specific values · Sort · Reads · Writes
- overlays: Workshop 5 0 ‖ Reads & Writes Reads Writes
- calls: PUT /ontology-metadata/api/usage/search/getUsage · POST /people/api/personal/get-favorites · POST /objects-data-funnel/api/status/object-type · POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata

### /workspace/ontology/object-type/{x}/capabilities
- title: Capabilities | [Example] Airport
- reached by: [Example] Airport Example Loading… > Capabilities | [Example] Airport Example Loading… > Capabilities > Measures Learn more | [Example] Airport Example Loading… > Capabilities > Event Learn more
- headings: Ontology Manager
- fields: View all related resources · checkbox
- columns: PROPERTY NAME · TIME SERIES SYNC · BASE FORMATTER
- controls: Learn more · Add property · Analyze in Quiver · Navigate to /workspace/time-series-catalog-app/sync/view/ri.time-series-catalog.main.sync.0638f073-9 · Time series formatting · No formatting · Configure · Time series Set up time series properties or a sensor object type Learn more · Media reference properties Set up a media reference property · Measures Learn more · Event Learn more · Geospatial Each Object represents a geospatial feature Learn more · Vertex Each Object is the title object for a Vertex graph Learn more · Each Object represents a series of values over time · Each Object represen…
- overlays: Analyze in Quiver ‖ TIME SERIES FORMATTING Internal Interpolation Linear Units Standard unit Minute ‖ TIME SERIES FORMATTING
- calls: POST /graphql-gateway/api/bulk · POST /objects-data-funnel/api/status/object-type · POST /people/api/personal/get-favorites

### /workspace/ontology/object-type/{x}/capabilities  [dialog: Analyze time series data]
- title: Capabilities | [Example] Airport
- reached by: [Example] Airport Example Loading… > Capabilities > Learn more
- headings: Ontology Manager
- fields: View all related resources · checkbox
- columns: PROPERTY NAME · TIME SERIES SYNC · BASE FORMATTER
- controls: Close · Next · Close dialog
- overlays: Analyze time series data Time series data are a series of measurements taken over time, usually at a
- calls: POST /ontology-metadata/api/ontology/v2/load/all · POST /people/api/personal/get-favorites · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata

### /workspace/ontology/object-type/{x}/capabilities  [dialog: Time series security markings]
- title: Capabilities | [Example] Airport
- reached by: [Example] Airport Example Loading… > Capabilities > Configure
- headings: Ontology Manager · Time series security markings
- fields: View all related resources · checkbox · Search all markings…
- columns: PROPERTY NAME · TIME SERIES SYNC · BASE FORMATTER
- controls: Linear · Standard unit · Minute · Close · Navigate to /workspace/time-series-catalog-app/sync/view/ri.time-series-catalog.main.sync.0638f073-9 · Stop inheriting marking from… · Cancel · Apply
- overlays: TIME SERIES FORMATTING Internal Interpolation Linear Units Standard unit Minute ‖ TIME SERIES FORMATTING ‖ Time series security markings Markings restrict access to sensitive data. By default, markings are i
- calls: PUT /multipass/api/authz/markings/usable · POST /graphql-gateway/api/bulk

### /workspace/ontology/object-type/{x}/datasources
- title: Datasources | [Example] Flight · Datasources | [Example] Airport · Datasources | [Example] Explainer
- reached by: History > Navigate to > Flights > Datasources Index failed | History > Navigate to > Flights > Datasources Index failed > Backing datasource | History > Navigate to > Flights > Datasources Index failed > Object Storage V2
- headings: Ontology Manager
- fields: View all related resources · checkbox · radio
- controls: Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.76e8f188-35e1-4d78-acd4-5bdb082b65f3/ · Replace · Expand menu · Add new backing datasource · 51 properties · collapse section · Backing datasource · Edits · Flights 51 properties · Object Storage V2 · Indexing Metadata · Object Storage v1 · expand section · Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.f6f8cfdd-7d0f-4260-aa08-89abd250a9c0/ · 19 properties · Airports 19 properties · Open link · Remove · Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.c1cd8654-4183-4a2b-b00c-5f5c829b593a/ · 5 propertie…
- overlays: Remove
- calls: POST /ontology-metadata/api/experimental/getObjectDbs · GET /build2/api/info/jobs3/{rid} · POST /graphql-gateway/api/bulk · POST /objects-data-funnel/api/status/object-type · POST /ontology-metadata/api/ontology/v2/load/all · POST /people/api/personal/get-favorites · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata

### /workspace/ontology/object-type/{x}/interfaces
- title: Interfaces | [Example] Explainer
- reached by: Action types 6 > Edit Callout Modify object Experimental > [Example] Explainer > Interface…
- headings: Ontology Manager · No interfaces implemented
- fields: View all related resources · checkbox
- empty states: No interfaces implemented Interfaces are used to model object types that share common properties or 
- controls: Implement new interface

### /workspace/ontology/object-type/{x}/materializations
- title: Materializations | [Example] Explainer
- reached by: Action types 6 > Edit Callout Modify object Experimental > [Example] Explainer > Materiali… | Action types 6 > Edit Callout Modify object Experimental > [Example] Explainer > Materiali…
- headings: Ontology Manager
- fields: View all related resources · radio
- controls: Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.bd54f03c-b99e-44eb-a413-9c464aa32a84/ · AIP Now Ontology · Configuration · Automatic · Expand menu · Create new object dataset · Cancel · Periodic Legacy Object datasets are built when input datasources update or every 6 hours.
- overlays: Choose how often you want the object dataset to be rebuilt. Automatic (current) Recommended Object d
- calls: POST /objects-writeback/api/writeback/getDatasetsForObjectType/{rid} · POST /objects-writeback/api/writeback/status · POST /graphql-gateway/api/bulk · POST /people/api/personal/get-favorites

### /workspace/ontology/object-type/{x}/object-views
- title: Object views | [Example] Explainer
- reached by: Action types 6 > Edit Callout Modify object Experimental > [Example] Explainer > Object vi… | Action types 6 > Edit Callout Modify object Experimental > [Example] Explainer > Object vi… | Action types 6 > Edit Callout Modify object Experimental > [Example] Explainer > Object vi…
- headings: Ontology Manager · Object has no links configured
- fields: View all related resources · Search...
- empty states: Object has no links configured
- controls: Map Layers · Set as the default displayed object · Full view · Panel view · Edit full view · View in Object Explorer · Loading · Light mode preview · Dark mode preview · Selected object view mode · List view · Grid view · Object Instance · Select panel type · Edit panel view
- overlays: Map Layers Advanced Charts Conditional Formatting Mini Tabs Metrics and Alert Pipeline Optional Inte
- calls: POST /graphql-gateway/api/bulk · POST /people/api/personal/get-favorites · PUT /object-set-service/api/objectSets/objects/top/initial · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /ontology-metadata/api/ontology/linkTypesForObjectTypesV2 · POST /objects-data-funnel/api/view/currentV4 · POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata

### /workspace/ontology/object-type/{x}/observability
- title: Observability | [Example] Airport
- reached by: [Example] Airport Example Loading… > Observability
- headings: Ontology Manager · Observability
- fields: View all related resources
- controls: Monitor this object type
- calls: POST /graphql-gateway/api/bulk

### /workspace/ontology/object-type/{x}/overview
- title: [Example] Flight · [Example] Carrier · [Example] Explainer · (+1)
- reached by: History > Navigate to > Flights | History > Navigate to > Flights > Object View 3 | History > Navigate to > Flights > Automation 0
- headings: Ontology Manager · No Automations
- fields: View all related resources · Add aliases… · Editor content
- empty states: None · No action types using this object type · No implemented interfaces Implement new interface · No implemented interfaces · No Automations Automations allow you to trigger effects based on ontology data changes. Learn more · No link type defined yet Create new link type · No link type defined yet
- controls: Open in · Add to group · Show help text · Add point of contact · Edit · Failed · Disabled · Search… · Flight Title · Flight Id · Actual Elapsed Time · Air Time · Arr Delay · Arrival Timestamp · Carrier Name · Date · Open graph view · Open list view · [Example] Carrier · [Example] Flight Sensor · [Example] Airport · [Example] Aircraft · [Example] Route · [Example] Flight · Create new link type · Zoom in · Zoom out · Zoom to fit · Implement new interface · Object View 3 · (+92)
- overlays: Flight Title Flight Id Actual Elapsed Time Air Time Arr Delay Arrival Timestamp Carrier Name Date ‖ Object View 3 Automation 0 Developer Console App 0 Function 0 Graph Template 0 Map Layer 0 Map Templ ‖ Object type [Example] Flight Backing datasource Flights
- calls: POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · GET /multipass/api/authz/markings/usable · POST /ontology-metadata/api/ontology/linkTypesForObjectTypes · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectTypes · PUT /multipass/api/organizations/v2/all · POST /ontology-metadata/api/ontology/ontology/load/datasources · PUT /ontology-metadata/api/permissions/linkTypes · POST /phonograph2/api/objects/registry/bulk/relations/usageMetadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata · POST /phonograph2/api/objects/registry/bulk/objectTypes/usageMetadata · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · PUT /ontology-metadata/api/permissions/objectTypes · POST /ontology-metadata/api/entityMetadata/load · POST /data-health/api/monitoring/global/statuses · POST /ontology-metadata/api/formatting/rulesets/loadRuleSets · GET /row-level-policy-service/api/datasets/{rid} · GET /row-level-policy-service/api/groups · POST /multipass/api/authz/batch/operations · GET /language-model-service/api/config/v1/enabled · POST /ontology-metadata/api/ontology/v2/modification/history/entity · (+17)

### /workspace/ontology/object-type/{x}/properties-tab
- title: Properties | [Example] Airport · Properties | [Example] Explainer
- reached by: [Example] Airport Example Loading… > Properties 19 | [Example] Airport Example Loading… > Properties 19 > Property editor | Action types 6 > Edit Callout Modify object Experimental > [Example] Explainer > Propertie…
- headings: Ontology Manager
- tabs: Properties · Column mapping
- fields: View all related resources · checkbox
- columns: Property name · Status · Visibility · Column
- empty states: No property selected Click on a property on the left to view details
- controls: Properties · Column mapping · 19 of 20 Columns mapped · Create property · Filter entities · Show column options · Configure columns · Airport Id Example Normal airport_id · Display Airport Name Example Normal display_airport_name · Airport Example Normal airport · Airport Start Date Example Normal airport_start_date · Airport State Code Example Normal airport_state_code · Airport State Name Example Normal airport_state_name · Arriving Flight Count Example Normal arriving_flight_count · Average Arr Delay Example Normal average_arr_delay · Average Dep Delay Example Normal average_dep_delay · Com…
- calls: POST /people/api/personal/get-favorites

### /workspace/ontology/object-type/{x}/properties-tab/{rid}
- title: Properties | [Example] Flight · Properties | [Example] Carrier · Properties | [Example] Explainer · (+1)
- reached by: History > Navigate to > Flights > Flight Title | History > Navigate to > Flights > Flight Title > Column mapping | History > Navigate to > Flights > Flight Title > General
- headings: Ontology Manager · No results found
- tabs: Properties · Column mapping · General · Source · Display · Interaction · Dependents
- fields: View all related resources · checkbox · text · textarea · Search... · Editor content
- columns: Property name · Status · Visibility · Column
- empty states: No results found No matching results for this query
- controls: Properties · Column mapping · 51 of 51 Columns mapped · Create property · Filter entities · Show column options · Configure columns · Prominent · Close sidebar · Delete property · General · Source · Display · Interaction · Dependents · More · Clear search · String · Select a value type · Advanced value requiredness configuration · Choose shared property · Convert to a shared property · Flight Id Example Normal flight_id · Flight Title Example Prominent flight_title · Actual Elapsed Time Example Prominent actual_elapsed_time · Air Time Example Prominent air_time · Arr Delay Example Prominent ar…
- overlays: No results found No matching results for this query Create new value type ‖ No null values No empty arrays ‖ Details Advanced
- calls: PUT /multipass/api/authz/markings/usable · GET /foundry-metadata/api/metadata/datasets/{rid}/branches/master/view/namespace/foundryColumnMetadata · POST /foundry-stats/api/computed-stats-v2/get-v2 · POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/v2/load/all · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata · POST /people/api/personal/get-favorites · POST /objects-data-funnel/api/status/object-type · POST /compass/api/batch/resources

### /workspace/ontology/object-type/{x}/security
- title: Security | [Example] Airport · Security | [Example] Explainer
- reached by: [Example] Airport Example Loading… > Security | [Example] Airport Example Loading… > Security > Object type roles | [Example] Airport Example Loading… > Security > Permissions summary
- headings: Ontology Manager · Object type · Object instances · No security policies configured
- fields: View all related resources · Add a user or group…
- columns: Policy name · Type · Applies to · Access summary · Actions
- empty states: No security policies configured Object instances are secured by their datasource.
- controls: Migrate to project permissions · ontology-metadataontology-metadata · Ontology Owner · Remove · Ontology Viewer · Ontology · object type · Navigate to /workspace/dataset/preview/ri.foundry.main.dataset.f6f8cfdd-7d0f-4260-aa08-89abd250a9c0/ · More actions · Create object security policy · Configure columns · Project permission migration · Object type roles · Permissions summary · Discover · View · Edit · Owner You · View You · Create Disabled · Edit and delete Disabled · Security policies · Open link · Copy debugging logs Use contents for filing help issues · Navigate to /workspace/dataset/prev…
- overlays: Copy debugging logs Use contents for filing help issues
- calls: POST /compass/api/roles · PUT /multipass/api/authz/markings/usable · POST /objects-data-funnel/api/view/policiesV3 · POST /graphql-gateway/api/bulk · PUT /multipass/api/roles/v2/roleSets · POST /multipass/api/authz/markings/resources/summaries · POST /multipass/api/authz/batch/operations · POST /multipass/api/users · POST /objects-data-funnel/api/status/object-type · POST /ontology-metadata/api/ontology/v2/load/all · POST /people/api/personal/get-favorites · POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata · POST /phonograph2/api/objects/registry/bulk/relations/metadata

### /workspace/ontology/object-type/{x}/usage
- title: Usage | [Example] Explainer
- reached by: Action types 6 > Edit Callout Modify object Experimental > [Example] Explainer > Usage
- headings: Ontology Manager
- fields: View all related resources
- controls: Configure
- calls: PUT /ontology-metadata/api/usage/search/getUsage

### /workspace/ontology/project-permission-migration
- title: Ontology configuration
- reached by: Ontology configuration > Proceed to migration | Ontology configuration > Proceed to migration > Individual resources | Ontology configuration > Proceed to migration > Recommended projects
- headings: Ontology Manager · Ontology projects migration assistant · Loading full Ontology · Select a project to view suggested resources
- fields: checkbox
- empty states: Loading full Ontology Select resources to migrate · Loading full Ontology
- controls: expand section · Select resources to migrate · Overview · Recommended projects · Individual resources · Why is this migration needed? · What does this migration unlock? · How does this migration work? · Can I migrate back to roles/datasource permissions? · Do I have to complete the migration in one session? · What happens if the migration is not completed? · Search… · Recommended projects 1 · Individual resources 30 · AIP Now Ontology (30 Resources)
- calls: POST /people/api/personal/get-favorites · POST /graphql-gateway/api/bulk

## Actions not clicked (mutating, 139)

4 Save location · Add · Add One State Callout · Add One State Callout Create object Experimental · Add One State Callout Created · Add automation · Add filter · Add new backing datasource · Add new parameter · Add new rule · Add new section · Add override · Add point of contact · Add property · Add section · Add to group · Add type classes · Aircraft Carrier Created · Airport Start Date · Airport Start Date Example Normal airport_start_date · An Order Created · Apply most recent value · Arriving Flights Arrival Airport Created · Arriving Routes Destination Airport Created · Assignee · Assignee Experimental Normal assignee · Billy's Orders Created · Choose shared property · Clear search · Click here to run a search for all registration and index failures · Close · Close dialog · Close sidebar · Collapse form section New section · Conditional formatting ruleset Rules on "Arr Delay" property of "Flight" Created · Conditional formatting ruleset Rules on "Number Of Seats" property of "Aircraft" · Conditional formatting ruleset Rules on "Priority" property of "Route Alert" Cre · Conditional formatting ruleset Rules on "Status" property of "[Example] Route Al · Convert to a shared property · Copy diagnostics · Copy or paste Submission Criteria · Copy to clipboard · Create Disabled · Create You · Create branch · Create new · Create new link type · Create new object dataset · Create object security policy · Create property · Dark mode preview · Delete · Delete parameter · Delete property · Departing Flights Departure Airport Created · Departing Routes Departure Airport Created · Disabled · Dismiss · Double-click to edit · Duplicate · Edit · Edit Callout · Edit Callout Created · Edit Callout Modify object Experimental · Edit action type classes · Edit and delete Disabled · Edit and delete You · Edit full view · Edit object view · Edit point of contact · Edits · Filter edit history · Flight Sensors Flight Created · Flights Aircraft Created · Flights Carriers Created · Flights Route Created · Implement new interface · Light mode preview · Marketplace · Media reference properties Set up a media reference property · Migrate to project permissions · Move · Navigate to /workspace/time-series-catalog-app/sync/view/ri.time-series-catalog. · New · New action type · New function · New group · New interface · New link type · New object type · New section · New section New Empty · New section SECTION · New value type · Object Set 0 · Ontology Editor · Ontology Editor Can edit ontology entities. · Ontology Owner Can edit ontology entities and has full control over their securi · Ontology Viewer Can view ontology entities, but can't edit them. · Project permission migration · Remove · Remove column · Remove object set · Retry mode on transient errors · Route Alert Comments Route Alert Created · Route Alerts Route Created · Runways Airports Created · Runways Airports Example · Save · Set as the default displayed object · Shared properties 0 · Start cleanup · Submit · Test run · Time series Set up time series properties or a sensor object type Learn more · Use object type as join method · [Example] Add Route Alert Comment Create object Experimental · [Example] Add Route Alert Comment Created · [Example] Aircraft Created · [Example] Airport Created · [Example] Assign Alert Created · [Example] Assign Alert Modify object Experimental · [Example] Carrier Created · [Example] Close Alert Created · [Example] Close Alert Modify object Experimental · [Example] Explainer Created · [Example] Flight Created · [Example] Flight Sensor Created · [Example] Route Alert Comment Created · [Example] Route Alert Created · [Example] Route Created · [Example] Runway Created · [Example] Runway Example Loading… · [Example] Update Route Alert Status Created · [Example] Update Route Alert Status Modify object Experimental · [Example][Log] Update Route Alert Status Created · [Example][Log] Update Route Alert Status Example Loading… · [Logs] Update Route Alert Status Route Alert Created · [Logs] Update Route Alert Status Route Alert Example

## Screenshots (74)

- out/ontology/shots/01-ontology-manager.jpg — page:/workspace/ontology/home/discover
- out/ontology/shots/02-ontology-configuration.jpg — page:/workspace/ontology/home/advanced
- out/ontology/shots/03-ontology-configuration.jpg — page:/workspace/ontology/project-permission-migration
- out/ontology/shots/04-cleanup.jpg — page:/workspace/ontology/home/cleanup
- out/ontology/shots/05-flag-settings.jpg — page:/workspace/ontology/home/cleanup-settings
- out/ontology/shots/06-functions.jpg — page:/workspace/ontology/home/function
- out/ontology/shots/07-value-types.jpg — page:/workspace/ontology/home/value-types
- out/ontology/shots/08-interfaces.jpg — page:/workspace/ontology/home/interfaces
- out/ontology/shots/09-groups.jpg — page:/workspace/ontology/home/type-groups
- out/ontology/shots/10-action-types.jpg — page:/workspace/ontology/home/action-type
- out/ontology/shots/11-link-types.jpg — page:/workspace/ontology/home/link-type
- out/ontology/shots/12-properties.jpg — page:/workspace/ontology/home/properties
- out/ontology/shots/13-object-types.jpg — page:/workspace/ontology/home/object-type
- out/ontology/shots/14-history.jpg — page:/workspace/ontology/home/history
- out/ontology/shots/15-properties-an-order.jpg — page:/workspace/ontology/object-type/{id}/properties-tab/{rid}
- out/ontology/shots/16-properties-an-order.jpg — page:/workspace/ontology/object-type/{id}/properties-tab
- out/ontology/shots/17-security-an-order.jpg — page:/workspace/ontology/object-type/{id}/security
- out/ontology/shots/18-datasources-an-order.jpg — page:/workspace/ontology/object-type/{id}/datasources
- out/ontology/shots/19-observability-an-order.jpg — page:/workspace/ontology/object-type/{id}/observability
- out/ontology/shots/20-capabilities-an-order.jpg — page:/workspace/ontology/object-type/{id}/capabilities
- out/ontology/shots/21-dialog-analyze-time-series-data.jpg — dialog:/workspace/ontology/object-type/{id}/capabilities|Analyze time series data
- out/ontology/shots/22-dialog-process-overview.jpg — dialog:/workspace/ontology/object-type/{id}/capabilities|Process overview
- out/ontology/shots/23-object-views-an-order.jpg — page:/workspace/ontology/object-type/{id}/object-views
- out/ontology/shots/24-interfaces-an-order.jpg — page:/workspace/ontology/object-type/{id}/interfaces
- out/ontology/shots/25-materializations-an-order.jpg — page:/workspace/ontology/object-type/{id}/materializations
- out/ontology/shots/26-automations-an-order.jpg — page:/workspace/ontology/object-type/{id}/automations
- out/ontology/shots/27--example-flight-example-carrier.jpg — page:/workspace/ontology/link-type/uwen0pfc.flights-one-state-carriers/overview
- out/ontology/shots/28-dialog-create-a-new-link-type.jpg — dialog:/workspace/ontology/home/link-type|Create a new link type
- out/ontology/shots/29-properties-example-flight.jpg — page:/workspace/ontology/object-type/uwen0pfc.flights/properties-tab/{rid}
- out/ontology/shots/30-datasources-example-flight.jpg — page:/workspace/ontology/object-type/uwen0pfc.flights/datasources
- out/ontology/shots/31-properties-example-carrier.jpg — page:/workspace/ontology/object-type/uwen0pfc.one-state-carriers/properties-tab/{rid}
- out-targeted/ontology-home-action-type/shots/01-action-types.jpg — page:/workspace/ontology/home/action-type
- out-targeted/ontology-home-action-type/shots/02-rules-add-one-state-callout.jpg — page:/workspace/ontology/action-type/{rid}/rules
- out-targeted/ontology-home-action-type/shots/03-parameters-add-one-state-callout.jpg — page:/workspace/ontology/action-type/{rid}/parameters
- out-targeted/ontology-home-action-type/shots/04-new-section-add-one-state-callout.jpg — page:/workspace/ontology/action-type/{rid}/parameters/section/section-2
- out-targeted/ontology-home-action-type/shots/05-user-interface-add-one-state-callout.jpg — page:/workspace/ontology/action-type/{rid}/user-interface
- out-targeted/ontology-home-action-type/shots/06-capabilities-add-one-state-callout.jpg — page:/workspace/ontology/action-type/{rid}/capabilities
- out-targeted/ontology-home-action-type/shots/07-security-add-one-state-callout.jpg — page:/workspace/ontology/action-type/{rid}/security
- out-targeted/ontology-home-action-type/shots/08-automations-add-one-state-callout.jpg — page:/workspace/ontology/action-type/{rid}/automations
- out-targeted/ontology-home-action-type/shots/09-observability-add-one-state-callout.jpg — page:/workspace/ontology/action-type/{rid}/observability
- out-targeted/ontology-home-action-type/shots/10-dialog-duplicate-action-type.jpg — dialog:/workspace/ontology/action-type/{rid}/overview|Duplicate action type
- out-targeted/ontology-home-action-type/shots/11-properties-example-explainer.jpg — page:/workspace/ontology/object-type/{x}/properties-tab/{rid}
- out-test/ontology-home-object-type/shots/01-object-types.jpg — page:/workspace/ontology/home/object-type
- out-test/ontology-home-object-type/shots/02-properties-example-airport.jpg — page:/workspace/ontology/object-type/{x}/properties-tab/{rid}
- out-test/ontology-home-object-type/shots/03-properties-example-airport.jpg — page:/workspace/ontology/object-type/{x}/properties-tab
- out-test/ontology-home-object-type/shots/04-security-example-airport.jpg — page:/workspace/ontology/object-type/{x}/security
- out-test/ontology-home-object-type/shots/05-datasources-example-airport.jpg — page:/workspace/ontology/object-type/{x}/datasources
- out-test/ontology-home-object-type/shots/06-observability-example-airport.jpg — page:/workspace/ontology/object-type/{x}/observability
- out-test/ontology-home-object-type/shots/07-capabilities-example-airport.jpg — page:/workspace/ontology/object-type/{x}/capabilities
- out-test/ontology-home-object-type/shots/08-dialog-analyze-time-series-data.jpg — dialog:/workspace/ontology/object-type/{x}/capabilities|Analyze time series data
- out-test/ontology-home-object-type/shots/09-dialog-time-series-security-markings.jpg — dialog:/workspace/ontology/object-type/{x}/capabilities|Time series security markings
- out-shapes/ontology/shots/01-ontology-manager.jpg — page:/workspace/ontology/home/discover
- out-shapes/ontology/shots/02-action-types.jpg — page:/workspace/ontology/home/action-type
- out-shapes/ontology/shots/03-rules-edit-callout.jpg — page:/workspace/ontology/action-type/{rid}/rules
- out-shapes/ontology/shots/04-parameters-edit-callout.jpg — page:/workspace/ontology/action-type/{rid}/parameters
- out-shapes/ontology/shots/05-user-interface-edit-callout.jpg — page:/workspace/ontology/action-type/{rid}/user-interface
- out-shapes/ontology/shots/06-capabilities-edit-callout.jpg — page:/workspace/ontology/action-type/{rid}/capabilities
- out-shapes/ontology/shots/07-security-edit-callout.jpg — page:/workspace/ontology/action-type/{rid}/security
- out-shapes/ontology/shots/08-automations-edit-callout.jpg — page:/workspace/ontology/action-type/{rid}/automations
- out-shapes/ontology/shots/09-observability-edit-callout.jpg — page:/workspace/ontology/action-type/{rid}/observability
- out-shapes/ontology/shots/10-properties-example-explainer.jpg — page:/workspace/ontology/object-type/{x}/properties-tab/{rid}
- out-shapes/ontology/shots/11-properties-example-explainer.jpg — page:/workspace/ontology/object-type/{x}/properties-tab
- out-shapes/ontology/shots/12-security-example-explainer.jpg — page:/workspace/ontology/object-type/{x}/security
- out-shapes/ontology/shots/13-datasources-example-explainer.jpg — page:/workspace/ontology/object-type/{x}/datasources
- out-shapes/ontology/shots/14-object-views-example-explainer.jpg — page:/workspace/ontology/object-type/{x}/object-views
- out-shapes/ontology/shots/15-interfaces-example-explainer.jpg — page:/workspace/ontology/object-type/{x}/interfaces
- out-shapes/ontology/shots/16-materializations-example-explainer.jpg — page:/workspace/ontology/object-type/{x}/materializations
- out-shapes/ontology/shots/17-usage-example-explainer.jpg — page:/workspace/ontology/object-type/{x}/usage
- out-shapes/ontology/shots/18-dialog-agent-tool-description.jpg — dialog:/workspace/ontology/action-type/{rid}/overview|Agent tool description
- out-shapes/ontology/shots/19-one-state-callout-edit-callout.jpg — page:/workspace/ontology/action-type/{rid}/parameters/parameter/{rid}
- out-shapes/ontology/shots/20-proposals.jpg — page:/workspace/ontology/home/proposals
- out-shapes/ontology/shots/21-history.jpg — page:/workspace/ontology/home/history
- out-shapes/ontology/shots/22-properties-an-order.jpg — page:/workspace/ontology/object-type/{id}/properties-tab/{rid}
- out-shapes/ontology/shots/23--example-flight-example-carrier.jpg — page:/workspace/ontology/link-type/{x}/overview

## API surface (72 endpoints)

### GET /aip-assist/api/chat/checkAvailability
- count 17, status 200
- response: {available: boolean}

### GET /build2/api/info/jobs3/{rid}
- count 28, status 200
- response: {jobRid: rid, buildRid: rid, jobSpecRid: rid, resolvedInputSpecs: [{inputType: string, branch: string, datasetLocator: {datasetRid: rid, datasetProperties: {…}}, assumedMarkings: {}, inputFailureStrategy: null, identifier: uuid}], resolvedOutputSpecs: [{outputType: string, datasetLocator: {datasetRid: rid, datasetProperties: {…}}, outputMetadata: {storageDatabase: string}}], finishedOutputSpecs: null, extraResolvedInputSpecs: null, resolvedConnectionInfo: null, startedTime: datetime, submittedToWorkerTime: datetime, finishedTime: datetime, retryCount: number, jobStatus: string, jobStatusReason: null, jobDetails: string, jobQueues: {}, jobResults: {{key}: {provenance: {provenanceRecords: [{…}]}, schemaVersionId: uuid, notModified: boolean}}, inputResults: null|object, jobError: null|object, canceledAttribution: null, debugParameters: null, constraintInfo: null, isRedacted: boolean, increm…

### GET /compass/api/registry/actions
- count 15, status 200
- response: [{category: null|string, displayHint: {description: null|string, icon: string, label: string}, match: [{type: string, value: null|string, key: string}], method: string, name: string, url: string, precedence: null, actionType: null|string}]

### GET /foundry-metadata/api/metadata/datasets/{rid}/branches/master/view/namespace/foundryColumnMetadata
- count 1, status 200
- response: {geopoint: {typeclasses: [{kind: string, name: string, version: {…}, additionalMetadata: null}], description: null}}

### GET /language-model-service/api/config/v1/enabled
- count 15, status 200
- response: boolean

### GET /multipass/api/authz/access/{rid}
- count 3, status 200
- response: boolean

### GET /multipass/api/authz/markings/usable
- count 67, status 200
- response: {categories: [{id: uuid, displayName: null, description: null, categoryType: string, markings: [{…}], createdAt: null, createdBy: null, markingType: string, priority: null, deleted: boolean}], userMarkings: [uuid], markingsUserCanDeclassify: [uuid], markingsUserCanUse: [uuid]}

### GET /multipass/api/me/groups
- count 1, status 200
- response: {groups: [], next: null, orderedBy: null}

### GET /ontology-metadata/api/ontology/featureConfigurations
- count 17, status 200
- response: {allowSharedPropertyTypeUsage: boolean, allowGothamTypeMappingUsage: boolean, allowTypeRegistryUsage: boolean, allowNonRoleEntitiesInProposals: boolean, ontologyProposalsInDefaultOntologyWillBeOrgMarked: boolean}

### GET /ontology-metadata/api/permissions/ontology/{rid}
- count 17, status 200
- response: {canCreateObjectTypes: boolean, canCreateLinkTypes: boolean, canCreateActionTypes: boolean, canUseNotificationsWithActionType: boolean, canCreateRuleSets: boolean, canCreateWorkflows: boolean, canCreateSharedPropertyTypes: boolean, canCreateInterfaceTypes: boolean, canCreateTypeGroups: boolean, canUpdateOntology: boolean, canDeleteOntology: boolean}

### GET /row-level-policy-service/api/datasets/{rid}
- count 6, status 200
- response: {policyColumn: null, showPolicyColumn: boolean, usesColumnAcls: boolean, aclGroup: null, datasetPolicyStatus: string, columnToPolicyMap: null, nonRestrictedColumns: [], defaultColumnPolicy: null}

### GET /row-level-policy-service/api/groups
- count 6, status 200
- response: {groups: {}, nextPageToken: null}

### GET /workspace/api/lifecycleStatusByApplication
- count 17, status 200
- response: {lifecycleStatusByApplication: {showcase-app: string, vulcan: string, linter-app-v2: string, oauth2-clients-app: string, auth-redirect: string, authoring: string, standalone-object-view-asset: string, fforms: string, monocle: string, slate-standalone: string, templates: string, slate: string, aip-autopilot-app: string, workspace-debug-app: string, code-workspace-app: string, quiver: string, mcp-hub-app: string, checkpoints-app: string, m: string, ontology: string, fusion: string, aip-analyst-app: string, ml: string, retention-app: string, compute-module-app: string, …}}

### POST /actions/api/actions/validatePreview
- count 6, status 200
- request: {actionType: {actionTypeLogic: {logic: {rules: [{…}], actionLogRule: null}, validation: {actionTypeLevelValidation: {…}, parameterValidations: {…}, sectionValidations: {…}}, revert: null, webhooks: null, notifications: [], effects: null}, metadata: {rid: rid, apiName: string, version: string, displayMetadata: {displayName: string, description: string, toolDescription: null, icon: {…}, typeClasses: [], successMessage: [], successMessageEnabled: boolean, applyingMessage: [], applyingMessageEnabled: boolean, submitButtonDisplayMetadata: null, undoButtonConfiguration: null, configuration: {…}}, returnType: {type: string, void: {…}}, returnConfiguration: null, parameterOrdering: [string], actionL…
- response: {type: string, invalidResponse: {results: {{key}: {type: string, invalidResult: {…}}}, parameterResults: {{key}: {type: string, failedResult: {…}}}, sectionResults: {{key}: {visibility: {…}}}, securityRequirementsResults: {}, invalidDependencies: []}, validResponse: {results: {{key}: {type: string, validResult: {…}}}, parameterResults: {{key}: {type: string, validResult: {…}}}, securityRequirementsResults: {}, sectionResults: {{key}: {visibility: {…}}}}}

### POST /checkpoints/api/checkpoints/configuration/getConfigsV5
- count 11, status 200
- request: {checkpointedItems: [{checkpointedItemId: {checkpointedActionTypeRid: rid, type: string}, branches: []}], checkpointType: string}
- response: {checkpointConfigs: [], classificationInferabilityStatus: {type: string, uninferableClassifcation: string}}

### POST /compass/api/batch/resources
- count 25, status 200
- request: [rid]
- response: {{key}: {rid: rid, name: string, created: {time: datetime, userId: uuid}, modified: {time: datetime, userId: uuid}, lastModified: number, description: null, operations: [string], urlVariables: {compass:isProject: string, moduleType:PANEL: string, moduleType: string, moduleType:PAGE: string}, favorite: null, branches: [{name: string, rid: rid, urlVariables: {…}, classificationRids: [rid]}], defaultBranch: null, defaultBranchWithMarkings: null, branchesCount: null, hasBranches: null, hasMultipleBranches: null, backedObjectTypes: null, path: string, longDescription: null, directlyTrashed: boolean, inTrash: boolean, isAutosave: boolean, isHidden: boolean, isPreviewResource: boolean, collections: null, namedCollections: [], …}}

### POST /compass/api/roles
- count 1, status 200
- request: {rids: [rid]}
- response: {resourceRolesResultMap: {{key}: {grants: [{…}], disableInheritedPermissionsForPrincipals: [], disableInheritedPermissions: boolean, disableInheritedPermissionsType: string}}}

### POST /data-health/api/monitoring/global/statuses
- count 24, status 200
- request: {limit: number, filter: {monitorStatusesV2: [{firing: {…}, type: string}], targetTypes: [string], projectRids: [], folderRids: [], targetRids: [rid]}, sort: []}
- response: {statusReports: [], pageToken: null}

### POST /documentation/api/v2/release-notes/pagination
- count 34, status 200
- request: {productId: string, applicationIds: [], pageSize: number}
- response: {releaseNotes: [{id: uuid, type: string, description: string, categoryTitle: string, categoryId: string, applicationTitle: string, applicationId: string, date: datetime, title: string, prominence: string, releaseVersion: string, productId: string, frontendApplicationId: string, mediaFilenames: [string], longDescription: string, applications: [{…}]}], nextOffset: number}

### POST /foundry-catalog/api/catalog/batch/latest-transactions2
- count 6, status 200
- request: [{datasetRid: rid, branchId: string}]
- response: {entries: [{key: {datasetRid: rid, branchId: string}, value: {rid: rid, transaction: {…}}}]}

### POST /foundry-metadata/api/schemas/batch/schemas
- count 6, status 200
- request: [{datasetAndBranchId: {datasetRid: rid, branchId: string}, endTransactionRid: rid}]
- response: {entries: [{key: {datasetAndBranchId: {…}, endTransactionRid: rid, versionId: null}, value: {branchId: string, transactionRid: rid, versionId: uuid, schema: {…}, attribution: {…}}}]}

### POST /foundry-stats/api/computed-stats-v2/get-v2
- count 2, status 200
- request: {datasetRid: rid, branch: string}
- response: {datasetRid: rid, branch: string, endTransactionRid: rid, schemaId: uuid, computedDatasetStats: null|object}

### POST /foundry-telemetry-service/api/execution-history-query/logs/retention/metric/load
- count 12, status 200
- request: {producingRid: rid}
- response: {metricLogRetentionMetadata: {currentLogRetentionDuration: number, minLogTime: null, maxLogTime: null}}

### POST /foundry-telemetry-service/api/execution-history-query/logs/retention/request/load
- count 3, status 200
- request: {producingRid: rid}
- response: {requestLogRetentionMetadata: {currentLogRetentionDuration: number, minLogTime: null, maxLogTime: null}}

### POST /foundry-telemetry-service/api/owning-rid/{rid}/metrics/expression
- count 20, status 200
- request: {sessionTags: [], queryExpression: {type: string, function: {functionType: {type: string, rate: {…}}, subQuery: {type: string, series: {…}}}, series: {metricName: string, tags: []}}, fromInclusive: number, toExclusive: number, stepSize: number}
- response: {results: []}

### POST /graphql-gateway/api/bulk
- count 54, status 200
- request: {operations: {}, requests: [{hash: string, name: string, variables: {rid: rid, resourceRid: rid, compassNamespaceRid: rid, filter: {…}, producingRid: rid, toExclusive: datetime, pageSize: number, currentAppRid: rid, _currentAppRidIsMissing: boolean, ontologyRid: rid, appRid: rid, branchRid: rid, isMain: boolean, objectTypeRid: rid}}]}

### POST /job-tracker/api/builds/bulkV2
- count 17, status 200
- request: [{buildFilter: {type: string, filter: {branchIds: [string], jobTypes: [string], inputDatasetRids: [rid], userIds: [], datasetRids: [], scheduleIds: [], excludedBranchIds: [], jobDatasetRids: [], buildStatuses: [string], excludedJobTypes: [], transformTypes: [string], excludedTransformTypes: [], excludedUserIds: [], buildIds: [], projectRids: []}}, limit: number, sort: {type: string, direction: string}}]
- response: [{buildDetails: [{buildId: rid, user: string, userId: uuid, startedTime: datetime, finishedTime: datetime, outputDatasets: [{…}], buildStatus: string, jobs: [{…}], syncs: [], vectorDetails: [], statusDetails: null, securedProperties: {…}, restrictedJobCount: number, scheduleId: null, projectRids: [rid], dockerArtifactIds: []}], buildCount: number}]

### POST /multipass/api/authz/batch/access
- count 6, status 200
- request: [rid]
- response: {{key}: boolean}

### POST /multipass/api/authz/batch/operations
- count 73, status 200
- request: [rid]
- response: {resourceToOperationsMap: {{key}: [string]}}

### POST /multipass/api/authz/markings/resources/summaries
- count 2, status 200
- request: {resources: [rid], types: [string]}
- response: {categories: [{id: string, displayName: string, description: null, categoryType: string, markings: [{…}], createdAt: datetime, createdBy: null, markingType: string, priority: null, deleted: boolean}], markingsSummaries: {{key}: {conjunctive: [], disjunctive: [[uuid]], containerConjunctive: [], containerDisjunctive: [], satisfiesConstraints: boolean}}}

### POST /multipass/api/users
- count 1, status 200
- request: [uuid]
- response: [{id: uuid, username: string, attributes: {multipass:given-name: [string], multipass:service-name: [string], multipass:realm: [string], multipass:realm-name: [string]}}]

### POST /object-set-service/api/sql-endpoint/v1/queries/query
- count 3, status 200
- request: {querySpec: {query: string, tableProviders: {}, dialect: string, options: {options: [{…}]}}, executionParams: {defaultBranchIds: [], resultFormat: string, resultMode: string, rowLimit: number}}
- response: {type: string, sync: {result: string, resultFormat: string, queryStructure: {inputs: {{key}: {…}}, outputs: {}, metadata: {}}}}

### POST /objects-data-funnel/api/status/object-type
- count 31, status 200
- request: {objectType: rid}
- response: {isMigratingFunnelStorageSystem: null, resolvedRef: {type: string, branch: rid}, activePipeline: {type: string, batch: {pipelineId: {type: string, batch: uuid}, ontologyVersion: uuid, current: {data: {…}}, upcoming: null|object, datasources: {{key}: {…}}, datasourceReferences: {{key}: {…}}, page: {last: {…}, lastSuccessful: {…}, firstFailed: null, lastFailed: null, status: {…}, retryCount: null, platformFailuresStreakLength: number}, objectDbs: [{…}], hasPatches: boolean, patchedPropertiesV2: [], patchedProperties: [], latestPatchCommittedAt: null, latestDirectWriteCommittedAt: null, schemaVersion: number, failureDetails: [], storageSystem: string, directSourceTelemetry: null}}, replacementPipeline: null|object, invalidDefinition: null, archiveStatus: {type: string, active: {}}, activePipelineHasPatches: boolean}

### POST /objects-data-funnel/api/view/currentV4
- count 7, status 200
- request: {objectTypes: [{rid: rid, ref: null}], dbType: [string], snapshotId: null}
- response: {snapshotId: string, views: [{locator: {rid: rid, ref: null}, resolved: {views: [{…}], ref: null, forkView: null}}]}

### POST /objects-data-funnel/api/view/policiesV3
- count 1, status 200
- request: {objectTypes: [{rid: rid, ref: null}]}
- response: {policies: [{locator: {rid: rid, ref: null}, resolved: {policies: {…}, ref: null}}]}

### POST /objects-writeback/api/writeback/getDatasetsForObjectType/{rid}
- count 1, status 200
- request: {pageSize: number}
- response: {writebackDatasets: [{operations: [string], rid: rid, objectType: rid, createdBy: uuid, updatePolicy: {type: string, always: {…}}, spec: {filter: {…}, schemaConfiguration: {…}, patchesConfiguration: {…}}}], nextPageToken: null}

### POST /objects-writeback/api/writeback/status
- count 1, status 200
- request: {writebackDatasets: [rid]}
- response: {statuses: {{key}: {type: string, upToDate: {}}}}

### POST /ontology-metadata/api/actions/types/load/all/{rid}/{uuid}
- count 17, status 200
- request: {pageSizeLimit: number}
- response: {actionTypes: [], nextPageToken: null}

### POST /ontology-metadata/api/entityMetadata/load
- count 24, status 200
- request: {objectTypes: [{objectTypeRid: rid, ontologyVersion: uuid}], linkTypes: [{linkTypeRid: rid, ontologyVersion: uuid}], includeSystemEntityMetadata: boolean, includeObjectTypesWithoutSearchableDatasources: boolean}
- response: {objectTypes: [{objectTypeRid: rid, objectTypeEntityMetadata: {entityConfig: {…}, arePatchesEnabled: boolean, targetStorageBackend: {…}, redacted: null, actionLogRequirednessMetadata: {…}, diffEdits: boolean, gothamMapping: null, provenance: null|object, editsResolutionStrategies: {…}, aliases: [], editsHistory: {…}, objectTypeIndexingSettings: null|object, patchApplicationStrategy: {…}, directDatasourceConfiguration: null, usesOnlyOsv2ObjectRids: boolean, interfaceSettings: {…}, owningDirectWriters: {…}}, objectTypeSystemEntityMetadata: {syncMetadata: {…}, entityMigrationStatus: {…}, redacted: null}, ontologyRid: rid, ontologyVersion: uuid}], linkTypes: [{linkTypeRid: rid, linkTypeEntityMetadata: {entityConfig: {…}, arePatchesEnabled: boolean, targetStorageBackend: {…}, provenance: {…}, redacted: null}, linkTypeSystemEntityMetadata: {syncMetadata: {…}, entityMigrationStatus: {…}, redact…

### POST /ontology-metadata/api/experimental/getObjectDbs
- count 2, status 200
- request: {ontologyRid: rid}
- response: {objectDbs: [{type: string, displayMetadata: {displayName: string}}]}

### POST /ontology-metadata/api/formatting/rulesets/loadRuleSets
- count 71, status 200
- request: {ruleSets: {{key}: uuid}, ruleSetsByBranch: {}, includeObjectTypesWithoutSearchableDatasources: boolean}
- response: {ruleSets: {{key}: {rid: rid, name: string, description: null, itType: {type: string, baseType: string}, namedTypes: {}, chains: [{…}]}}}

### POST /ontology-metadata/api/ontology/linkTypesForObjectTypes
- count 6, status 200
- request: {objectTypeVersions: {{key}: uuid}, objectTypeBranches: {}, loadRedacted: boolean, includeObjectTypesWithoutSearchableDatasources: boolean, includeLinkTypesForDerivedPropertyLinkDefinitions: boolean}
- response: {linkTypes: {{key}: [{description: null, definition: {…}, id: string, rid: rid, status: {…}, redacted: null}]}}

### POST /ontology-metadata/api/ontology/linkTypesForObjectTypesV2
- count 7, status 200
- request: {objectTypeVersions: {{key}: uuid}, objectTypeBranches: {}}
- response: {linkTypes: {{key}: []}}

### POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities
- count 71, status 200
- request: {objectTypes: [{identifier: {objectTypeRid: rid, type: string, objectTypeId: string}, versionReference: {ontologyVersion: uuid, type: string}}], datasourceTypes: [string], linkTypes: [{identifier: {linkTypeRid: rid, type: string, linkTypeId: string}, versionReference: {ontologyVersion: uuid, type: string}}], sharedPropertyTypes: [], interfaceTypes: [], typeGroups: [], actionTypes: [{rid: rid, versionReference: {ontologyVersion: uuid, type: string}}], includeSchemaMigrationMetadata: boolean, loadRedacted: boolean, includeObjectTypesWithoutSearchableDatasources: boolean, includeEntityMetadata: boolean}
- response: {objectTypes: [{objectType: {displayMetadata: {…}, symbolConfig: null, id: string, primaryKeys: [rid], propertyTypes: {…}, rid: rid, titlePropertyTypeRid: rid, traits: {…}, apiName: string, status: {…}, redacted: null, implementsInterfaces: [], implementsInterfaces2: [], allImplementsInterfaces: {…}, typeGroups: [], editPolicies: null}, ontologyRid: rid, ontologyVersion: uuid, datasources: [{…}], entityMetadata: null|object, resolvedBranch: {type: string, default: {…}}, schemaMigrations: null|object}], linkTypes: [{linkType: {description: null, definition: {…}, id: string, rid: rid, status: {…}, redacted: null}, ontologyRid: rid, ontologyVersion: uuid, datasources: [], entityMetadata: {entityConfig: {…}, arePatchesEnabled: boolean, targetStorageBackend: {…}, provenance: {…}, redacted: null}, resolvedBranch: {type: string, default: {…}}}], sharedPropertyTypes: [], interfaceTypes: [], type…

### POST /ontology-metadata/api/ontology/ontology/load/datasources
- count 2, status 200
- request: {objectTypes: {}, manyToManyLinkTypes: {}, datasourceTypes: [string], loadRedacted: boolean, includeObjectTypesWithoutSearchableDatasources: boolean}
- response: {manyToManyLinkTypes: {}, objectTypes: {}}

### POST /ontology-metadata/api/ontology/ontology/load/{rid}/summary
- count 16, status 200
- request: {}
- response: {objectTypes: {visibleObjectTypes: number, maximumNumberOfObjectTypes: number, maxVectorDimensionality: number}, linkTypes: {visibleEntities: number, maximumNumberOfOneToManyLinkTypes: number, maximumNumberOfManyToManyLinkTypes: number}, actionTypes: {visibleEntities: number, maximumNumberOfActionTypes: number}, sharedProperties: {visibleEntities: number}, interfaces: {visibleEntities: number}, typeGroups: {visibleEntities: number}}

### POST /ontology-metadata/api/ontology/ontology/load/{rid}/{uuid}/loadAllObjectTypes
- count 17, status 200
- request: {pageSizeLimit: number, includeObjectTypesWithoutSearchableDatasources: boolean}
- response: {objectTypes: [], nextPageToken: null}

### POST /ontology-metadata/api/ontology/v2/load/all
- count 43, status 200
- request: {externalMappingConfigurationFilters: [string]}
- response: {ontologies: {{key}: {apiName: string, displayName: string, description: string, currentOntologyVersion: uuid, currentSystemOntologyVersion: uuid, defaultBranchRid: rid, namespace: string, ontologyOwnersGroupId: uuid, ontologyOwnersGroupIds: [uuid], governanceBoardGroupId: null|uuid, organizationMarkingIds: [uuid], ontologyAdminConfig: {enableUsage: boolean, suggestProjectsPermissionModel: boolean}, isShared: boolean, compassNamespaceRid: rid, ontologyProjectRid: rid, areOrganizationMarkingsInheritedFromNamespace: boolean, areRolesEnabled: boolean, roleGrants: [{…}], restrictedRoleGrants: [], externalMappingConfigurations: [], permissionModel: {type: string, rolesEnabled: {…}, rolesEnforced: {…}}, isDefaultOntologyMultiOrg: boolean, semanticSearchIndexingStatus: string, enabledObjectStoragesStatus: string, ontologyApiNamespaceIdentifier: null}}}

### POST /ontology-metadata/api/ontology/v2/modification/history/entity
- count 62, status 200
- request: {limit: number, entityRid: {actionTypeRid: rid, type: string, objectTypeRid: rid, linkTypeRid: rid}, pageToken: null}
- response: {entityModificationPageItems: [{ontologyVersion: uuid, attribution: {date: datetime, author: uuid}, modificationType: string, description: null|string}], nextPageToken: null, entityMetadataModificationPageItems: [], entityMetadataNextPageToken: null}

### POST /ontology-metadata/api/ontology/v2/{rid}/modification/history
- count 3, status 200
- request: {limit: number}
- response: {modificationPageItems: [{previousOntologyVersion: uuid, ontologyVersion: uuid, attribution: {date: datetime, author: uuid}, summary: {affectedObjectTypes: {…}, affectedObjectTypeDatasources: {…}, affectedLinkTypes: {…}, affectedManyToManyLinkTypeDatasources: {…}, affectedRuleSets: {…}, affectedActionTypes: {…}, affectedSharedPropertyTypes: {…}, affectedInterfaceTypes: {…}, affectedObjectTypeEntityMetadatas: {…}, affectedLinkTypeEntityMetadatas: {…}, affectedObjectTypeSchemaMigrations: {…}, affectedTypeGroups: {…}}, description: null|string, sourceOntologyBranchRid: null}], nextPageToken: null}

### POST /ontology-metadata/api/organization/getSettings/user
- count 17, status 200
- request: {}
- response: {organization: rid, usage: {usageEnabled: boolean}, proposals: {enabledStatus: {type: string, disabled: {}}}}

### POST /ontology-metadata/api/usage/checkActionTypeProvenanceStatus
- count 13, status 200
- request: {actionTypeRids: [rid]}
- response: {provenanceStatusByActionType: {{key}: {type: string, noFunctionRules: {}}}}

### POST /people/api/personal/get-favorites
- count 63, status 200
- request: {userId: uuid, resourceKinds: [{resourceService: string, resourceType: string}]}
- response: {orderedFavorites: [{resourceRid: rid, lastFavorited: datetime}]}

### POST /people/api/profile/get-profiles
- count 15, status 200
- request: {userIds: [uuid]}
- response: {profiles: {{key}: {userId: uuid, username: string, realm: uuid, givenName: string, familyName: string, primaryEmail: string, imageUrl: null, bio: null, jobTitle: null, department: null, location: null}}}

### POST /phonograph2/api/objects/registry/bulk/objectTypes/metadata
- count 49, status 200
- request: [string]
- response: {}

### POST /phonograph2/api/objects/registry/bulk/objectTypes/usageMetadata
- count 23, status 200
- request: [string]
- response: {}

### POST /phonograph2/api/objects/registry/bulk/relations/metadata
- count 6, status 200
- request: [string]
- response: {}

### POST /phonograph2/api/objects/registry/bulk/relations/usageMetadata
- count 3, status 200
- request: [string]
- response: {}

### PUT /approvals/api/search/task-requests
- count 3, status 200
- request: {filters: [{customIndexedData: {key: string, values: [rid]}, type: string, taskType: {taskTypes: [string]}, status: {statuses: [string]}, createdBy: {userIds: [uuid]}, notTitle: {contains: rid, type: string}}], sort: {field: string, order: string}, pageSizeLimit: number}
- response: {requests: [], totalCount: number}

### PUT /foundry-dependency-service/api/dependencies/get-tagged-dependents-all-versions
- count 25, status 200
- request: {dependencyRid: {actionType: rid, type: string, objectType: rid}, foundryBranch: {main: {}, type: string}, tag: string, dependentTypes: []}
- response: {dependents: [{edgeCreationTime: number, foundryBranch: {type: string, main: {…}}, dependent: {type: string, dependent: {…}}, dependency: {type: string, dependency: {…}}}]}

### PUT /multipass/api/authz/markings/usable
- count 7, status 200
- request: {includeDeleted: boolean, markingTypes: [string]}
- response: {categories: [{id: uuid, displayName: null, description: null, categoryType: string, markings: [{…}], createdAt: null, createdBy: null, markingType: string, priority: null, deleted: boolean}], userMarkings: [uuid], markingsUserCanDeclassify: [uuid], markingsUserCanUse: [uuid]}

### PUT /multipass/api/organizations/v2/all
- count 67, status 200
- response: {{key}: {organizationRid: rid, displayName: string, description: null, markingId: uuid, host: string, deleted: boolean, deletionContextRid: null}}

### PUT /multipass/api/roles/v2/roleSets
- count 1, status 200
- request: {roleSetIds: [string]}
- response: {roleSets: {ontology: {id: string, displayName: string, description: string, organizationRid: null, context: string, roles: {ontology:manage: {…}, ontology:view: {…}, ontology:unrestricted-edit: {…}, ontology:unrestricted: {…}, ontology:discover: {…}, ontology:edit: {…}}, canEditRoles: boolean, isDefaultRoleSet: boolean, isServiceOnly: boolean}}}

### PUT /object-set-service/api/objectSets/entities
- count 3, status 200
- request: {objectSet: {type: string, base: {objectTypeId: string}}, objectSetContext: {}}
- response: {linkTypeRids: [], objectTypeRids: [rid], invalidEntities: []}

### PUT /object-set-service/api/objectSets/objects/top/initial
- count 9, status 200
- request: {objectSet: {base: {objectTypeId: string}, type: string, staticV2: {objectIdentifiers: [{…}]}}, objectSetContext: {}, pageSize: number, propertySet: {allProperties: {}, type: string, selected: {propertySelection: {propertyId: {…}, type: string}}}, resultOrdering: {propertyValue: {propertyOrdering: [{…}]}, type: string, unspecified: {}}, runtimeDerivedProperties: {}, objectPagingResponseOptions: {enableMemoryBasedPaging: boolean}, responseOptions: {includeObjectSetEntities: boolean}}
- response: {results: [{objectRid: rid, objectTypeRid: rid, primaryKey: {{key}: {…}}, title: string, properties: {{key}: {…}}, runtimeDerivedProperties: {}, score: null, version: {type: string, v1: string}}], interfaceViews: {}, interfaceViewsV2: {}, nextPageToken: null, totalResults: number, objectSetEntities: {linkTypeRids: [], objectTypeRids: [rid], interfaceTypeRids: [], objectTypeMetadata: {{key}: {objectTypeId: string, properties: {…}}}}, usageCost: null, securities: [], objectLoadingFailures: null}

### PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectTypes
- count 6, status 200
- request: {objectTypeRids: [rid], versionReference: {ontologyVersion: uuid, type: string}, includeInterfaceActionTypes: boolean}
- response: {actionTypeRidsByObjectTypeRid: {{key}: [rid]}}

### PUT /ontology-metadata/api/permissions/actionTypes
- count 28, status 200
- request: {actionTypeRids: [rid]}
- response: {actionTypePermissions: {{key}: {canView: boolean, canEdit: boolean, canUseNotifications: boolean, canUpdateRoles: boolean, hasRolesApplied: boolean, permissionModel: {type: string, roles: {…}}, packageRid: null, canOverrideNotificationRedaction: boolean}}}

### PUT /ontology-metadata/api/permissions/linkTypes
- count 3, status 200
- request: {linkTypeRids: [rid]}
- response: {linkTypePermissions: {{key}: {canView: boolean, canEdit: boolean, canDelete: boolean, canAddDatasources: boolean, canUpdateRoles: boolean, datasourcePermissions: {}, isEditRestrictedByDatasources: boolean, packageRid: null, permissionModel: {type: string, roles: {…}}}}}

### PUT /ontology-metadata/api/permissions/objectTypes
- count 23, status 200
- request: {objectTypeRids: [rid]}
- response: {objectTypePermissions: {{key}: {canView: boolean, canEdit: boolean, canDelete: boolean, canAddDatasources: boolean, canUpdateRoles: boolean, canApplyRestrictedSchemaMigrations: boolean, datasourcePermissions: {{key}: {…}}, propertySecurityGroupPermissions: {}, isEditRestrictedByDatasources: boolean, packageRid: null, permissionModel: {type: string, roles: {…}, publicProject: {…}}, objectEditPolicyPermissions: {canCreate: boolean, canEdit: boolean, canDelete: boolean}}}}

### PUT /ontology-metadata/api/schemamigrations/load/objecttype
- count 8, status 200
- request: {objectTypeRid: rid, ontologyVersion: uuid}
- response: {migrationPageItems: [], schemaVersion: number, nextPageToken: null}

### PUT /ontology-metadata/api/schemamigrations/load/objecttypes
- count 5, status 200
- request: {objectTypeRids: [{objectTypeRid: rid, ontologyVersion: uuid}]}
- response: {schemaTransitions: [{objectTypeRid: rid, ontologyVersion: uuid, schemaTransitions: [], schemaVersion: number}]}

### PUT /ontology-metadata/api/usage/search/getUsage
- count 18, status 200
- request: {ontologyEntity: {objectTypeWithProperties: {objectTypeRid: rid, propertyTypeRids: []}, type: string}, userIds: [], userAgents: [], usageTypes: [string], startDay: null, endDay: null}
- response: {usageOverall: {uniqueUsersCount: number}, usagePerDay: {2026-10-18T00:00Z: {usageByType: {READ: number, REGISTRATION: number, METADATA: number, WRITE: number}, uniqueUsersCount: number}, 2026-10-17T00:00Z: {usageByType: {READ: number, REGISTRATION: number, METADATA: number, WRITE: number}, uniqueUsersCount: number}, 2026-10-16T00:00Z: {usageByType: {READ: number, REGISTRATION: number, METADATA: number, WRITE: number}, uniqueUsersCount: number}}, topUsageByUser: {{key}: {usageByType: {READ: number, REGISTRATION: number, METADATA: number, WRITE: number}}}, topUsageByUserAgent: {workshop-app: {usageByType: {READ: number, REGISTRATION: number, METADATA: number, WRITE: number}, uniqueUsersCount: number}}, topUsageByProperty: {{key}: {usageByType: {READ: number, REGISTRATION: number, METADATA: number, WRITE: number}, uniqueUsersCount: number}}, latestUsageEventIndexed: datetime}

