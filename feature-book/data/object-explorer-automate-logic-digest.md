# Crawl digest

Sources: out-e/hubble, out-e/object-monitoring, out-e/logic-app

## Screen kinds (18)

### /workspace/hubble/
- title: Object Explorer
- reached by: (root) | All | Select ontology…
- headings: Object Explorer search · No type groups · No saved explorations and lists
- tabs: New exploration
- fields: Search for objects... · Filter for a type group... · Filter for an object type... · Search explorations... · Filter...
- columns: OBJECT TYPE NAME · STATUS · OBJECT COUNT · USAGE · TYPE GROUPS · DESCRIPTION
- empty states: No type groups · No saved explorations and lists Your saved explorations and object lists will be accessible here.
- controls: All ontologies · billysorg Ontology Ontology · billysorg Ontology
- overlays: All ontologies billysorg Ontology Ontology
- calls: GET /multipass/api/sessions/definitions/current · GET /compass/api/registry/actions · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/bulk · GET /workspace/api/ams/metadataV2 · GET /workspace/api/commands/load · GET /workspace/api/lifecycleStatusByApplication · POST /people/api/personal/get-favorites

### /workspace/hubble/exploration
- title: [Example] Route Alert Comments | Exploration · All Orders | Exploration · Billy's Orders | Exploration · (+7)
- reached by: [Example] Route Alert Comment 0 1 user 0 apps | [Example] Route Alert Comment 0 1 user 0 apps > [Example] Route Alert Comments | [Example] Route Alert Comment 0 1 user 0 apps > Explore
- headings: No [Example] Route Alert Comments Found · Object has no links configured · No [Example] Flights Found
- tabs: New exploration · [Example] Route Alert Comments · Explore · Results · All · Analyze objects · Manage object type · All Orders · Billy's Orders · [Example] Runways · Typo in invoice email · [Example] Carriers · [Example] Flights · [Examples] Airports · The Eastern Iowa · Nashville International
- fields: Search properties to add a chart or filter… · Start date · End date · Search for apps… · Type to search… · min value · max value · text · Filter… · Search…
- empty states: No Values · No [Example] Route Alert Comments Found Remove filters to increase matches · Object has no links configured · No [Example] Flights Found Remove filters to increase matches
- controls: [Example] Route Alert Comments · Explorations · Lists · Open in Insight · [Example] Route Alert Comment · Link to documentation · Save · Custom layout · Compare · Explore · Results · Actions · Open in · Show filters · Open configuration · Remove chart · + Group by · Exact · Results 0 · Configure panel · Linked objects · Route Alert · Add chart · All · Analyze objects · Manage object type · Open in Quiver Visualize, analyze and transform objects. · Explore data lineage Explore the pipeline upstream and downstream of this object. · View backing dataset View the data source for this object. · Ana…
- overlays: All Analyze objects Manage object type Open in Quiver Visualize, analyze and transform objects. Expl ‖ All Analyze objects Manage object type Open in Quiver Visualize, analyze and transform objects. Anal ‖ PROPERTIES OF [EXAMPLE] ROUTE ALERT COMMENTS Alert Id Comment Id Type Title Created By
- calls: POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /ontology-metadata/api/ontology/linkTypesForObjectTypesV2 · POST /objects-data-funnel/api/view/currentV4 · POST /hubble-server/api/explorations/configurations/get/{rid} · GET /hubble-server/api/user-preferences/v2/global · GET /hubble-server/api/user-preferences/v2 · POST /object-set-service/api/objectSets/temporary · GET /phonograph2/api/objects/registry/ontology/all · PUT /object-set-service/api/objectSets/objects/top/initial · GET /carbon-server/api/configuration/config-for-carbon-sessionV2 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · GET /foundry-metadata/api/schemas/datasets/{rid}/branches/master · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes · POST /people/api/personal/get-favorites · GET /compass/api/resources/{rid} · POST /people/api/eventsink/create-events · GET /compass/api/folders/home · POST /hubble-server/api/object-views/v8/configuration/has-permissions · (+5)

### /workspace/hubble/exploration  [dialog: Proceed to open in Contour?]
- title: [Example] Route Alert Comments | Exploration
- reached by: [Example] Route Alert Comment 0 1 user 0 apps > Open in > Analyze as dataset in Contour An…
- headings: No [Example] Route Alert Comments Found · Proceed to open in Contour?
- tabs: New exploration · [Example] Route Alert Comments · Explore · Results
- fields: Search properties to add a chart or filter… · Start date · End date
- empty states: No Values · No [Example] Route Alert Comments Found Remove filters to increase matches
- controls: Close · Proceed to analyze in Contour · Open in Quiver instead
- overlays: Proceed to open in Contour? Opening these objects in Contour has limitations compared to opening the

### /workspace/hubble/exploration/autosaved/{uuid}_8vIxS%2FkGWzc8_0
- title: [Example] Flights | Exploration
- reached by: [Example] Flight Object Type 0 objects > Arrival Airport > Arriving Flight | [Example] Flight Object Type 0 objects > Arrival Airport > Arriving Flight > Has Arrival A…
- headings: No [Example] Flights Found
- tabs: New exploration · [Example] Flights · Explore · Results
- fields: Search properties to add a chart or filter… · Start date · End date · min value · max value · Filter… · text
- empty states: No Values · No [Example] Flights Found Remove filters to increase matches
- controls: [Example] Flights · [Example] Flight · Has Arrival Airport · Aircraft · Arrival Airport · Carriers · Departure Airport · Flight Sensor · Route
- overlays: Has link 0 Does not have link 0
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /hubble-server/api/autosaved/{uuid}/8vIxS%2FkGWzc8/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes · POST /people/api/personal/get-favorites

### /workspace/hubble/exploration/autosaved/{uuid}_aIbQe95268pQ_0
- title: [Examples] Airports | Exploration
- reached by: [Example] Flight Object Type 0 objects > Departure Airport | [Example] Flight Object Type 0 objects > Departure Airport > Has Departing Flight
- headings: No [Examples] Airports Found
- tabs: [Example] Flights · [Examples] Airports · [Example] Carriers · Explore · Results
- fields: Search properties to add a chart or filter… · min value · max value · Start date · End date · Filter… · text
- empty states: No Values · No [Examples] Airports Found Remove filters to increase matches
- controls: [Example] Airport · Has Departing Flight · Clear · Undo Pivot Search · Arriving Flight · Arriving Route · Departing Flight · Departing Route · Runway
- overlays: Has link 0 Does not have link 178
- calls: POST /people/api/personal/get-favorites · POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /hubble-server/api/autosaved/{uuid}/aIbQe95268pQ/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes

### /workspace/hubble/exploration/autosaved/{uuid}_BOQg9yeqDmiv_0
- title: [Examples] Airports | Exploration
- reached by: [Example] Flight Object Type 0 objects > Arrival Airport | [Example] Flight Object Type 0 objects > Arrival Airport > [Examples] Airports | [Example] Flight Object Type 0 objects > Arrival Airport > [Example] Airport
- headings: No [Examples] Airports Found
- tabs: New exploration · [Examples] Airports · Explore · Results
- fields: Search properties to add a chart or filter… · min value · max value · Start date · End date · Filter… · text
- empty states: No Values · No [Examples] Airports Found Remove filters to increase matches
- controls: [Examples] Airports · [Example] Airport · Has Arriving Flight · Clear · Undo Pivot Search · Arriving Flight · Arriving Route · Departing Flight · Departing Route · Runway · Manage · 9 dependents · billysorg Ontology · Copy to clipboard · See all · Expand · [Example] Flight · [Example] Runway · Return to preview
- overlays: [Example] Airport 178 objects Manage 9 dependents Airports with various geospatial properties. Usefu ‖ Return to preview Properties (19) Airport Id Display Airport Name Airport Airport Start Date Airport ‖ Has link 0 Does not have link 178
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · GET /hubble-server/api/user-preferences/v2/global · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /hubble-server/api/autosaved/{uuid}/BOQg9yeqDmiv/0 · POST /ontology-metadata/api/ontology/linkTypesForObjectTypesV2 · POST /objects-data-funnel/api/view/currentV4 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes · POST /people/api/personal/get-favorites

### /workspace/hubble/exploration/autosaved/{uuid}_BvAIhIj4hnzo_0
- title: [Example] Routes | Exploration
- reached by: [Example] Flight Object Type 0 objects > Arrival Airport > Departing Route
- headings: No [Example] Routes Found
- tabs: [Example] Flights · [Example] Routes · Explore · Results
- fields: Search properties to add a chart or filter… · min value · max value · Filter…
- empty states: No Values · No [Example] Routes Found Remove filters to increase matches
- controls: [Example] Routes · [Example] Route · Departure Airport Has Arriving Flight · Undo Pivot Search · Count of [Example] Routes · Departure Airport · Destination Airport · Flight · Route Alert
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /hubble-server/api/autosaved/{uuid}/BvAIhIj4hnzo/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes

### /workspace/hubble/exploration/autosaved/{uuid}_Cl1jUNgD7RMM_0
- title: [Example] Routes | Exploration
- reached by: [Example] Flight Object Type 0 objects > Route
- headings: No [Example] Routes Found
- tabs: [Example] Carriers · [Examples] Airports · [Example] Flight Sensors · [Example] Routes · Explore · Results
- fields: Search properties to add a chart or filter… · min value · max value · Filter…
- empty states: No Values · No [Example] Routes Found Remove filters to increase matches
- controls: [Example] Routes · [Example] Route · Has Flight · Clear · Undo Pivot Search · Count of [Example] Routes · Destination Airport · Flight · Route Alert
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /hubble-server/api/autosaved/{uuid}/Cl1jUNgD7RMM/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes · POST /people/api/personal/get-favorites

### /workspace/hubble/exploration/autosaved/{uuid}_DHK9Vz6syn5E_0
- title: [Example] Flight Sensors | Exploration
- reached by: [Example] Flight Object Type 0 objects > Flight Sensor | [Example] Flight Object Type 0 objects > Flight Sensor > [Example] Flight Sensors | [Example] Flight Object Type 0 objects > Flight Sensor > [Example] Flight Sensor
- headings: No [Example] Flight Sensors Found
- tabs: [Examples] Airports · [Example] Carriers · [Example] Flight Sensors · Explore · Results
- fields: Search properties to add a chart or filter… · text
- empty states: No Values · No [Example] Flight Sensors Found Remove filters to increase matches
- controls: [Example] Flight Sensors · [Example] Flight Sensor · Has Flight · Clear · Undo Pivot Search · Flight · Manage · 1 dependent · billysorg Ontology · Copy to clipboard · See all · Expand · [Example] Flight · Return to preview
- overlays: [Example] Flight Sensor 594 objects Manage 1 dependent The flight sensor holds any sensor readings f ‖ Return to preview Properties (6) Title Unique Sensor Flight Id Flight Id Flight Sensor Series Id Ser ‖ Has link 0 Does not have link 594
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /hubble-server/api/autosaved/{uuid}/DHK9Vz6syn5E/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · PUT /object-set-service/api/aggregate · POST /people/api/personal/get-favorites

### /workspace/hubble/exploration/autosaved/{uuid}_FxZCnO6Ij%2BV4_0
- title: [Example] Carriers | Exploration
- reached by: [Example] Flight Object Type 0 objects > Carriers | [Example] Flight Object Type 0 objects > Carriers > Has Flights
- headings: No [Example] Carriers Found
- tabs: [Example] Flights · [Examples] Airports · [Example] Carriers · Explore · Results
- fields: Search properties to add a chart or filter… · min value · max value · text
- empty states: No Values · No [Example] Carriers Found Remove filters to increase matches
- controls: [Example] Carriers · [Example] Carrier · Has Flights · Clear · Undo Pivot Search · Flights
- overlays: Has link 0 Does not have link 14
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /hubble-server/api/autosaved/{uuid}/FxZCnO6Ij%2BV4/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes

### /workspace/hubble/exploration/autosaved/{uuid}_GWjPK3dvU6dE_0
- title: [Example] Routes | Exploration
- reached by: [Example] Flight Object Type 0 objects > Arrival Airport > Arriving Route | [Example] Flight Object Type 0 objects > Arrival Airport > Arriving Route > [Example] Rout… | [Example] Flight Object Type 0 objects > Arrival Airport > Arriving Route > Count of [Exam…
- headings: No [Example] Routes Found · Results failed to load
- tabs: New exploration · [Example] Flights · [Example] Routes · Explore · Results
- fields: Search properties to add a chart or filter… · min value · max value · Filter… · text
- empty states: No Values · No [Example] Routes Found Remove filters to increase matches · Results failed to load Please contact your system administrator Show error
- controls: [Example] Routes · [Example] Route · Destination Airport Has Arriving Flight · Undo Pivot Search · Count of [Example] Routes · Departure Airport · Destination Airport · Flight · Route Alert · Open configuration · Remove chart · Sum · Linked to · Show error
- overlays: Count of [Example] Routes Sum ‖ Linked to Destination Airport Results failed to load Please contact your system administrator Show e
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · POST /hubble-server/api/autosaved/{uuid}/GWjPK3dvU6dE/0 · POST /ontology-metadata/api/ontology/linkTypesForObjectTypesV2 · POST /objects-data-funnel/api/view/currentV4 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes · GET /opus-server/api/config/map · POST /people/api/personal/get-favorites

### /workspace/hubble/exploration/autosaved/{uuid}_IpFFw%2B5LtiBt_0
- title: [Example] Runways | Exploration
- reached by: [Example] Flight Object Type 0 objects > Arrival Airport > Runway | [Example] Flight Object Type 0 objects > Arrival Airport > Runway > Airport Has Arriving F…
- headings: No [Example] Runways Found · Results failed to load
- tabs: [Example] Flights · [Example] Runways · Explore · Results
- fields: Search properties to add a chart or filter… · min value · max value · text
- empty states: No Values · No [Example] Runways Found Remove filters to increase matches · Results failed to load Please contact your system administrator Show error
- controls: [Example] Runways · [Example] Runway · Airport Has Arriving Flight · Undo Pivot Search · Airport · Linked to · Show error
- overlays: Linked to Airport Results failed to load Please contact your system administrator Show error
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /hubble-server/api/autosaved/{uuid}/IpFFw%2B5LtiBt/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · GET /foundry-metadata/api/schemas/datasets/{rid}/branches/master · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes · POST /people/api/personal/get-favorites

### /workspace/hubble/exploration/autosaved/{uuid}_R%2F3xHHnBEztr_0
- title: [Examples] Airports | Exploration
- reached by: [Example] Flight Object Type 0 objects > Arrival Airport > Arriving Route > Destination Ai…
- headings: No [Examples] Airports Found
- tabs: [Examples] Airports · Explore · Results
- fields: Search properties to add a chart or filter… · min value · max value · Start date · End date · Filter…
- empty states: No Values · No [Examples] Airports Found Remove filters to increase matches
- controls: [Examples] Airports · [Example] Airport · Has Arriving Route · and · Has Arriving Flight · Undo Pivot Search · Exact · Arriving Flight · Arriving Route · Departing Flight · Departing Route · Runway
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · GET /hubble-server/api/user-preferences/v2/global · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /hubble-server/api/autosaved/{uuid}/R%2F3xHHnBEztr/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes

### /workspace/hubble/exploration/autosaved/{uuid}_tLCif6EIe67D_0
- title: [Example] Flights | Exploration
- reached by: [Example] Flight Object Type 0 objects > Arrival Airport > Departing Flight | [Example] Flight Object Type 0 objects > Arrival Airport > Departing Flight > Departure Ai…
- headings: No [Example] Flights Found · Results failed to load
- tabs: [Example] Flights · Explore · Results
- fields: Search properties to add a chart or filter… · Start date · End date · min value · max value · Filter… · text
- empty states: No Values · No [Example] Flights Found Remove filters to increase matches · Results failed to load Please contact your system administrator Show error
- controls: [Example] Flight · Departure Airport Has Arriving Flight · Undo Pivot Search · Aircraft · Arrival Airport · Carriers · Departure Airport · Flight Sensor · Route · Linked to · Show error
- overlays: Linked to Departure Airport Results failed to load Please contact your system administrator Show err
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /hubble-server/api/autosaved/{uuid}/tLCif6EIe67D/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes · POST /people/api/personal/get-favorites

### /workspace/hubble/exploration/autosaved/{uuid}_uMBePaxkvudo_0
- title: [Example] Flights | Exploration
- reached by: [Example] Flight Object Type 0 objects > Arrival Airport > Arriving Route > Flight
- headings: No [Example] Flights Found
- tabs: [Example] Flights · Explore · Results
- fields: Search properties to add a chart or filter… · Start date · End date · min value · max value · Filter…
- empty states: No Values · No [Example] Flights Found Remove filters to increase matches
- controls: [Example] Flights · [Example] Flight · Undo Pivot Search · Exact · Aircraft · Arrival Airport · Carriers · Flight Sensor · Route · Linked to Route with 1 filter applied
- calls: POST /hubble-server/api/explorations/configurations/get/{rid} · POST /object-set-service/api/objectSets/temporary · PUT /object-set-service/api/objectSets/objects/top/initial · POST /graphql-gateway/api/bulk · POST /hubble-server/api/autosaved/{uuid}/uMBePaxkvudo/0 · PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType · POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities · PUT /object-set-service/api/aggregate · PUT /object-set-service/api/objectSets/objectTypes

### /workspace/logic-app/
- title: AIP Logic
- reached by: (root) | AIP Logic Home | Recents
- headings: Build no-code Ontology functions · View functions · Explore reference examples · Cross-validate Images and Documents using AIP · Leverage feedback loops in AIP Logic · Use AIP Logic to classify and edit objects · No favorites
- tabs: My installations · All installations
- fields: Search logic functions…
- columns: LOGIC FILE · CREATOR · LAST EDITED BY · LAST VIEWED · LAST MODIFIED
- empty states: LOGIC FILE CREATOR LAST EDITED BY LAST MODIFIED No favorites · No favorites
- controls: My installations · All installations
- overlays: My installations All installations Skeleton product 5 minutes ago Skeleton progress Skeleton product
- calls: GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/bulk · GET /workspace/api/lifecycleStatusByApplication · GET /marketplace/api/installation-app-service/{rid}/blockSet/version/{uuid}/attachments/{uuid}/use-cookie-auth · GET /marketplace/api/block-set-installation/jobs · POST /people/api/personal/get-favorites

### /workspace/object-monitoring/
- title: Automate · Overview
- reached by: (root) | Overview | Open docs
- headings: Create and manage automations · Getting started · Create your first automation · Send a weekly report · Auto-close tickets · Notify on status changes · Explore reference examples · Support ticket resolution with advanced Automations and AIP · Use AIP Logic to classify and edit objects · Write-back enabled Decision Support · Active automations · Recently viewed · You have no recent files · Recently triggered
- tabs: Overview · Automations · My installations · All installations
- fields: Filter or create…
- columns: FILES · CREATOR · LAST EDITED BY · LAST VIEWED · Condition(s) met · Effects · Automation · Time
- empty states: FILES CREATOR LAST EDITED BY LAST VIEWED You have no recent files · You have no recent files · No events found
- controls: My installations · All installations
- overlays: My installations All installations Skeleton product 5 minutes ago Skeleton progress Skeleton product ‖ Create new branch Main Default Your branches ai-fde/<user>/rea-sandbox-open-orders
- calls: GET /multipass/api/sessions/definitions/current · GET /multipass/api/sessions/selection · POST /documentation/api/v2/release-notes/pagination · GET /aip-assist/api/chat/checkAvailability · POST /graphql-gateway/api/bulk · GET /workspace/api/lifecycleStatusByApplication · GET /marketplace/api/installation-app-service/{rid}/blockSet/version/{uuid}/attachments/{uuid}/use-cookie-auth · GET /marketplace/api/block-set-installation/jobs · POST /people/api/personal/get-favorites

### /workspace/object-monitoring/automations
- title: All automations
- reached by: Automations | Automations > Select a space… | Automations > Select resource…
- headings: Filters · SPACE · STATUS · REFERENCED RESOURCES · CONDITION · EFFECTS · RECEIVING NOTIFICATIONS · OWNER · CREATOR · EXPIRATION DATE · No automations · No matching automations
- tabs: Overview · Automations
- fields: Search by name or description · checkbox · Blueprint6.RadioGroup-0 · Search… · Start date · End date · Search... · Blueprint6.RadioGroup-1 · Blueprint6.RadioGroup-2 · Blueprint6.RadioGroup-3 · Blueprint6.RadioGroup-4
- columns: Name · Condition · Status · Creator
- empty states: No automations · No matching automations Try adjusting or clearing your filters. Clear filters · No matching automations Try adjusting or clearing your filters.
- controls: Close filters · Select a space… · Select resource… · Select a condition… · Object type · Action type · Resource file · Time 0 · Object 0 · Time series 0 · Automation dependency 0 · Stream 0 · Dataset 0 · Clear all · Clear · Clear filters
- overlays: Active 0 Error 0 Muted 0 Paused 0 Expired 0 ‖ Actions 0 Logic 0 Notification 0 Function 0 ‖ billysorg Palantir
- calls: POST /graphql-gateway/api/bulk

## Actions not clicked (mutating, 13)

Add chart · Clear · Close · Close filters · Configure in Ontology Manager Edit the configuration for this object type. · Copy to clipboard · New automation · New exploration · New logic · Next · Proceed to analyze in Contour · Remove chart · Save

## Screenshots (17)

- out-e/hubble/shots/01-object-explorer.jpg — page:/workspace/hubble/
- out-e/hubble/shots/02--example-route-alert-comments-exploration.jpg — page:/workspace/hubble/exploration
- out-e/hubble/shots/03-dialog-proceed-to-open-in-contour-.jpg — dialog:/workspace/hubble/exploration|Proceed to open in Contour?
- out-e/hubble/shots/04--examples-airports-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_BOQg9yeqDmiv_0
- out-e/hubble/shots/05--example-flights-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_8vIxS%2FkGWzc8_0
- out-e/hubble/shots/06--example-routes-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_GWjPK3dvU6dE_0
- out-e/hubble/shots/07--examples-airports-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_R%2F3xHHnBEztr_0
- out-e/hubble/shots/08--example-flights-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_uMBePaxkvudo_0
- out-e/hubble/shots/09--example-flights-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_tLCif6EIe67D_0
- out-e/hubble/shots/10--example-routes-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_BvAIhIj4hnzo_0
- out-e/hubble/shots/11--example-runways-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_IpFFw%2B5LtiBt_0
- out-e/hubble/shots/12--example-carriers-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_FxZCnO6Ij%2BV4_0
- out-e/hubble/shots/13--examples-airports-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_aIbQe95268pQ_0
- out-e/hubble/shots/14--example-flight-sensors-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_DHK9Vz6syn5E_0
- out-e/hubble/shots/15--example-routes-exploration.jpg — page:/workspace/hubble/exploration/autosaved/{uuid}_Cl1jUNgD7RMM_0
- out-e/object-monitoring/shots/01-automate.jpg — page:/workspace/object-monitoring/
- out-e/logic-app/shots/01-aip-logic.jpg — page:/workspace/logic-app/

## API surface (51 endpoints)

### GET /aip-assist/api/chat/checkAvailability
- count 1, status 200
- response: {available: boolean}

### GET /carbon-server/api/configuration/config-for-carbon-sessionV2
- count 10, status 200
- response: {defaultWorkspace: null, allAvailableWorkspaces: [], displayMetadata: null}

### GET /compass/api/folders/home
- count 2, status 403
- response: {errorCode: string, errorName: string, errorInstanceId: uuid, parameters: {}}

### GET /compass/api/registry/actions
- count 10, status 200
- response: [{category: null|string, displayHint: {description: null|string, icon: string, label: string}, match: [{type: string, value: null|string, key: string}], method: string, name: string, url: string, precedence: null, actionType: null|string}]

### GET /compass/api/resources/{rid}
- count 4, status 200
- response: {rid: rid, name: string, created: {time: datetime, userId: uuid}, modified: {time: datetime, userId: uuid}, lastModified: number, description: null, operations: [string], urlVariables: {compass:isProject: string}, favorite: null, branches: null, defaultBranch: null, defaultBranchWithMarkings: null, branchesCount: null, hasBranches: null, hasMultipleBranches: null, backedObjectTypes: null, path: null, longDescription: null, directlyTrashed: boolean, inTrash: null, isAutosave: boolean, isHidden: boolean, isPreviewResource: boolean, collections: null, namedCollections: null, …}

### GET /foundry-metadata/api/schemas/datasets/{rid}/branches/master
- count 7, status 200
- response: {branchId: string, transactionRid: rid, versionId: uuid, schema: {fieldSchemaList: [{type: string, name: string, nullable: boolean|null, userDefinedTypeClass: null, customMetadata: {…}, arraySubtype: null, precision: null, scale: null, mapKeyType: null, mapValueType: null, subSchemas: null}], primaryKey: null, dataFrameReaderClass: string, customMetadata: {format: string, path: string, options: {addRowNumber: string}, textParserParams: {parser: string, charsetName: string, fieldDelimiter: string, recordDelimiter: string, quoteCharacter: string, dateFormat: {…}, skipLines: number, jaggedRowBehavior: string, parseErrorBehavior: string, addFilePath: boolean, addFilePathInsteadOfUri: boolean, addByteOffset: boolean, addImportedAt: boolean, initialReadTimeout: string}}}, attribution: {userId: uuid, time: datetime}}

### GET /hubble-server/api/user-preferences/v2
- count 9, status 200
- response: {version: string, tablePreferences: [], versionMetadata: null}

### GET /hubble-server/api/user-preferences/v2/global
- count 12, status 200
- response: {version: string, tablePreferences: [], versionMetadata: null}

### GET /marketplace/api/block-set-installation/jobs
- count 2, status 200
- response: {jobs: [{jobRid: rid, submittedAt: datetime, lastActivityAt: datetime, secondsElapsed: number, installationCreator: uuid, blockSetInstallations: [rid], blockSetInstallationsV2: [{…}], status: {type: string, success: {…}}, isRetryableV2: boolean, isRetryable: boolean}]}

### GET /marketplace/api/installation-app-service/{rid}/blockSet/version/{uuid}/attachments/{uuid}/use-cookie-auth
- count 3, status 200

### GET /multipass/api/authz/access/{rid}
- count 2, status 200
- response: boolean

### GET /opus-server/api/config/map
- count 3, status 200
- response: {apiKeys: {mapboxApiKey: null, bingMapsApiKey: null}, disableDefaultMapboxBaseMaps: boolean, customBaseMaps: [], codexQueueId: string, defaultTimeWindowMinutes: number, initialViewport: {center: {latitude: number, longitude: number, altitude: null}, zoom: number, pitch: number, bearing: number}, searchAroundMaxObjectResults: number, searchAroundTemplateMaxDepth: number, searchDialogMaxObjectResults: number, seriesPollingIntervalSeconds: number, minSeriesPollingIntervalSeconds: number, trackBucketCount: number, maxTrackBucketCount: number, unitSystem: string, searchMinQueryLength: number, searchMinTokenLength: number, useLayerStoreLayers: boolean, watermark: {type: string, none: {}}, enableAutomaticObjectSearch: boolean, enableEnvelopeSecurityAndRequireMapCreation: boolean}

### GET /opus-server/api/graph/v2/pointer/object/{rid}
- count 3, status 200
- response: {graphPointers: [], nextPageToken: null}

### GET /phonograph2/api/objects/registry/ontology/all
- count 9, status 200
- response: {partialObjectTypeVersions: {}, bidirectionalRelationVersions: {}}

### GET /workspace/api/ams/metadataV2
- count 10, status 200
- response: {applicationMetadata: [{id: {producerId: string, appId: string}, name: {defaultValue: string, locales: {…}}, description: {defaultValue: string, locales: {…}}, icon: {type: string, iconUrl: string}, route: string, environments: [string], opens: [{…}], pairability: null|object, isHidden: null}]}

### GET /workspace/api/commands/load
- count 10, status 200
- response: {config: [{applicationId: {producerId: string, appId: string}, commands: [{…}]}]}

### GET /workspace/api/lifecycleStatusByApplication
- count 2, status 200
- response: {lifecycleStatusByApplication: {showcase-app: string, vulcan: string, linter-app-v2: string, oauth2-clients-app: string, auth-redirect: string, authoring: string, standalone-object-view-asset: string, fforms: string, monocle: string, slate-standalone: string, templates: string, slate: string, aip-autopilot-app: string, workspace-debug-app: string, code-workspace-app: string, quiver: string, mcp-hub-app: string, checkpoints-app: string, m: string, ontology: string, fusion: string, aip-analyst-app: string, ml: string, retention-app: string, compute-module-app: string, …}}

### POST /codex-hub/api/v1/computation/batch/nested/blob
- count 8, status 200
- request: {initial: {nodes: {{key}: {identifier: {…}, children: [{…}], parameterizedConfig: {…}}}}, type: string, intermediate: {nodesLeftToCompute: {{key}: {identifier: {…}, parameterizedConfig: {…}, children: [{…}]}}, hydrationIdentifiers: {{key}: {service: uuid, identifier: uuid}}}}
- response: {type: string, partialResult: {computedResults: {}, backoff: {duration: number, reason: string}, nextRequest: {nodesLeftToCompute: {{key}: {…}}, hydrationIdentifiers: {{key}: {…}}}}, finalResult: {computedResults: {{key}: {type: string, result: {…}}}}}

### POST /documentation/api/v2/release-notes/pagination
- count 2, status 200
- request: {productId: string, applicationIds: [], pageSize: number}
- response: {releaseNotes: [{id: uuid, type: string, description: string, categoryTitle: string, categoryId: string, applicationTitle: string, applicationId: string, date: datetime, title: string, prominence: string, releaseVersion: string, productId: string, frontendApplicationId: string, mediaFilenames: [string], longDescription: string, applications: [{…}]}], nextOffset: number}

### POST /graphql-gateway/api/bulk
- count 1, status 200
- request: {operations: {}, requests: [{hash: string, name: string, variables: {}}]}

### POST /hubble-server/api/autosaved/get/{uuid}/BOQg9yeqDmiv/0
- count 5, status 200
- request: {exploration: {versionAvailability: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {type: string, success: {state: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {…}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}}}

### POST /hubble-server/api/autosaved/get/{uuid}/GWjPK3dvU6dE/0
- count 2, status 200
- request: {exploration: {versionAvailability: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {type: string, success: {state: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {…}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}}}

### POST /hubble-server/api/autosaved/{uuid}/8Qox45GOJwVT/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/8vIxS%2FkGWzc8/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/BOQg9yeqDmiv/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/BvAIhIj4hnzo/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/Cl1jUNgD7RMM/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/DHK9Vz6syn5E/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/FxZCnO6Ij%2BV4/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/GWjPK3dvU6dE/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/IpFFw%2B5LtiBt/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/R%2F3xHHnBEztr/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/aIbQe95268pQ/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/tGsg4GbbpBXS/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/tLCif6EIe67D/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/autosaved/{uuid}/uMBePaxkvudo/0
- count 1, status 200
- request: {exploration: {objectSetRid: {temporaryObjectSetRid: rid}, layoutLocator: {layout: {objectTypeRid: rid, charts: [{…}], initialPerspectiveId: string, sorts: [], tableOptions: {…}}, type: string}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}, type: string}
- response: {locator: {sessionId: uuid, secureStateId: string, version: number, securityRid: rid}, state: {type: string, exploration: {objectSetRid: {unversionedObjectSetRid: rid}, layoutLocator: {type: string, layout: {…}}, currentPerspectiveId: string, versionRequirements: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {…}}}}, metadata: {createdBy: uuid, createdAt: datetime, lastAccessedAt: datetime}}

### POST /hubble-server/api/explorations/configurations/get/{rid}
- count 27, status 200
- request: {versionAvailability: {appVersion: string, ontologyVersion: string, explorationApiVersion: string, chartConfigTypes: {LISTOGRAM: string, CHOROPLETH_MAP: string, GRID_PLOT: string, SINGLE_STAT_CARD: string, SUMMARY_STAT_TABLE: string, DISTRIBUTION: string, TIMELINE: string, GEOHASH_MAP: string, PIE_CHART: string, OBJECTS_LIST: string}}}
- response: {explorationConfig: {layoutToUse: null, userLayout: null, globalLayout: null, contextSpecificLayout: null, layoutsPerWorkspace: {}}}

### POST /hubble-server/api/object-views/v8/configuration/has-permissions
- count 2, status 200
- request: {hasEditPermission: [string], hasPublishPermission: [string]}
- response: {hasEditPermission: {{key}: boolean, uwen0pfc.one-state-airports: boolean}, hasPublishPermission: {{key}: boolean, uwen0pfc.one-state-airports: boolean}}

### POST /object-set-service/api/objectSets/temporary
- count 28, status 200
- request: {objectSet: {base: {objectTypeId: string}, type: string, static: {objectRids: [rid]}, searchAround: {relationId: string, relationSide: string, objectSet: {base: {…}, type: string, searchAround: {…}}}, intersected: {objectSets: [{…}]}}, timeToLive: string}
- response: {objectSetRid: rid}

### POST /objects-data-funnel/api/view/currentV4
- count 32, status 200
- request: {objectTypes: [{rid: rid, ref: null}], dbType: [string], snapshotId: null}
- response: {snapshotId: string, views: [{locator: {rid: rid, ref: null}, resolved: {views: [{…}], ref: null, forkView: null}}]}

### POST /ontology-metadata/api/ontology/linkTypesForObjectTypesV2
- count 32, status 200
- request: {objectTypeVersions: {{key}: uuid}, objectTypeBranches: {}}
- response: {linkTypes: {{key}: [{description: null, definition: {…}, id: string, rid: rid, status: {…}, redacted: null}]}}

### POST /ontology-metadata/api/ontology/ontology/bulkLoadEntities
- count 106, status 200
- request: {objectTypes: [{identifier: {objectTypeId: string, type: string, objectTypeRid: rid}, versionReference: {ontologyVersion: uuid, type: string}}], linkTypes: [{identifier: {linkTypeId: string, type: string}}], datasourceTypes: [string], sharedPropertyTypes: [], interfaceTypes: [], typeGroups: [], includeObjectTypesWithoutSearchableDatasources: boolean, actionTypes: [], entityMetadata: {}}
- response: {objectTypes: [{objectType: {displayMetadata: {…}, symbolConfig: null, id: string, primaryKeys: [rid], propertyTypes: {…}, rid: rid, titlePropertyTypeRid: rid, traits: {…}, apiName: string, status: {…}, redacted: null, implementsInterfaces: [], implementsInterfaces2: [], allImplementsInterfaces: {…}, typeGroups: [], editPolicies: null}, ontologyRid: rid, ontologyVersion: uuid, datasources: [{…}], entityMetadata: null|object, resolvedBranch: {type: string, default: {…}}, schemaMigrations: null}], linkTypes: [{linkType: {description: null, definition: {…}, id: string, rid: rid, status: {…}, redacted: null}, ontologyRid: rid, ontologyVersion: uuid, datasources: [{…}], entityMetadata: null, resolvedBranch: {type: string, default: {…}}}], sharedPropertyTypes: [], interfaceTypes: [], typeGroups: [], actionTypes: []}

### POST /people/api/eventsink/create-events
- count 3, status 200
- request: {createEventRequests: [{viewEvent: {metadataAdditions: {…}, resourceParameters: {…}, resourceRid: rid, userId: uuid}, type: string}]}
- response: {createEventResponses: [{eventRid: rid}]}

### POST /people/api/personal/get-favorites
- count 2, status 200
- request: {userId: uuid}
- response: {orderedFavorites: [{resourceRid: rid, lastFavorited: datetime}]}

### PUT /object-set-service/api/aggregate
- count 169, status 200
- request: {objectSet: {base: {objectTypeId: string}, type: string, searchAround: {objectSet: {base: {…}, type: string, searchAround: {…}, static: {…}}, relationId: string, relationSide: string}, filtered: {objectSet: {searchAround: {…}, type: string}, filter: {geoBoundingBox: {…}, type: string}}, intersected: {objectSets: [{…}]}}, objectSetContext: {owningRid: rid, reportUsage: boolean}, executionMode: string, aggregation: {metrics: {batched_metric_6: {max: {…}, type: string, min: {…}}, batched_metric_7: {min: {…}, type: string, max: {…}}, batched_metric_8: {count: {…}, type: string, min: {…}}, batched_metric_5: {max: {…}, type: string}, batched_metric_9: {max: {…}, type: string}, batched_metric_10: {…
- response: {result: {metrics: {batched_metric_7: null|number, batched_metric_6: null|number, batched_metric_8: null|number, batched_metric_5: null|number, batched_metric_10: null|number, batched_metric_9: null|number, batched_metric_11: null|number, batched_metric_18: number, batched_metric_19: number, batched_metric_20: number, batched_metric_21: number, batched_metric_16: number, batched_metric_17: number, batched_metric_22: number, batched_metric_4: null|number, batched_metric_3: null|number, batched_metric_12: null|number, batched_metric_13: number, batched_metric_14: number, batched_metric_29: null, batched_metric_30: null|number, batched_metric_31: null|number, batched_metric_32: null|number, batched_metric_27: null, batched_metric_28: null, …}, subAggregations: {batched_subagg_2: {itemsInOtherBuckets: number, resultAccuracy: {…}, buckets: [{…}], nullValueBucket: null}, batched_subagg_3: {ite…

### PUT /object-set-service/api/aggregate-v2
- count 15, status 200
- request: {objectSetContext: {}, objectSet: {searchAround: {objectSet: {static: {…}, type: string}, relationId: string, relationSide: string}, type: string}, aggregation: {metrics: {count: {count: {…}, type: string}}, subAggregations: {}}, responseOptions: {includeObjectSetEntities: boolean}}
- response: {result: {metrics: {count: {type: string, double: number}}, subAggregations: {}}, objectSetEntities: {linkTypeRids: [rid], objectTypeRids: [rid], interfaceTypeRids: [], objectTypeMetadata: {{key}: {objectTypeId: string, properties: {…}}}}, usageCost: null}

### PUT /object-set-service/api/bulk/objectSets
- count 3, status 200
- request: {objectSetRids: [rid]}
- response: {objectSetResponses: {{key}: {objectSet: {objectSet: {…}, securityRid: rid}}}}

### PUT /object-set-service/api/objectSets/objectTypes
- count 24, status 200
- request: {objectSet: {base: {objectTypeId: string}, type: string, searchAround: {objectSet: {base: {…}, type: string, searchAround: {…}}, relationId: string, relationSide: string}, intersected: {objectSets: [{…}]}}, objectSetContext: {owningRid: rid}, responseOptions: {includeObjectSetEntities: boolean}}
- response: {objectTypeIds: [string], objectTypeRids: [rid]}

### PUT /object-set-service/api/objectSets/objects/top/initial
- count 135, status 200
- request: {objectSet: {base: {objectTypeId: string}, type: string, filtered: {objectSet: {base: {…}, type: string, searchAround: {…}, intersected: {…}}, filter: {and: {…}, type: string, not: {…}}}, staticV2: {objectIdentifiers: [{…}]}, searchAround: {objectSet: {base: {…}, type: string, searchAround: {…}, static: {…}}, relationId: string, relationSide: string}, intersected: {objectSets: [{…}]}}, objectSetContext: {}, runtimeDerivedProperties: {}, propertySet: {selected: {propertySelection: {propertyId: {…}, type: string, propertyIdentifier: {…}}}, type: string, allProperties: {}, selectedTypes: {propertyOntologyTypes: [string], propertySelection: {propertyIdentifier: {…}, type: string}}}, resultOrderi…
- response: {results: [{objectRid: rid, objectTypeRid: rid, primaryKey: {{key}: {…}}, title: string, properties: {{key}: {…}}, runtimeDerivedProperties: {}, score: null, version: {type: string, v1: string}}], interfaceViews: {}, interfaceViewsV2: {}, nextPageToken: null|string, totalResults: number, objectSetEntities: null|object, usageCost: null, securities: [], objectLoadingFailures: null}

### PUT /object-set-service/api/objectSets/resultTypes
- count 3, status 200
- request: {objectSet: {searchAround: {objectSet: {static: {…}, type: string}, relationId: string, relationSide: string}, type: string}, objectSetContext: {}}
- response: {resultScope: {objectTypeIds: [string], objectTypeRids: [rid], interfaceTypeRids: []}, resultObjectTypes: {objectTypeIds: [string], objectTypeRids: [rid]}}

### PUT /ontology-metadata/api/ontology/ontology/actionTypesForObjectType
- count 37, status 200
- request: {objectType: rid, pageSize: number, ontologyVersion: uuid}
- response: {actionTypes: [{actionTypeLogic: {logic: {…}, validation: {…}, revert: null, webhooks: null, notifications: [], effects: null}, metadata: {rid: rid, apiName: string, version: string, displayMetadata: {…}, parameters: {…}, returnType: {…}, returnConfiguration: null, sections: {…}, parameterOrdering: [string], formContentOrdering: [{…}], actionLogConfiguration: null, status: {…}, entities: {…}, actionApplyClientSettings: null, notificationSettings: {…}, provenance: null|object, owningResource: null, submissionConfiguration: null, stagingMediaSetRid: null, branchSettings: {…}, scenarioSettings: {…}, isolationSettings: {…}}}], nextPageToken: null, totalActionTypeCount: number, resolvedBranch: {type: string, default: {rid: rid}}}

