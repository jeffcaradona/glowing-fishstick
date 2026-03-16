# AGENTS.md — glowing-fishstick Monorepo Constraints (RDF Triples)

> Machine-optimized compact representation of `AGENTS-readable.md`.
> `AGENTS-readable.md` remains the human-readable canonical source.
> This file MUST NOT weaken or contradict `AGENTS-readable.md`.

## Authority
thisFile IS compactRepresentation of AGENTS-readable.md
AGENTS-readable.md IS canonicalSource for allConstraints
CLAUDE.md MUST_NOT weaken|contradict AGENTS-readable.md
copilot-instructions.md MUST_NOT weaken|contradict AGENTS-readable.md
condensedFile MUST_RETAIN docSync,eventLoopSafety,asyncConsistency,WHYcomments,validationCommands,reuseFirst,discoverability

## Repository Structure
repoType IS monorepoWorkspace
directory sandbox/api/ IS localDevAPI
directory sandbox/app/ IS localDevApp
directory core/ IS coreLibraries ; includes core/generator/templates/ starterScaffolds
directory documentation/ IS projectDocs
directory tests/ IS integrationTests

## Package Boundaries
consumerExamples MUST_USE currentInstallTargetPackages
rootPackage IS_NOT runtimeInstallable ; unless explicit exports/main+files
rootPackage MUST_NOT be assumedImportable

## Intentional Code Duplication

### Consolidated
createAdminThrottle CANONICAL_SOURCE core/shared/src/middlewares/admin-throttle.js
core/web-app,core/service-api IMPORT createAdminThrottle FROM @glowing-fishstick/shared
core/*/src/middlewares/admin-throttle.js IS reExportStub ; preserves originalImportPath

### Intentionally Separate — DO NOT consolidate
errorHandlers SEPARATE core/web-app/src/middlewares/errorHandler.js,core/service-api/src/middlewares/error-handler.js
errorHandlers SEPARATE_BECAUSE app HAS htmlContentNegotiation via Eta
errorHandlers SEPARATE_BECAUSE api IS jsonOnly
errorHandlers MUST_KEEP logging+errorEnvelope aligned ; diverge ONLY on responseFormat
factories SEPARATE core/web-app/src/app-factory.js,core/service-api/src/api-factory.js
factories SEPARATE_BECAUSE middlewareOrder IS loadBearing+differs
factories SEPARATE_BECAUSE abstraction WOULD_OBSCURE auditableStack
securityTests SEPARATE core/*/tests/integration/security-hardening.test.js
securityTests SEPARATE_BECAUSE eachPackage MUST_PROVE ownSecurityContract
securityTests SEPARATE_BECAUSE sharedHarness WOULD_OBSCURE implementationUnderTest

## Instruction File Parity
AGENTS-readable.md IS canonicalSource
CLAUDE.md,copilot-instructions.md,AGENTS.md MUST_NOT weaken|contradict AGENTS-readable.md
condensedFile MUST_RETAIN_POINTER_TO docSyncRequirements
condensedFile MUST_RETAIN_POINTER_TO eventLoopSafety
condensedFile MUST_RETAIN_POINTER_TO asyncConsistency+deterministicErrorHandling
condensedFile MUST_RETAIN_POINTER_TO mandatoryWHYcommenting
condensedFile MUST_RETAIN_POINTER_TO validationCommandExecution
condensedFile MUST_RETAIN_POINTER_TO reuseFirst
condensedFile MUST_RETAIN_POINTER_TO discoverability
ifParityCannotBePreserved: restoreDetail ; NOT dropConstraints

## Documentation Requirements

### Canonical Truth Sources
truthSource.1 IS README installation+importExamples
truthSource.2 IS sandbox/app/DEV_APP_README examples+directoryDiagrams
truthSource.3 IS documentation/00-project-specs publicAPISnippets
truthSource.4 IS documentation/99-potential-gaps.md implementationState

### Sync Rules
editOf packageNames|exports|directoryStructure|apiEntrypoints REQUIRES
  update README installation+importExamples,
  update sandbox/app/DEV_APP_README examples+directoryDiagrams,
  update documentation/00-project-specs publicAPISnippets,
  update documentation/99-potential-gaps.md ifImplementationStateChanged

### Forbidden Documentation Patterns
examples MUST_NOT import from ../../index.js ; unless marked local-only
docs MUST_NOT reference legacyCorePathsThatDoNotExist
installDocs MUST_NOT conflict with actualPackageExportBoundaries

### Documentation Definition of Done
docUpdate REQUIRES
  verify allDocumentedFilePathsExist,
  verify allImportSpecifiers matchCurrentPackageBoundaries,
  verify allCodeSnippets reflectCurrentFunctionFileNames,
  run repoSearch for knownStaleStrings

## Discoverability Requirements

### Reuse-First Rule
beforeBuilding newService|utility|middleware|infrastructure MUST_CHECK
  config.services (ServiceContainer via createConfig+createApiConfig),
  @glowing-fishstick/shared exports (README exportTable OR core/shared/index.js),
  @glowing-fishstick/logger (preconfigured dev/prod ; DO_NOT install|configure Pino separately),
  existing package.json dependencies (may be available transitively)

### Package README Requirements
publishedPackageREADME MUST_INCLUDE
  completeExportTable (everyPublicExport+oneLineDescription),
  configPropertyTable (forConfigFactory ; including config.services),
  usageExamples (showIntendedIntegrationPoint ; NOT justAPISignatures)

### Type Declaration Requirements
publishedPackage MUST_SHIP index.d.ts
index.d.ts MUST_HAVE allPublicExports typedSignatures
package.json MUST_HAVE "types":"index.d.ts"
index.d.ts MUST_BE_IN "files" array
index.d.ts MUST_UPDATE whenExportsChange

### Dependency Visibility Rules
runtimeOptionalConsumerDep MUST_USE peerDependencies ; with peerDependenciesMeta optional:true
devDependencies IS_INVISIBLE toConsumers ; NEVER put consumerFacingOptionalDeps there alone
devDependencies IS_FOR monorepoDevTestOnly

### Discoverability Definition of Done
newExport|configProperty|capability REQUIRES exportInREADME exportTable+description
newExport|configProperty|capability REQUIRES index.d.ts updated+typedSignature
newExport|configProperty|capability REQUIRES ifConfigInjected: documentedInConfigFactorySection+usageExample
newExport|configProperty|capability REQUIRES ifRuntimeOptionalTransitiveDep: inPeerDependencies

## Event Loop Safety

### Critical Rule
requestPath MUST_NOT use
  fs.*Sync,
  child_process.*Sync,
  zlib.*Sync,
  cryptoSyncAPIs (pbkdf2Sync|scryptSync),
  longTightLoops
requestPath MUST_USE asyncPromiseAPIs|boundedWorkUnits|asyncServicesWorkers

### Allowed Exceptions
startupOnlyInit ALLOWED blockingSync ; MUST_DOCUMENT ; beforeServerAcceptsTraffic
oneTimeBuildDevScripts ALLOWED blockingSync ; notRuntimeCode

### Handler Design
routeHandlers+middleware MUST delegate heavyWork to asyncServicesWorkers
expensiveComputation MUST move offHotPath ; if exceeds fewMilliseconds underLoad
requestProcessing MUST_NOT do syncFilesystemTraversal|syncTemplateReads

## I/O Patterns
io PREFER async fs/promises APIs
io PREFER cache immutableRarelyChangingData inMemory
io PREFER streaming for largePayloadsFiles ; NOT bufferingEntireContent
io PREFER timeouts+retries+backpressureAware for networkCalls
io MUST_NOT do perRequestSyncFileExistenceChecks
io MUST_NOT do perRequest readFileSync|writeFileSync
io MUST_NOT do fireAndForget withoutErrorHandling

## CPU-bound Work
cpuWork MUST_NOT run in middleware|routes
cpuExpensiveTasks MUST_USE workerThreads|externalQueues|precomputation
loops MUST_BE bounded+dataSizeAware
inputSizes MUST_HAVE guardrails
processing PREFER incremental|streaming
hotPaths MUST_AVOID accidental O(n²)

## Async Consistency
publicAPIs SHOULD_BE consistently async
callbackTiming MUST_BE deterministic ; NOT sometimesSync+sometimesAsync
promises+callbacks MUST_NOT mixCompletionPaths ; noDoubleComplete
promises MUST return|await ; unless explicitlyDetached+documented
errors MUST surface via oneCleanMechanism (throw|reject|callback(err)) ; NOT multiple

## V8 Optimization
objectShapes SHOULD initialize expectedFields early
hotObjects MUST_NOT monkeyPatch perRequest
hotObjects MUST minimize shapeChange from add|removeFields
hotCallSites PREFER monomorphic OVER polymorphic
codeGeneration MUST_NOT use eval|newFunction|with
hotPathSerialization MUST_BE lean+predictable

## Logging
hotPathLogs MUST_BE structured+levelGated
logs MUST_NOT do expensiveStringification forDroppedMessages
logTransports PREFER async|nonBlocking
logs MUST_INCLUDE latency,status,requestIdCorrelation whereApplicable

## Code Comments
comments DEFAULT rationale(WHY) ; NOT mechanics(what)
comments MUST_NOT restate whatCodeDoes
comments MUST explain whyCodeExists,whatConstraint,whatBreaksIfChanged
comments MUST_ADD_PROACTIVELY_FOR conditionals,errorHandling,fallbacks,workarounds,performance,security,weirdButNecessary
nonTrivialBlocks REQUIRE atLeastOne WHYcomment

### Architecture Comment Constraints
express: routes MUST_BE thin ; decisions IN services|modules ; WHYcomment middlewareOrder
eta: viewModels MUST_BE minimal+explicit ; noBusinessLogicInTemplates ; WHYcomment precomputedFields
mssql: MUST_USE storedProcedures ; noAdHocSQL ; parameterizedCalls+explicitTypes ; ifQuerying useApprovedViewsOnly
errorHandling: consistentHTTPErrors ; WHYcomment statusCodeChoices+clientExpectations
security: validate+normalizeInput ; neverLeakInternalErrors ; WHYcomment securityConstraints

### Code Quality
code PREFER boring+explicit OVER clever
names SHOULD encode intent ; reduceNeedForComments
logging MUST explain WHY logExists (diagnostics|audit|tracing)

## PR Review Checklist
review.1: noNewSyncBlockingAPIs in request|middlewarePaths
review.2: noMixedSyncAsyncCallbackTiming
review.3: noUnboundedLoops|heavyCPU in hotPaths
review.4: errorHandling singlePath+deterministic
review.5: logging useful+notThroughputDominant
review.6: tests cover concurrencySensitiveBehavior wherePractical
review.7: newExports addedTo packageREADME exportTable+index.d.ts
review.8: newConfigProperties documentedIn configFactorySection
review.9: noNewModuleLevelSingletons duplicating config.services

### Exception Documentation
exception REQUIRES document:
  whyItIsSafe,
  whyAlternativesNotUsed,
  scopeOfImpact (startupOnly|devOnly|lowFrequencyPath)

## Validation Commands
search.files: `rg --files`
search.docInconsistencies: `rg "from '../../index.js'|npm install glowing-fishstick|./src/app.js|./src/server.js" README.md sandbox/app/DEV_APP_README.md documentation/*.md`
verify.packageBoundaries: `npm pack --dry-run`
quality.lint: `npm run lint`
quality.format: `npm run format`
quality.testAll: `npm run test:all`
search.syncBlockingAPIs: `rg -n "\\b(readFileSync|writeFileSync|appendFileSync|existsSync|readdirSync|statSync|lstatSync|mkdirSync|rmSync|unlinkSync|execSync|spawnSync|pbkdf2Sync|scryptSync)\\b" app core api`
search.antiPatterns: `rg -n "res\\.end\\s*=|eval\\(|new Function\\(|with\\s*\\(" app core api`
performanceSensitiveChange REQUIRES briefNote in PRDescription aboutExpectedLatencyThroughputImpact
