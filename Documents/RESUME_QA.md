# Interview Preparation Guide — Yash Maheshwari

---

## 1. Quick Elevator Pitch

> "I'm a full-stack developer with 3+ years of experience, mostly in React-heavy frontends and Node.js backends. At Ramsoft I worked on medical imaging software — DICOM viewers, real-time collaboration systems, and AI text pipelines. Before that at Phablecare I focused on prescription workflow tooling. I hold an Integrated Dual Degree (B.Tech + M.Tech) from IIT BHU."

---

## 2. Experience Deep-Dives

### Ramsoft (Software Developer | Jun 2023 – Oct 2025)

---

#### REST APIs & GraphQL

- **What you did:** Designed and optimised REST APIs and GraphQL services.
- **Impact:** Reduced API calls by 30–40%, improved response latency in complex data-driven workflows.

**Q: How did you identify which endpoints to optimise?**

> I started by instrumenting the app with Datadog to trace slow or frequent API calls. I looked for two patterns: endpoints that were called repeatedly in a short window with the same params (candidates for caching or batching), and endpoints that fetched far more data than the UI actually used (candidates for GraphQL field selection). Once I had a ranked list by latency and call volume, I prioritised the ones that were on the critical render path — i.e., anything blocking the initial page load or the DICOM viewer opening.

**Q: When would you choose GraphQL over REST?**

> I use GraphQL when the client has variable data needs across different views — for example, a dashboard that shows a summary card needs 3 fields, but the detail view needs 20. With REST you'd either over-fetch on the summary or maintain two endpoints. GraphQL lets the client declare exactly what it needs. I stick with REST when the API is simple and uniform, when I need HTTP caching out of the box, or when the team consuming it isn't comfortable with GraphQL tooling. At Ramsoft the DICOM metadata queries were a perfect GraphQL fit — different viewports needed different subsets of the same study data.

**Q: How did you measure the 30–40% reduction?**

> We tracked it via Datadog APM — specifically the total outbound request count per user session and the p95 response time on the affected endpoints. Before the change I captured a baseline over two weeks. After rolling out the GraphQL consolidation and adding a short-lived in-memory cache for repeated queries, I compared the same metrics over the following two weeks. The reduction in call count was consistent across both weeks, which gave me confidence it wasn't just a traffic anomaly.

**Q: How do you defend the GraphQL data model you designed?**

> Before migrating an endpoint to GraphQL, I had to think carefully about schema design — specifically, how to model the DICOM study data so that all the different viewport needs could be satisfied from a single graph without creating awkward resolver chains. I kept the schema close to the domain model (Study → Series → Instance) rather than designing it around any one UI view, which made it flexible enough that each viewport could query exactly the fields it needed without me having to anticipate every combination upfront. A poorly designed schema leads to deeply nested queries that cause N+1 problems at the resolver level. I avoided this by keeping types flat where possible, using DataLoader to batch and deduplicate DB calls within a single query execution, and setting query depth and complexity limits to prevent clients from accidentally hammering the DB with an expensive nested query.

| Risk | How I addressed it |
|---|---|
| N+1 queries | DataLoader for batching resolver DB calls |
| Overly deep nesting | Keep types flat; limit query depth |
| Abusive queries | Query complexity limits / query cost analysis |
| Schema drift | Schema-first design, versioned via SDL files in Git |
| Over-flexible schema | Model around domain entities, not UI views |

**Q: Why not just use tables and REST for DICOM data?**

> You absolutely can — and many systems do. The question is what it costs at query time. In our case, a single REST call to load a viewport needed data from all four levels — Patient, Study, Series, Instance. With REST over relational tables you'd either make 4 separate calls (waterfall, slow), or write a custom joined endpoint for every viewport combination. We had multiple viewport layouts — single, quad, compare — each needing a different shape of data. That meant maintaining many custom endpoints and updating them every time the UI changed. GraphQL let the UI declare what it needed and we maintained one schema instead of N endpoints. REST didn't go away — we still used it for simple CRUD operations like creating a study or updating patient details. The rule was simple: if the query shape varies by caller, GraphQL. If it's always the same, REST.

**Q: The DICOM structure is a tree — is that why you used GraphQL?**

> Exactly. DICOM has a natural tree structure — Patient → Study → Series → Instance. A tree is a type of graph, and GraphQL's hierarchical query model maps directly onto that structure. Different clients needed different depths of that tree — a worklist just needs Patient and Study, a viewport needs all the way down to Instance. GraphQL let each client declare exactly how deep it wanted to go, which is what made it a natural fit. And to be precise — GraphQL is named for the idea of querying your data as a graph of interconnected types, not because it uses a graph database underneath. Our actual data still lived in MongoDB — GraphQL was just the query layer that let clients traverse the relationships flexibly.

---

#### Node.js Document Processing

- **What you did:** Built backend services for HTML → PDF conversion and Blob handling pipelines.
- **Impact:** Improved system reliability and automation.

**Q: Which library did you use for HTML → PDF? Walk me through the pipeline.**

> We used Puppeteer running in a headless Chrome instance on the server. The pipeline worked like this: the frontend would submit a structured HTML template (populated with report data), the Node service would spin up a Puppeteer page, inject the HTML, wait for any async assets like charts to finish rendering, then call `page.pdf()` with the desired paper size and margins. The resulting Buffer was stored as a Blob in Azure Blob Storage, and a signed URL was returned to the client. We kept Puppeteer instances in a pool rather than spawning one per request to avoid the cold-start cost on every call.

**Q: How did you handle large file uploads / Blobs?**

> For uploads, we streamed directly to Azure Blob Storage using the `@azure/storage-blob` SDK's `uploadStream` method rather than buffering the entire file in memory first. On the read side, we used range requests so the client could request a byte range of a large PDF instead of downloading the whole file. For the Blob metadata, we stored references in MongoDB and kept the actual binary in Azure — this kept the DB lightweight and the storage cheap and scalable.

**Q: What failure modes did you design for?**

> Three main ones: (1) Puppeteer crashes — we wrapped the render call in a try/catch, returned the instance to the pool if healthy or destroyed and replaced it if not, and retried once automatically before surfacing an error. (2) Azure upload failures — we used a dead-letter queue pattern: failed uploads were pushed to a retry queue and re-attempted with exponential backoff. (3) Timeout — Puppeteer renders could hang if the HTML referenced a broken external asset, so we set a hard timeout of 30 seconds and killed the page if it exceeded that.

---

#### ElasticSearch & MongoDB

- **What you did:** Built and optimised queries for large-scale datasets.
- **Impact:** Low-latency search at scale.

**Q: Explain how ElasticSearch indexing works.**

> ElasticSearch builds an inverted index over your documents. When you index a document, ES runs the text through an analyser — tokenising it, lowercasing, removing stop words, stemming — and then maps each resulting token to the list of document IDs that contain it. At query time, it looks up the tokens in the inverted index, computes a relevance score (BM25 by default), and returns the top-N hits. You can also store doc values for numeric/keyword fields to support fast aggregations and sorting without touching the inverted index.

**Q: How did you choose between ES and Mongo for a given query?**

> MongoDB was our source of truth for structured document data — patient records, study metadata, user settings. ElasticSearch was a read-optimised projection of that data, synced asynchronously. Any query that needed full-text search, fuzzy matching, or complex aggregations across millions of records went to ES. Anything that needed a single document by ID, or a transactional write, went to Mongo. The rule of thumb was: if you'd write a `$regex` or a multi-field `$or` in Mongo, move it to ES instead.

**Q: How did you approach query performance tuning?**

> First I used the `_explain` API in ES and `explain()` in Mongo to understand how queries were being executed — whether they were hitting indexes or doing collection scans. In ES I restructured queries to filter before scoring (using `filter` context instead of `must` where exact match was enough, since filter results are cached). In Mongo I used compound indexes aligned with the query's field order and sort direction, and checked for index selectivity. I also paginated large result sets using `search_after` in ES rather than `from/size` deep pagination, which degrades at high offsets.

---

#### Multi-Viewport DICOM System

- **What you did:** Architected a scalable multi-viewport DICOM viewer; migrated state from React Context to Zustand.
- **Impact:** LCP dropped from 6s → 3s; improved accessibility (WCAG), responsiveness, and memory usage.

**Q: Why Zustand over Context? Why not Redux?**

> Context has a known problem: any component that consumes a context re-renders whenever any value in that context changes, even if the component only cares about one field. In a multi-viewport viewer where each viewport has its own position, zoom, window/level, and tool state, this caused massive render cascades. Zustand lets components subscribe to only the slice of state they actually use via selector functions, so a change in viewport A doesn't re-render viewport B's component tree at all.

> I didn't choose Redux because it adds significant boilerplate — actions, reducers, selectors — and for our use case Zustand achieved the same fine-grained subscription model with a fraction of the setup. Redux is worth it when you need the DevTools time-travel debugging or you're on a very large team that benefits from the rigid pattern, but neither applied here.

**Q: How did you profile the rendering bottleneck that caused 6s LCP?**

> I used Chrome DevTools' Performance tab and React DevTools' Profiler. The flame chart showed that on load, the Context provider at the root was updating 3–4 times as async data arrived, and each update triggered re-renders across the entire viewport tree — sometimes 200+ component renders in a single update cycle. The React Profiler showed several components taking 80–150ms each to reconcile. I also used Lighthouse to confirm LCP was 6s in a simulated mobile environment. After the Zustand migration, the same flow showed 15–20 targeted renders, and LCP dropped to ~3s.

**Q: Walk me through your WCAG accessibility improvements.**

> We were targeting WCAG 2.1 AA. The main changes were: (1) All interactive elements — viewport controls, tool buttons — got proper `aria-label` attributes since they were icon-only. (2) We ensured keyboard navigability — tab order was logical, and all actions triggerable by mouse were also reachable by keyboard. (3) Colour contrast on overlay text and tool panels was brought to at least 4.5:1 ratio. (4) Focus indicators were made visible (the default browser outline had been suppressed by a global CSS reset). (5) We added `role="img"` and descriptive `aria-label` to the DICOM canvas elements so screen readers could announce the viewport context.

**Q: What does a DICOM viewport rendering pipeline look like?**

> At a high level: the client requests a DICOM study from our backend, which fetches the `.dcm` files from storage and streams them. On the frontend we used Cornerstone.js — it decodes the DICOM pixel data (handling different transfer syntaxes like JPEG 2000 or raw uncompressed), applies windowing (window center/width) to map Hounsfield units to a visible greyscale range, and renders the result onto an HTML canvas. In our multi-viewport setup, each viewport managed its own Cornerstone rendering context, its own image cache slice, and its own tool state (pan, zoom, measurement overlays). Zustand coordinated shared state like which study/series was loaded and layout configuration.

---

#### Real-Time User Presence & Locking (WebSocket / Twilio)

- **What you did:** Designed real-time presence and activity tracking with WebSocket-based locking, configurable auto-release, and RBAC integration.
- **Impact:** Prevented concurrent edits across 500+ active sessions; ensured data consistency.

**Q: How does your locking mechanism handle a user who disconnects unexpectedly?**

> Each lock had a server-side TTL — a configurable auto-release timer that started when the lock was acquired. The client sent a heartbeat ping over the WebSocket every N seconds to renew the TTL. If the heartbeat stopped — because the tab closed, the network dropped, or the browser crashed — the server would not receive the renewal and the lock would expire after the TTL elapsed. The TTL was tunable per resource type; for short editing sessions it might be 60 seconds, for longer workflows up to 5 minutes. On the frontend, we also listened for the `beforeunload` event to send an explicit release message as a best-effort cleanup.

**Q: What is auto-release and how is the timeout configured?**

> Auto-release is the server-side mechanism that releases a lock when no heartbeat is received within the TTL window. The timeout was stored per resource in the database and could be set by admins via a configuration panel — so a radiologist workflow might have a longer lock than a simpler form. On the server, we used a Node.js `setTimeout` per lock, reset on each valid heartbeat. If the timeout fired, the server released the lock, updated the resource state in MongoDB, and broadcast a `lock-released` event over WebSocket to all connected clients so they could update their UI immediately.

**Q: How does RBAC layer on top of the locking logic?**

> RBAC controlled who was *allowed* to acquire a lock in the first place. Before issuing a lock, the server checked the user's role against the resource's permission matrix — for example, a viewer role could not acquire an edit lock at all. Once a lock was held, RBAC also controlled what actions the lock holder could perform — some roles could lock but not delete, for instance. The lock payload included the holder's user ID and role, which the server validated on every subsequent action within that locked session, not just at acquisition time.

**Q: How did you test correctness at scale (500+ sessions)?**

> We used a combination of strategies. For unit tests, we tested the lock state machine in isolation — acquisition, heartbeat renewal, expiry, explicit release — using Jest. For integration, we wrote Playwright scripts that opened multiple browser contexts simultaneously and attempted concurrent edits on the same resource, asserting that only one context ever successfully acquired the lock. For load testing, I wrote a script using `ws` (Node WebSocket client) to simulate 500+ concurrent connections, each trying to lock and heartbeat on a set of resources, and verified via server logs that no two clients held the same lock simultaneously.

---

#### AI-Driven Speech-to-Text Pipeline

- **What you did:** Engineered a pipeline using OpenAI API + prompt engineering to refine speech-to-text output.
- **Impact:** Improved accuracy/consistency across 100+ workflows; accelerated content generation by 40%.

**Q: How did you structure your prompts? Show an example.**

> The raw speech-to-text output (from a transcription service) came in as unformatted, often grammatically messy text. The prompt I sent to the OpenAI API had three parts: a system message defining the role and rules, the raw transcript as user input, and explicit output format instructions. For example:

```
System: You are a clinical documentation assistant. Your job is to take raw 
speech-to-text input from a radiologist and convert it into a clean, 
structured radiology report. Fix grammar and punctuation. Do not add clinical 
information that was not spoken. Use standard radiology terminology. 
Output only the cleaned report text, no preamble.

User: [raw transcript here]
```

> Keeping the system prompt tight and telling the model exactly what *not* to do (add information) was key to reliability in a medical context.

**Q: How did you measure "accuracy improvement"?**

> We created a benchmark set of 50 audio samples where we had the ground-truth report that the radiologist intended. We measured two things: (1) Word Error Rate between the raw STT output and the ground truth, versus the WER after our pipeline — the pipeline reduced WER by ~35%. (2) We also had two senior radiologists score a random sample of 20 outputs on a 1–5 scale for clinical accuracy and readability. Post-pipeline scores were consistently 4–5 vs 2–3 for raw STT output.

**Q: How did you handle OpenAI API failures / rate limits in production?**

> We wrapped all OpenAI calls in a retry wrapper with exponential backoff — on a 429 (rate limit) or 5xx response, we waited 1s, 2s, 4s before failing permanently. We also queued requests using a Node.js job queue (Bull) so that bursts of workflows didn't hit the API simultaneously. If the API failed permanently after retries, the system fell back gracefully: it saved the raw STT output rather than a refined version, and flagged the workflow in the UI so the user knew to review it manually. We tracked failure rates in Datadog and set an alert if they exceeded 2% in a rolling hour.

**Q: What safeguards did you put around AI-generated content before it reached users?**

> Several layers: (1) The prompt explicitly instructed the model not to add clinical information — this was the most critical guardrail since hallucinated medical detail could cause harm. (2) We ran a lightweight post-processing check that compared key entities (patient name, laterality, anatomy) in the output against the source metadata — if they didn't match, the output was flagged for human review. (3) The UI always showed the AI output in a "suggested" state, requiring the radiologist to confirm or edit before it was saved to the record. We never auto-committed AI output.

---

### Phablecare (Associate Software Developer | May 2022 – Feb 2023)

---

#### Data Library for Prescription Workflows

- **What you did:** Built a Data Library system to streamline prescription data entry.
- **Impact:** Entry time cut from ~2 min → <10 sec.

**Q: How did you design the Data Library — was it a search-and-select component?**

> Yes, essentially. Doctors were repeatedly typing the same medications, dosages, and instructions from scratch on every prescription. I built a searchable library that stored frequently used prescription line items — a combination of drug name, dosage, frequency, and instructions as a reusable template. The UI was a type-ahead search input: as the doctor typed, it fuzzy-matched against the library and showed suggestions. Selecting one pre-filled all the fields instantly. Doctors could also save new combinations to the library from the prescription form itself. The backend was a simple REST API over a MongoDB collection with a text index on the drug name and template fields.

**Q: How did you validate that the 10-second target was met?**

> We did two things: (1) We instrumented the prescription form with analytics events — `form_opened` and `form_submitted` timestamps — and measured the median completion time before and after. Pre-launch median was around 110–120 seconds; post-launch it dropped to 7–9 seconds for library-assisted entries. (2) We also did usability sessions with 5 doctors in the clinic, timed them with a stopwatch, and observed where they still slowed down so we could iterate on the search UX.

**Q: What edge cases in medical data entry did you account for?**

> A few important ones: (1) Drug name variations — the same drug might be stored under a brand name or generic name, so I added aliases to each library entry. (2) Dosage units — we enforced a controlled vocabulary (mg, ml, units) rather than free text to prevent "500mg" vs "500 mg" mismatches. (3) Stale entries — if a drug was recalled or a standard dosage changed, we needed a way to mark library entries as deprecated without deleting them, so old prescriptions still made sense historically. (4) Offline resilience — doctors sometimes had poor connectivity, so we cached the library locally in the browser and synced on reconnect.

---

#### Legacy Refactor: Class → Hooks + Atomic Design

- **What you did:** Refactored class components to React hooks; adopted Atoms/Molecules/Organisms/Pages architecture.
- **Impact:** Better maintainability; 15% bundle size reduction.

**Q: What is atomic design and why does it improve maintainability?**

> Atomic design, coined by Brad Frost, organises UI components into a hierarchy: Atoms (smallest building blocks — a Button, an Input, a Label), Molecules (combinations of atoms — a FormField = Label + Input + ErrorMessage), Organisms (complex sections — a PrescriptionForm = multiple FormFields + Submit), and Pages (full views that compose organisms). It improves maintainability because every piece of UI has a single home and a clear scope. When a designer changes the button style, you update one Atom and every Molecule and Organism that uses it updates automatically. There's no hunting through 30 files for hardcoded button styles.

**Q: What caused the 15% bundle reduction — code splitting, tree shaking, or component consolidation?**

> Primarily component consolidation and tree shaking. The legacy codebase had grown organically — similar UI elements had been implemented multiple times across different parts of the app. By unifying them into shared atoms, we eliminated a lot of dead and duplicate code. The tree shaking gains came from switching to named exports on our component library (so bundlers could drop unused components), and from replacing a few heavy utility libraries with smaller focused alternatives. We also added `React.lazy` on a couple of heavy page-level components, but that was a smaller contributor to the total saving.

**Q: How did you ensure no regressions during a large-scale refactor?**

> Three things: (1) We didn't do a big-bang rewrite — we refactored one module at a time and kept the old and new components co-existing until the new one was stable. (2) For each refactored component I wrote or updated Jest + React Testing Library tests focused on behaviour, not implementation — so the tests passed regardless of whether the internals used class or hook syntax. (3) We used Playwright for end-to-end smoke tests on the prescription workflow as a whole, so even if a unit test missed something, the E2E would catch a broken flow before it reached production.

---

#### Micro-Frontend Architecture

- **What you did:** Implemented micro-frontends for prescription workflows.
- **Impact:** Reduced integration complexity; 25% faster development cycles.

**Q: Which micro-frontend framework/approach did you use?**

> We used Webpack Module Federation. Each workflow (prescriptions, billing, patient history) was a separate deployable app that exposed specific components or pages. The shell app loaded them at runtime via dynamic `import()`. This meant each team could deploy their module independently without coordinating a full app release. We considered single-spa but Module Federation felt more natural since we were already on Webpack and it integrated cleanly with our existing React setup.

**Q: How do micro-frontends communicate with each other?**

> We used a shared event bus — a lightweight pub/sub system attached to `window` — for cross-MFE communication. For example, when the patient selector MFE updated the active patient, it published a `patient:selected` event with the patient ID, and the prescription MFE subscribed to it and fetched the relevant data. For shared state that needed to persist (like the logged-in user and their permissions), we used a shared auth module that all MFEs imported — it exposed a singleton store backed by sessionStorage. We deliberately kept cross-MFE communication minimal to preserve isolation.

**Q: What are the trade-offs you saw in practice?**

> The benefits were real — teams could deploy independently and the blast radius of a bug was contained to one MFE. But the costs were also real: (1) Bundle duplication — if MFE A and MFE B both used React and Ant Design, you had to carefully configure shared dependencies in Module Federation to avoid shipping React twice. (2) Debugging across MFE boundaries was harder — stack traces didn't always cross the module boundary cleanly. (3) Consistent UX required discipline — if each team styled their own MFE independently, the app could look fragmented. We solved this with a shared design system package that all MFEs imported.

---

## 3. Projects

---

### KingRush – Tactical Game Engine (React Native, Zustand, Reanimated)

**Q: How do you handle network latency / dropped packets in a multiplayer game?**

> We used a client-side prediction model: when a player takes an action (moves a piece, attacks), the local client applies the action optimistically to its own state and renders it immediately, without waiting for the server to confirm. Simultaneously, the action is sent to the server. When the server's authoritative update arrives, if it matches the prediction, nothing changes. If it conflicts (say, another player acted first and the server rejected the action), we roll back the local state and apply the server's version. For dropped packets, we used WebSocket with automatic reconnection and replayed any unacknowledged actions after reconnect using a sequence number on each message.

**Q: What does your conflict-resolution strategy look like when two players act simultaneously?**

> The server is the single source of truth. All actions are timestamped on arrival at the server and processed in order. If two players submit conflicting actions in the same tick — for example, both try to move to the same tile — the server applies the one with the earlier arrival timestamp and rejects the other with an error message. The rejected client receives the authoritative state update, rolls back its optimistic render, and shows the player that their action failed. The game state never diverges from the server's version.

**Q: Why Reanimated over the default Animated API?**

> React Native's default Animated API runs on the JS thread, which means if the JS thread is busy (processing a game state update, for example), animations can drop frames and feel janky. Reanimated 2 runs animations on the UI thread using worklets — small JS functions that are serialised and executed natively — so animations are completely decoupled from JS thread load. In a game where JS is constantly processing WebSocket messages and state updates, this was essential for smooth piece movement and transition animations.

---

### Hyoxen Vehicle Platform (Next.js, React, Zustand, Material UI)

**Q: How did you decide which pages to SSR vs SSG vs CSR?**

> The vehicle listing and category pages were SSG — the data changed infrequently (new models are added rarely), and we wanted them to be fast and crawlable by search engines, so we pre-built them at deploy time with `getStaticProps`. Individual vehicle detail pages were also SSG with `getStaticPaths` for the same reason, with ISR (Incremental Static Regeneration) set to revalidate every hour to pick up spec updates. The analytics dashboard was CSR — it showed user-specific, real-time data that couldn't be pre-rendered, so it was a client-side only component behind an auth check.

**Q: Walk me through your memoization strategy — `useMemo`, `memo`, or something else?**

> I used all three, but selectively. `React.memo` was applied to leaf components in the vehicle listing — the individual VehicleCard components — because the parent list re-rendered on filter changes and without `memo` every card re-rendered even if its own props hadn't changed. `useMemo` was used in the parent to memoize the filtered and sorted vehicle array so the expensive filter computation didn't run on every render. `useCallback` was used for event handlers passed down to memoized children, since a new function reference on every parent render would break `memo`'s shallow comparison. I avoided over-memoizing — I only applied these where React Profiler actually showed unnecessary renders.

**Q: How did you structure analytics dashboards — polling, websockets, or server-sent events?**

> For this project the analytics were not truly real-time — they were aggregated metrics like "views per model" updated every few minutes. I used polling with SWR's `refreshInterval` option, hitting a lightweight API endpoint every 60 seconds. This kept the implementation simple and the server load predictable. If we needed sub-second updates (like a live stock ticker for vehicle availability), I would have used SSE — it's more efficient than WebSockets for server-to-client only data flows because it uses a plain HTTP connection and handles reconnection automatically.

---

## 4. Technical Concepts — Questions & Answers

### React & Frontend

**Q: Explain React's reconciliation algorithm / Fiber architecture.**

> React's reconciler is responsible for diffing the previous virtual DOM tree with the new one and computing the minimal set of DOM mutations. Fiber is the internal reimplementation of the reconciler (introduced in React 16) that made reconciliation interruptible. Before Fiber, reconciliation was synchronous and recursive — once started, it couldn't be paused, which could block the main thread for tens of milliseconds on large trees. Fiber represents each React element as a "fiber node" — a plain object with a reference to its parent, child, and sibling. Reconciliation is now done as a loop over this linked list rather than a call stack, which means React can pause work, yield control back to the browser (to handle user input or animations), and resume later. This is the foundation for features like Concurrent Mode, `useTransition`, and Suspense.

**Q: `useMemo` vs `useCallback` vs `React.memo` — when does each help?**

> `useMemo` memoizes the *result* of a computation — use it when you have an expensive calculation (filtering a large array, transforming data) that you don't want to repeat on every render. `useCallback` memoizes a *function reference* — use it when you're passing a callback to a child component wrapped in `React.memo`, because without it, a new function object is created on every render and breaks the memo's reference equality check. `React.memo` is a HOC that prevents a component from re-rendering if its props haven't changed (shallow comparison). The key insight: `React.memo` is only effective if the props being passed are stable references — which is why `useCallback` and `useMemo` are often used together with `memo`.

**Q: Why Zustand over Redux / Context?**

> Context: fine for low-frequency global state (theme, locale, auth) but causes over-rendering because all consumers re-render on any context value change. Redux: solves the over-rendering problem with selectors, but adds boilerplate (actions, reducers, action creators) and an extra mental model. Zustand gives you selector-based subscriptions (so components only re-render when their specific slice changes) with a fraction of the setup — you define a store as a single function, and consumers subscribe via a selector. It also plays nicely with middleware for devtools and persistence. For anything beyond simple global state, Zustand is my default choice.

**Q: How does code splitting with `React.lazy` + `Suspense` work?**

> `React.lazy` wraps a dynamic `import()` and returns a React component that loads only when it's first rendered. Webpack (or another bundler) sees the dynamic import and splits that module into a separate chunk. `Suspense` wraps the lazy component and shows a fallback UI (a spinner, skeleton) while the chunk is being fetched. This means users only download JS for features they actually navigate to, reducing initial bundle size and improving TTI. A good pattern is to split at the route level — each page is a lazy component — and potentially at the feature level for very heavy components like a rich text editor or a chart library.

**Q: What are Core Web Vitals and how do you improve LCP, FID, and CLS?**

> LCP (Largest Contentful Paint) — time until the largest above-the-fold element is rendered. Improve it by preloading critical assets, using SSR or SSG to send HTML faster, compressing images, and eliminating render-blocking scripts. FID (First Input Delay) / INP (Interaction to Next Paint) — time until the browser can respond to a user's first interaction. Improve it by moving heavy work off the main thread (web workers), code-splitting to reduce parse time, and breaking up long tasks. CLS (Cumulative Layout Shift) — unexpected layout shifts during load. Fix it by always specifying width and height on images and iframes so the browser reserves space, and avoiding inserting content above existing content after load.

---

### Node.js & Backend

**Q: Explain the Node.js event loop.**

> Node.js is single-threaded but handles concurrency through an event-driven, non-blocking I/O model. The event loop runs in phases: timers (executes `setTimeout`/`setInterval` callbacks), I/O callbacks (handles completed I/O operations), idle/prepare, poll (waits for new I/O events), check (`setImmediate` callbacks), and close callbacks. When you make an async call like reading a file or a DB query, Node delegates the actual work to the OS or a thread pool (libuv), registers a callback, and moves on to handle other events. When the operation completes, the callback is queued and executed in the appropriate event loop phase. This is why a single Node process can handle thousands of concurrent connections without spawning a thread per connection.

**Q: How does stream-based file processing work?**

> Instead of reading an entire file into memory, a stream reads it in chunks. Node's `fs.createReadStream` emits data events chunk by chunk, and you pipe those chunks through transform streams (compression, encryption, parsing) and into a writable destination (HTTP response, cloud storage upload stream). For our PDF pipeline, piping the Puppeteer output buffer directly to the Azure upload stream meant we never held the full PDF in memory — important when handling many concurrent large documents. The key benefit is constant memory usage regardless of file size.

**Q: REST vs GraphQL — practical trade-offs.**

> REST is simpler, widely understood, and HTTP caching works out of the box (GET requests cache at the CDN level). It becomes painful when clients need very different shapes of data from the same resource, or when loading a page requires waterfalling multiple round trips. GraphQL solves both: clients declare exactly what they need in one query, and the server resolves it. The cost is complexity — you need a schema, resolvers, and GraphQL-aware caching (since everything goes over POST). There's also the N+1 problem: a query for 100 users each with posts can trigger 101 DB queries unless you use DataLoader for batching. I use REST as the default and reach for GraphQL when over/under-fetching or request waterfalls are a real problem.

---

### Databases

**Q: How does ElasticSearch relevance scoring work?**

> ES uses BM25 (Best Match 25) as its default similarity algorithm. The score is influenced by three factors: term frequency (how often the search term appears in the document — more is better, but with diminishing returns), inverse document frequency (how rare the term is across all documents — rare terms score higher than common ones), and field length normalisation (a match in a short title scores higher than the same match in a long body, since it's more likely to be the key topic). You can boost specific fields — `title^3 body^1` — to make title matches rank higher. For our medical search, we boosted the study description and patient name fields heavily.

**Q: MongoDB aggregation pipeline — how does it work?**

> The aggregation pipeline is a series of stages, each transforming the documents flowing through it. Common stages: `$match` filters documents (put this early to reduce the working set), `$group` aggregates by a key (like SQL GROUP BY), `$project` shapes the output fields, `$lookup` does a left outer join with another collection, `$sort` and `$limit` for ordering and pagination, `$unwind` flattens arrays. Stages are executed in sequence on the server — no data leaves Mongo until the final stage. Good practice: `$match` and `$project` early to reduce document size before expensive stages like `$lookup` or `$sort`.

**Q: When do you use NoSQL vs SQL?**

> I use SQL (relational) when data has a well-defined schema, relationships between entities are central to the domain, and ACID transactions are required — financial records, user accounts, order management. I use NoSQL (document — Mongo, or search — ES) when the schema is flexible or evolving fast, when I need horizontal write scaling, or when the query patterns are document-centric rather than join-heavy. In practice, most systems use both: a relational DB for transactional core data and a document/search store for flexible or read-optimised access patterns. The mistake is using NoSQL to avoid thinking about data modelling — you still need to model your data, just differently.

---

### Real-Time / WebSockets

**Q: Explain the WebSocket lifecycle.**

> A WebSocket connection starts with an HTTP upgrade handshake: the client sends an HTTP GET with `Upgrade: websocket` and a `Sec-WebSocket-Key` header. The server responds with `101 Switching Protocols` and a derived `Sec-WebSocket-Accept` header. From that point, the TCP connection stays open and both sides can send frames at any time without request/response overhead. Frames can carry text, binary data, ping/pong (for keepalive), or a close frame. When either side wants to close, it sends a close frame; the other side acknowledges with its own close frame, then the TCP connection is torn down. This is fundamentally different from HTTP/1.1's per-request connection and much lower overhead than HTTP polling for frequent bidirectional messages.

**Q: How do you handle reconnection and message queuing?**

> On the client side, I use an exponential backoff reconnection loop — on disconnect, wait 1s, try again; if it fails, wait 2s, then 4s, capped at some maximum (say 30s) to avoid hammering the server. During the disconnected window, actions the user takes are queued locally. On reconnect, the client sends a `reconnect` message with the last received sequence number, and the server replays any messages the client missed. This requires the server to maintain a short message buffer per connection. For our locking system, reconnect also triggered the client to re-acquire any locks it held before the drop.

**Q: WebSockets vs Server-Sent Events — when do you use each?**

> SSE is one-way: server to client only, over a plain HTTP connection. It's simpler to set up, works through HTTP/2 multiplexing, and handles reconnection automatically in the browser via the `EventSource` API. Use SSE when you only need to push updates to the client — live dashboards, notification feeds, progress updates. WebSockets are bidirectional — use them when the client also needs to send data frequently, like in a chat app, collaborative editor, or multiplayer game. The overhead of a full WebSocket connection isn't worth it if you're only pushing server events.

---

## 5. Behavioural / Situational Questions

**Q: Tell me about a time you improved performance significantly.**

> At Ramsoft, the DICOM multi-viewport viewer had an LCP of around 6 seconds on load, which was causing radiologists to lose time waiting for studies to appear. I started by profiling with Chrome DevTools' Performance tab and React DevTools Profiler. The flame chart showed that our root React Context provider was triggering re-renders across the entire component tree — sometimes 200+ components — every time any piece of state changed. I migrated the state management from Context to Zustand, which allows components to subscribe to only the specific slice they need via selector functions. I also identified two secondary bottlenecks: unnecessary re-fetches of the same DICOM metadata, and some synchronous layout-blocking operations during viewport initialisation. After addressing all three, LCP dropped to 3 seconds — a 50% improvement — and the React Profiler showed the render count drop from 200+ to around 15–20 targeted updates per state change.

**Q: Describe a technically complex system you architected.**

> The real-time locking system at Ramsoft. The problem was that multiple radiologists could open the same study report simultaneously and overwrite each other's edits. I designed a WebSocket-based presence and locking system where, when a user opened a resource for editing, the server issued them an exclusive lock. The lock was held alive by heartbeat pings every 30 seconds; if pings stopped, a configurable auto-release timer would expire the lock and broadcast a release event to all connected clients. RBAC was layered on top — only users with an editor role could acquire a lock, and the server validated the role on every action within the locked session, not just at acquisition time. The hardest part was handling edge cases gracefully: browser crashes (solved by TTL-based auto-release), network partitions (solved by re-acquisition on reconnect with sequence numbers), and conflicting lock requests during the brief window between a lock expiry and a new acquisition (solved by a server-side atomic check-and-set using MongoDB's findOneAndUpdate with a conditional filter). The system ran stably across 500+ concurrent sessions.

**Q: Tell me about a time you worked with AI/ML in production.**

> At Ramsoft, radiologists were using a speech-to-text transcription service to dictate reports. The raw output was messy — wrong medical terms, missing punctuation, incorrect anatomy names. I built a post-processing pipeline that took the raw transcript and refined it using the OpenAI API. The key challenges were prompt engineering (the prompt had to instruct the model not to add or invent clinical details, only clean up grammar and terminology — a critical safety constraint in a medical context), reliability (I added a Bull job queue with exponential backoff retry and a fallback to raw output if the API failed), and validation (a lightweight entity check compared key terms in the output against source metadata and flagged mismatches for human review). We measured improvement via Word Error Rate on a benchmark set and radiologist scoring sessions. The result was a 40% reduction in the time radiologists spent editing transcripts.

**Q: How do you approach a large legacy codebase refactor?**

> I follow three principles: don't do a big-bang rewrite, test behaviour not implementation, and measure before and after. At Phablecare, I refactored a large set of class components to hooks and introduced atomic design architecture. I did it module by module — the prescription form first, then the patient sidebar, and so on. For each module, I wrote React Testing Library tests focused on what the component did (renders the correct fields, submits the correct data) rather than how it was structured internally. That way the tests were valid for both the old and new implementation and caught regressions automatically. I also tracked bundle size in CI using a webpack bundle analyser so I could see the impact of each module change and catch any accidental size increases early.

**Q: Tell me about a time you reduced complexity for your team.**

> At Phablecare, the prescription workflow was a monolithic React app where every team's features were entangled in the same codebase. Deploying a change to billing required a full regression of the prescription flow, and vice versa. I proposed and implemented Module Federation-based micro-frontends, splitting the app into independently deployable modules. The immediate effect was that each team could ship on their own schedule without a coordinating release. The 25% faster development cycle metric came from comparing our sprint velocity before and after — we measured by the number of features shipped per sprint across both teams over two quarters.

**Q: What's your approach to code quality?**

> Code quality has three layers for me: (1) Prevention — TypeScript for type safety, ESLint for code style, PR reviews for design discussions. (2) Testing — I write unit tests with Jest for pure logic, component tests with React Testing Library for UI behaviour, and E2E tests with Playwright/Cypress for critical user flows. I focus tests on behaviour, not implementation, so they survive refactors. (3) Observability — good logs, error tracking (Datadog at Ramsoft), and feature flags (LaunchDarkly) so I can release incrementally and roll back quickly if something goes wrong. I also care a lot about meaningful PR descriptions — they're the documentation for why a change was made, which matters six months later.

---

## 6. Questions to Ask Interviewers

- What does the team's tech stack look like, and where do you see it evolving?
- How do you handle incidents or production issues — what does an on-call rotation look like?
- How does the team balance feature delivery with technical debt?
- What would success look like in the first 3 months for this role?

---

## 7. Key Numbers to Remember

| Metric | Context |
|---|---|
| 30–40% | API call reduction at Ramsoft |
| 6s → 3s | LCP improvement on DICOM viewer |
| 500+ | Active concurrent sessions in locking system |
| 100+ | Workflows improved by AI text pipeline |
| 40% | Content generation speed-up via AI pipeline |
| 2 min → <10 sec | Prescription data entry at Phablecare |
| 15% | Bundle size reduction after refactor |
| 25% | Faster dev cycles with micro-frontends |

---

*Good luck, Yash!*
