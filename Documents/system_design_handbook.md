# System Design & Architecture
### A Deep-Dive Handbook for Engineers

> Covers architectural patterns, system design, full-stack thinking, rendering strategies, and real-world concepts explained from first principles. Written for personal learning and Medium publication.

---

## Table of Contents

1. [Architecture Patterns](#1-architecture-patterns)
2. [Key Concepts Explained](#2-key-concepts-explained)
3. [Real-Time Communication: SSE vs WebSocket](#3-real-time-communication-sse-vs-websocket)
4. [System Design — How to Approach Any Problem](#4-system-design--how-to-approach-any-problem)
5. [Full-Stack Thinking](#5-full-stack-thinking)
6. [The Eight Pillars of Production-Ready Applications](#6-the-eight-pillars-of-production-ready-applications)
7. [Frontend Rendering Strategies](#7-frontend-rendering-strategies)
8. [Quick Reference](#quick-reference)

---

## 1. Architecture Patterns

> **The most important thing to understand:** Architecture patterns are not alternatives to each other. They operate at different levels and solve different problems. A real production system uses several simultaneously.

---

### 1.1 The Two Structural Choices: Monolith vs Microservices

These answer one question: **how do I organise and deploy my code?**

| Option | Pros | Cons / Tradeoffs |
|---|---|---|
| **Monolith** | Simple to develop and deploy. Easy debugging. Low latency internal calls. Great for small teams. | Hard to scale individual components. Deploy-all-or-nothing. Tech lock-in. Becomes unwieldy at scale. |
| **Microservices** | Independent scaling. Fault isolation. Team autonomy. Polyglot technology. | Network overhead. Distributed transactions are hard. Ops complexity. More infrastructure cost. |

> 💡 **Key insight:** Start with a monolith. Extract services when a specific component needs independent scaling or when team boundaries demand it. Microservices are an organisational and scaling solution, not a default architecture.

---

### 1.2 Communication Patterns: How Services Talk to Each Other

Once you've decided your structure, you need to decide how components communicate. This is a **completely separate decision**.

---

#### Event-driven / Async

Instead of Service A calling Service B directly and waiting, A publishes an event to a message queue (Kafka, RabbitMQ). B, C, and D all subscribe independently and react in their own time.

**Restaurant analogy:** The waiter pins a ticket to the kitchen rail and walks away. The kitchen, billing, and dessert station all work from the same ticket independently. Nobody waits for anyone else.

| Option | Pros | Cons / Tradeoffs |
|---|---|---|
| **Event-driven** | Loose coupling. Absorbs traffic spikes. Fan-out to multiple consumers from one event. Services are independent. | Eventual consistency. Harder to debug. Requires idempotency. At-least-once delivery needs careful handling. |

> ⚠️ **Important:** Event-driven is about **HOW services communicate**. It works inside a monolith OR between microservices. It is not a replacement for either.

---

#### CQRS + Event Sourcing

Two separate ideas usually used together. They are about **how data is written and read** inside a service.

**CQRS (Command Query Responsibility Segregation):** Maintain two separate models. One for writing data (commands: place order, cancel order). One for reading data (queries: show order history, show dashboard). Each uses a database optimised for its job.

**Event Sourcing:** Instead of storing the current state of something, store the full history of events that led to that state. An order record does not say `status: DELIVERED`. It says: PLACED at 12:01, ACCEPTED at 12:02, PREPARED at 12:15, DELIVERED at 12:28. Current state is derived by replaying those events.

| Option | Pros | Cons / Tradeoffs |
|---|---|---|
| **CQRS + Event Sourcing** | Full audit trail. Time travel (replay history). Separate read/write scaling. Rebuild any read model by replaying events. | Significant complexity. Eventual consistency. Overkill for simple domains. Steep learning curve. |

> ⚠️ **Important:** CQRS + Event Sourcing is about **HOW DATA IS HANDLED** inside a service. It is not a replacement for monolith or microservices.

---

#### BFF (Backend for Frontend)

Completely different category. BFF is not about how services communicate or how data flows. It is about **how the API is shaped for different clients**.

Imagine three clients: a kiosk, a mobile app, and a staff dashboard. Each needs totally different data. A single generic API means everyone gets too much or too little. BFF says: build a thin dedicated API layer per client type.

| Option | Pros | Cons / Tradeoffs |
|---|---|---|
| **BFF** | Optimised API per client. Reduces over-fetching and under-fetching. Clear ownership per client team. | Extra service to maintain. Risk of logic duplication across BFFs. More deployment surface area. |

> ⚠️ **Important:** BFF is about **HOW THE API IS SHAPED** for different consumers. It sits in front of whatever architecture you already have.

---

### 1.3 How All Five Patterns Relate

| Pattern | What it solves | Level |
|---|---|---|
| Monolith | How to structure and deploy code | Application structure |
| Microservices | How to structure and deploy code | Application structure |
| Event-driven | How services communicate | Communication layer |
| CQRS + Event Sourcing | How data is written and read | Data layer |
| BFF | How the API is shaped per client | API layer |

> ✅ **The real world:** A production system at scale typically uses microservices (structure) + event-driven communication + CQRS on financial services + BFF for client APIs — all simultaneously. They complement each other.

---

### 1.4 Architecture Decision Triggers

- **High write volume →** Message queue (Kafka/RabbitMQ) + async processing
- **High read volume →** Cache (Redis) + read replicas
- **Financial transactions →** Exactly-once: idempotency keys + outbox pattern
- **Real-time client updates →** WebSocket or SSE (see Section 3)
- **Multiple client types →** BFF layer
- **Full audit trail needed →** Event Sourcing
- **Independent team scaling →** Microservices with clear API contracts
- **Small team / early stage →** Modular monolith first, extract later

---

## 2. Key Concepts Explained

### 2.1 Idempotence

**Definition:** Doing something multiple times produces the same result as doing it once.

**Elevator button analogy:** Press it once, elevator is called. Press it five more times nervously. Elevator is still called once. The extra presses have no additional effect. That button is idempotent.

**Non-idempotent example:** Adding money to a bank account. Run "add ₹500" three times due to a network retry and you have added ₹1500 total. Each execution had a new effect. This is a serious bug.

#### Why it matters in distributed systems

Networks are unreliable. A client sends a payment request. No response comes back. Was it received? The client retries. Without idempotence the user gets charged twice.

#### How idempotency keys work

```
First request:
POST /payment
idempotency-key: "abc123"
amount: 299

Payment processor: never seen 'abc123' → process → store key → return success

Second request (retry):
POST /payment
idempotency-key: "abc123"   ← same key
amount: 299

Payment processor: already seen 'abc123' → return same success → do NOT charge again
```

#### HTTP methods and idempotence

| Method | Idempotent? | Why |
|---|---|---|
| GET | ✅ Yes | Just reading, no side effects |
| PUT | ✅ Yes | Replaces resource with same value every time |
| DELETE | ✅ Yes | Deleting something already deleted = still deleted |
| POST | ❌ No | Creates a new resource each time |
| PATCH | ⚠️ Not always | Depends on implementation |

---

### 2.2 SHA256 and Hashing

SHA256 is a hashing algorithm. It takes any input and converts it into a fixed 64-character string called a hash or digest.

```
Input:  "order_123_299.50_1200"
Output: "a3f8c2d9e1b4..."  (always exactly 64 characters)

Change one character:
Input:  "order_123_299.50_1201"
Output: "7d2e9f1a4c83..."  (completely different hash)
```

#### Three properties that make it useful

- **One-way:** You cannot reverse it. Given the hash, you cannot figure out the original input.
- **Deterministic:** Same input always produces the exact same output. Always.
- **Unique:** Two different inputs will practically never produce the same hash.

**Fingerprint analogy:** SHA256 is like a fingerprint machine. No matter how many times you scan the same finger, you get the same fingerprint. But you cannot reconstruct the finger from the fingerprint alone.

**In practice:** `SHA256(order_id + amount + timestamp)` generates a deterministic idempotency key. Same order always produces the same key. Safe to retry as many times as needed.

---

### 2.3 OLTP vs OLAP — Why You Must Separate Them

#### OLTP (Online Transaction Processing)

Your **live operational database**. Handles real-time requests. Every order placed, profile updated, or payment made hits the OLTP database. Optimised for fast individual reads and writes, many concurrent users, ACID transactions, and thousands of small queries per second.

#### OLAP (Online Analytical Processing)

Your **analytics database**. Optimised for heavy queries across huge amounts of historical data. Things like: what were the top selling items last quarter? Which locations have the highest average order value on weekends? These queries scan millions of rows and do complex aggregations.

#### Why you must NEVER run analytics on your OLTP database

Imagine this query on your live orders database:

```sql
SELECT restaurant_id, AVG(order_value), COUNT(*)
FROM orders
WHERE created_at > '2025-01-01'
GROUP BY restaurant_id
```

This scans potentially millions of rows across a full year. While it runs, it locks resources on the database. Every user trying to place an order at that moment slows down. At peak hour this causes timeouts and failures. **One analytics query just broke your live system.**

#### The three main OLAP tools

| Tool | Best for | Key strength |
|---|---|---|
| **BigQuery** | Cloud-native analytics at massive scale | Fully managed by Google, serverless, pay per query, handles petabytes |
| **Redshift** | AWS-native data warehousing | Deep AWS integration, good for structured data, provisioned clusters |
| **ClickHouse** | Real-time analytics on large event datasets | Extremely fast aggregations, open source, great for time-series data |

#### How data flows from OLTP to OLAP

```
Live Orders DB (PostgreSQL)
        ↓
   Kafka events (continuous stream)
        ↓
   Data pipeline
        ↓
   OLAP Database (ClickHouse / BigQuery)
        ↓
   Analytics dashboards
```

> 💡 **Rule:** Any reporting or analytics query goes to the OLAP database. The live operational database never gets touched by analytics traffic.

---

### 2.4 Online Inference and GPU Infrastructure

**Online inference** means running an AI/ML model in real time, at the moment a user makes a request.

**Contrast with batch/pre-compute:** The model runs overnight for all known users, stores results in a database, and at request time just looks up the pre-calculated answer. No model runs during the live request.

#### Why online inference needs GPU infrastructure

ML recommendation models involve massive matrix multiplication — multiplying huge grids of numbers together millions of times per prediction.

- **CPU:** Processes operations sequentially, a few at a time. Fast for general tasks, slow for massive parallelism.
- **GPU:** Has thousands of small cores that do thousands of matrix multiplications simultaneously in parallel. What takes a CPU 500ms, a GPU does in 20ms.

GPU servers cost 5–20x more than regular servers. This is why a **hybrid approach** is usually optimal:

```
Overnight (GPU batch job):
  Run full recommendation model for all users
  Store top-20 candidate results per user in cache

At request time (CPU, ~20ms):
  Fetch pre-computed candidates from cache
  Apply lightweight reranker using session signals
  Return personalised result instantly
```

> 💡 **The principle:** Pre-compute the heavy lifting on a schedule. Use lightweight real-time reranking at request time. Only fall back to full online inference for brand-new users with no history.

---

### 2.5 Circuit Breaker Pattern

**The problem:** Service A calls Service B. Service B is having issues and every call times out after 30 seconds. Without protection, 100 users are all stuck waiting 30 seconds. Threads pile up. Memory fills. Service A crashes — brought down by a downstream failure. This is called a **cascading failure**.

**The solution:** A circuit breaker monitors calls to a downstream service and trips open when failures cross a threshold.

#### Three states

| State | Behaviour | Transition |
|---|---|---|
| **CLOSED** | Normal operation. All calls go through. | Opens after N consecutive failures |
| **OPEN** | All calls immediately return a fallback. No calls made to downstream service. | Moves to HALF-OPEN after timeout (e.g. 30 seconds) |
| **HALF-OPEN** | Let one test request through. | Success → CLOSED. Failure → OPEN again. |

#### The fallback strategy — you must plan this

- **Graceful degradation:** Accept the request, flag for manual processing.
- **Cached response:** Return last known good response if data is not critically time-sensitive.
- **Queue for retry:** Store the request and process it when service recovers.
- **Informative error:** Tell the user clearly what happened and what to do next.

> 💡 **Libraries:** Use Resilience4j (Java), Hystrix (Java, now maintenance mode), or Polly (.NET) rather than building circuit breakers from scratch.

---

## 3. Real-Time Communication: SSE vs WebSocket

### 3.1 The Core Difference

| | SSE | WebSocket |
|---|---|---|
| **Direction** | Server → Client only (one-way) | Both directions (bi-directional) |
| **Protocol** | HTTP (works through all proxies) | Upgraded HTTP (sometimes blocked by firewalls) |
| **Complexity** | Simple, native browser support | More complex, reconnection logic needed |
| **Use case** | Server pushing updates to client | Client and server both sending data |
| **Connection cost** | Lower (simpler protocol) | Higher (stateful persistent connection) |

---

### 3.2 The Decision Rule

> **One question to ask:** Does the CLIENT need to SEND data through the live connection?
> - **No →** SSE
> - **Yes →** WebSocket

| Use SSE | Use WebSocket |
|---|---|
| Order status updates to a customer | Live chat between two users |
| Stock price / live score feed | Multiplayer game |
| Notification push to dashboard | Collaborative document editing (Google Docs style) |
| Document lock/unlock status | Customer support chat |

---

### 3.3 Real-World Decision: Document Locking

**Scenario:** Person 1 opens a document. Person 2 opens the same document and should see it as locked. When Person 1 leaves, Person 2's screen should automatically unlock.

**Answer:** SSE is sufficient. Person 2 is only ever **receiving** information from the server. They never need to send anything back through the live connection.

```
Person 1 opens doc →
  POST /document/123/lock → server marks document locked

Person 2 opens doc →
  SSE connection to /document/123/status
  Server immediately pushes: { status: 'locked', locked_by: 'user_1' }
  Person 2 sees locked screen

Person 1 closes doc →
  Server detects disconnect → marks unlocked
  Server pushes to Person 2's SSE: { status: 'unlocked' }
  Person 2's screen unlocks automatically
```

#### Exception: reuse existing WebSocket if already open

If the application already has a WebSocket connection open for another feature, do **not** open a new SSE connection on top of it. Multiplex the lock/unlock events through the existing WebSocket as a new message type.

```json
{ "type": "document_status", "document_id": "123", "status": "locked" }
{ "type": "document_status", "document_id": "123", "status": "unlocked" }
```

> 💡 **General principle:** Reuse existing infrastructure before adding new infrastructure. Two persistent connections per client where one would do is waste.

---

### 3.4 WebSocket at Scale

```
Client A ↔ WebSocket Server (holds connections only)
                    ↕
            Message broker (Kafka / Redis Pub-Sub)
                    ↕
Client B ↔ WebSocket Server (holds connections only)
                    ↕
            Business logic servers (stateless, scalable)
```

The WebSocket tier is stateful but thin — it only holds connections and routes messages. Business logic servers stay stateless and scale freely. This is how Slack and Discord handle millions of concurrent connections.

---

### 3.5 gRPC — The Internal Service Protocol

**gRPC** is a communication framework for services talking to each other internally. RPC stands for Remote Procedure Call — one service calls a function on another as if it were a local call, but it happens over the network.

#### How it works

- **Protobuf (Protocol Buffers):** Binary format instead of JSON. Define your data structure in a `.proto` file. Both services generate code from it automatically. Same contract, zero ambiguity.
- **Auto-generated code:** From the `.proto` file, gRPC generates client and server code in any language.
- **HTTP/2:** Enables multiplexing, streaming, and header compression.

#### Why faster than REST

| | REST + JSON | gRPC + Protobuf |
|---|---|---|
| Data format | Text (human readable) | Binary (compact) |
| Payload size | Larger | 3–10x smaller |
| Parsing speed | Slower | Faster |
| Protocol | HTTP/1.1 | HTTP/2 |
| Code generation | Manual | Automatic from contract |
| Browser support | Full | Poor (needs proxy) |

#### Four communication patterns

| Pattern | How it works | Use case |
|---|---|---|
| **Unary** | One request, one response | Place an order, authenticate a user |
| **Server streaming** | One request, stream of responses | Live order updates to kitchen display |
| **Client streaming** | Stream of requests, one response | Uploading bulk records |
| **Bidirectional streaming** | Both sides stream simultaneously | Live collaboration, multiplayer games |

#### Where to use gRPC

```
Browser/Client → REST or GraphQL → API Gateway
                                        ↓
                              gRPC → Order Service
                              gRPC → Payment Service
                              gRPC → Kitchen Service
```

> 💡 **Rule:** gRPC for internal service-to-service communication. REST or GraphQL for external clients. The API Gateway translates between the two worlds.

---

## 4. System Design — How to Approach Any Problem

### 4.1 The Independent Thinker Mindset

The difference between a mid-level and senior engineer in a system design interview is not knowledge — it is **who drives the conversation**. Senior engineers surface problems before being asked.

> **Before the interviewer asks — raise it yourself:**
> What are my assumptions? What are the failure modes? What would change my recommendation? What would I do differently at 10x scale?

---

### 4.2 The System Design Template

| Step | What to do | Time |
|---|---|---|
| **1. Clarify** | Restate the problem. Ask: scale? latency budget? consistency needs? users? read/write ratio? | 2–3 min |
| **2. Estimate** | Back-of-envelope: requests/sec, storage/day, bandwidth. Say numbers out loud. | 2–3 min |
| **3. Sketch HLD** | Draw core components: clients, load balancer, API layer, services, DB, cache, queue. Name the arrows. | 5–8 min |
| **4. Deep dive** | Pick the hardest component. Explain it in detail. Let interviewer redirect. | 8–10 min |
| **5. Edge cases** | Raise failures yourself: What if the queue backs up? What if the DB goes down? What if payment times out? | 3–5 min |

---

### 4.3 Failure Modes to Always Raise

#### Queue lag
Messages pile up faster than consumers can process them.

**Fix:** Monitor consumer lag with alerting. Scale consumer instances horizontally when lag crosses threshold.

---

#### DB write spike
Peak traffic causes thousands of simultaneous DB connections. Most databases collapse under this.

**Fix:** Connection pooler (PgBouncer) maintains a small managed pool. Read replicas for non-critical reads.

---

#### Offline clients
Network drops. Without a plan, all user actions fail.

**Fix:** Store actions locally (SQLite on device). Show confirmation immediately. Sync when connectivity restores.

---

#### Partial failure — The Outbox Pattern

```
Naive approach (broken):
  Transaction: write order to DB ✓
  Then: publish event to Kafka ✗ (Kafka down)
  Result: order exists, downstream never notified

Outbox Pattern (correct):
  Transaction:
    → Write order to orders table  ✓
    → Write event to outbox table  ✓
    (both succeed or both fail atomically)

  Separate outbox processor:
    Reads from outbox table → publishes to Kafka → marks as processed
    Retries until successful. Event is never lost.
```

---

### 4.4 Scalability Patterns Quick Reference

| Option | Pros | Cons / Tradeoffs |
|---|---|---|
| **Horizontal scaling** | Add more instances behind a load balancer. Works for stateless services. | Need shared state (Redis) for stateful flows. Session affinity complexity. |
| **Caching (Redis)** | Massive read latency reduction. Absorbs read spikes. Reduces DB load. | Cache invalidation is hard. Stale data risk. Adds infrastructure. |
| **DB sharding** | Partition data by key across DB nodes. Independent scaling per shard. | Cross-shard queries expensive. Resharding is painful. |
| **Read replicas** | Offload reads from primary. Good for reporting and analytics reads. | Replication lag. Eventual consistency on reads. |
| **CDN** | Cache static assets globally. Reduces server load. Near-zero latency for users. | Purging is slow. Not suited for dynamic or personalised content. |
| **Circuit breaker** | Stop calling a failing service. Return fallback fast. Prevents cascading failures. | Need fallback strategy. Adds complexity to service client code. |

---

## 5. Full-Stack Thinking

Full-stack awareness means every decision you make at one layer has consequences at every other layer.

---

### 5.1 The End-to-End Chain

| Layer | Key questions to ask yourself |
|---|---|
| **Frontend / UI** | How often does this data change? Does it need real-time updates? What is the render cost? What happens if the API is slow? |
| **API contract** | What shape does the client need? Who else consumes this API? How do we version it? What is a breaking change? |
| **Backend service** | What is the latency budget? What can fail? Is this idempotent? What is the fallback? |
| **Database** | What is the read/write ratio? Do we need ACID? What indexes are needed? What is the query plan? |
| **Cache** | What is the TTL? What invalidates this? What is the fallback on cache miss? |
| **Infra / ops** | How do we deploy this? How do we monitor it? What is the rollback plan? |

---

### 5.2 API Versioning

| Non-breaking ✅ (safe to ship) | Breaking ❌ (needs new version) |
|---|---|
| Adding new optional fields to response | Removing or renaming existing fields |
| Adding new optional request parameters | Changing field types (string → int) |
| Adding new endpoints | Changing authentication method |
| Returning additional data in existing fields | Changing error response format |

---

### 5.3 Observability: The Three Pillars

| Pillar | What it gives you | Tool examples |
|---|---|---|
| **Logs** | What happened and when. Use structured JSON logs. Include a correlation ID on every log line. | ELK Stack, Datadog, CloudWatch |
| **Metrics** | How the system behaves over time. Track: requests/sec, p95 latency, queue depth, error rate, cache hit rate. | Prometheus + Grafana, Datadog |
| **Traces** | Follow a single request across all services. Critical for finding which service added latency. | Jaeger, Zipkin, AWS X-Ray, Datadog APM |

---

### 5.4 Database Performance: What Frontend Engineers Often Miss

- **N+1 queries:** Loading a list of records then fetching each record's related data in a loop = N+1 queries. Fix with JOIN or batching (DataLoader pattern).
- **Missing indexes:** `SELECT * FROM orders WHERE user_id = ?` runs a full table scan without an index on `user_id`. Always index foreign keys and common filter columns.
- **Pagination:** OFFSET-based pagination degrades at high offsets. Use cursor-based pagination (`WHERE id > last_seen_id LIMIT 20`) for large datasets.
- **Connection pooling:** Each server thread should not hold a DB connection open permanently. PgBouncer multiplexes connections efficiently.
- **Optimistic updates:** Update the UI immediately before server confirms. Requires rich error responses for rollback and idempotency to handle double submissions safely.

---

## 6. The Eight Pillars of Production-Ready Applications

Every production-grade application should be evaluated against these eight pillars. Missing even one creates a category of risk.

---

### 6.1 Scalability ✅

The ability of your system to handle growing load — more users, more data, more requests — without breaking or slowing down significantly.

**Three dimensions of scalability:**
- **Traffic scalability** — can you handle 10x more requests? (horizontal scaling, load balancing, caching, queues)
- **Data scalability** — can your DB handle 10x more rows? (sharding, partitioning, archiving)
- **Team scalability** — can 50 engineers work without stepping on each other? (microservices, clear API contracts, independent deployments)

**Key insight:** Scalability is not just a technical problem. A monolith that is technically scalable can still fail team scalability when 20 engineers all merge into the same codebase daily.

---

### 6.2 Accessibility ✅

The ability of your application to be used by **everyone** — including people with disabilities, people on slow networks, and people using assistive technologies like screen readers.

**Key dimensions:**
- **Visual** — sufficient colour contrast, text that scales, not relying on colour alone to convey meaning
- **Motor** — full keyboard navigability, no interactions that require precise mouse control
- **Cognitive** — clear language, predictable navigation, no information overload
- **Assistive technology** — proper semantic HTML, ARIA labels, meaningful alt text on images
- **Network** — works on slow 3G, graceful degradation when assets fail to load

> ⚠️ **Why it matters beyond ethics:** In many countries accessibility is a legal requirement (ADA in the US, EN 301 549 in Europe). Inaccessible apps are a legal and business risk.

---

### 6.3 Extensibility ✅

The ability to add new features or change existing behaviour **without rewriting the whole system**.

**Core principles:**
- **Open/Closed Principle** — open for extension, closed for modification. Add new behaviour by adding new code, not changing existing code.
- **Plugin/Strategy patterns** — design components so new implementations can be plugged in without touching the core.
- **Loose coupling** — services and modules that know as little as possible about each other are easier to extend independently.
- **Stable API contracts** — a versioned API allows the system to evolve underneath without breaking consumers.

**Real world test:** If adding a new payment provider requires rewriting your entire payment flow, your system is not extensible. If it means implementing a `PaymentProvider` interface and registering it — that is extensible design.

---

### 6.4 Observability ✅

The ability to understand what is happening inside your system from the outside — by looking at the data it produces.

**The three pillars:** Logs, Metrics, Traces (covered in Section 5.3)

**Additional dimensions:**
- **Alerting** — metrics without alerts are useless at 3am. Set thresholds, page the right people.
- **Dashboards** — separate dashboards for business metrics (orders/sec) and technical metrics (p99 latency, error rate).
- **Error tracking** — tools like Sentry capture exceptions with full context (stack trace, user, request payload).
- **Structured logging** — logs as JSON, not plain text. Queryable, filterable, parseable at scale.

**The real test of observability:** Can you answer questions you didn't think to ask when you built the system? Not just "can I see the metrics I planned for" but "can I diagnose a problem I've never seen before."

> 💡 **Observability enables Scalability.** You cannot scale confidently what you cannot measure. You need to see where the bottleneck is before you can fix it.

---

### 6.5 Reliability

The system does what it is supposed to do, consistently, even when things go wrong.

**Key concepts:**
- **SLA (Service Level Agreement)** — the uptime commitment. 99.9% uptime = ~8.7 hours downtime per year. 99.99% = ~52 minutes per year.
- **Fault tolerance** — the system continues operating when components fail, not gracefully degrading but actually absorbing the failure.
- **Graceful degradation** — when a feature fails, the rest of the system keeps working. A broken recommendation engine should not take down the checkout flow.
- **Chaos engineering** — deliberately introducing failures in production to verify the system handles them. Netflix's Chaos Monkey is the famous example.

**All your circuit breakers, outbox patterns, and retry logic are fundamentally reliability patterns.**

---

### 6.6 Maintainability

How easy is it for a new engineer to understand, debug, and change the code six months from now?

**Key dimensions:**
- **Code readability** — self-documenting code, meaningful names, consistent patterns
- **Documentation** — architectural decision records (ADRs), API docs, runbooks for common incidents
- **Test coverage** — unit tests, integration tests, end-to-end tests. Code that cannot be tested is code that cannot be safely changed.
- **Technical debt management** — actively tracking and paying down shortcuts taken under pressure
- **Onboarding speed** — how long before a new engineer ships their first change safely?

**Relationship to extensibility:** Maintainability is about the day-to-day experience of working with the codebase. Extensibility is about the architectural properties that make change possible. You need both.

---

### 6.7 Security

Authentication, authorisation, data encryption, input validation, and protection against common attacks.

**Key areas:**
- **Authentication** — verifying who the user is (passwords, OAuth, JWT, MFA)
- **Authorisation** — verifying what the user is allowed to do (RBAC, ABAC, permission systems)
- **Data encryption** — at rest (encrypted DB, encrypted storage) and in transit (TLS/HTTPS everywhere)
- **Input validation** — never trust client input. Validate and sanitise everything server-side. SQL injection and XSS are still the most common attack vectors.
- **Secrets management** — never hardcode API keys or passwords. Use environment variables, vaults (HashiCorp Vault, AWS Secrets Manager).
- **Dependency security** — regularly audit and update third-party packages. One compromised dependency can expose your entire system.

> ⚠️ **Security is not a feature you add at the end.** It must be designed in from the start. The cost of retrofitting security is 10x the cost of building it in.

---

### 6.8 Performance

How fast does the system respond under **normal load**? Distinct from scalability.

- A system can be **performant but not scalable** — fast for 100 users but crashes at 10,000.
- A system can be **scalable but not performant** — handles 10,000 users but is slow for all of them.

**Key metrics:**
- **Latency** — how long a single request takes. Usually measured as p50, p95, p99 (median, 95th percentile, 99th percentile). Optimise p99, not just averages.
- **Throughput** — how many requests the system can handle per second.
- **Time to First Byte (TTFB)** — how long before the browser starts receiving any response.

**Common performance wins:**
- Database query optimisation (indexes, query plans, avoiding N+1)
- Caching at multiple levels (DB query cache, application cache, CDN)
- Lazy loading — only load what the user needs right now
- Compression — gzip/brotli for API responses and static assets
- Connection pooling — avoid the overhead of establishing new connections per request

---

### How the Eight Pillars Connect

| Pillar | Breaks without | Enabled by |
|---|---|---|
| Scalability | System collapses under load | Horizontal scaling, caching, queues, sharding |
| Accessibility | Real users cannot use the product | Semantic HTML, ARIA, inclusive design, testing |
| Extensibility | Every new feature is a rewrite | Clean architecture, loose coupling, contracts |
| Observability | Flying blind in production | Logs, metrics, traces, alerting, dashboards |
| Reliability | Users cannot depend on the system | Circuit breakers, retries, outbox pattern, chaos engineering |
| Maintainability | Codebase becomes unmaintainable | Good code, tests, docs, ADRs, low technical debt |
| Security | Data breaches, legal liability | Auth, encryption, validation, secrets management |
| Performance | Users leave for faster competitors | Query optimisation, caching, compression, lazy loading |

---

## 7. Frontend Rendering Strategies

### 7.1 The Baseline Problem: CSR (Client Side Rendering)

Before understanding SSG, SSR, and ISR, you need to understand what they are all reacting against — **CSR**, where React or Vue runs entirely in the browser.

```
Server sends:
<html>
  <body>
    <div id="root"></div>   ← empty
    <script src="app.js"/>  ← entire app bundle
  </body>
</html>

Browser:
  Downloads JS bundle (could be 500KB–2MB)
  Executes JS
  Fetches data from API
  Renders content
  Page becomes interactive
```

User sees a blank screen or loading spinner for 1–3 seconds. This is the problem SSG, SSR, and ISR all solve.

---

### 7.2 Two Metrics You Must Know

**FCP (First Contentful Paint)** — when the user first sees anything meaningful on screen.

**TTI (Time to Interactive)** — when the user can actually click, scroll, and interact meaningfully.

The gap between FCP and TTI is where user frustration lives. All three rendering strategies aim to bring FCP earlier. The hydration process closes the gap to TTI.

---

### 7.3 SSG — Static Site Generation

The HTML is generated **at build time** — before any user requests it. The server pre-builds every page and serves them as static files from a CDN.

```
Build time:
  Code + Data → Generator → HTML files stored on CDN

User requests page:
  User → CDN → returns pre-built HTML instantly (~50ms)
  No server involved at runtime at all
```

**Best for:** Content that rarely changes — blogs, documentation, marketing pages, landing pages.

| | SSG |
|---|---|
| **When HTML is built** | Build time |
| **Data freshness** | Stale until rebuild and redeploy |
| **Speed** | Fastest (CDN edge) |
| **Server load at runtime** | None |
| **Personalisation** | ❌ Not possible |
| **SEO** | ✅ Excellent |

#### User interaction with SSG

```
User clicks link
        ↓
CDN returns pre-built HTML instantly  ← FCP is very early
        ↓
Browser paints full page content
        ↓
Browser downloads and executes JS bundle
        ↓
Hydration — React attaches event listeners to existing HTML
        ↓
Page becomes interactive  ← TTI
```

**What the user experiences:** Content appears almost instantly. But for a brief moment — the **hydration gap** — the page looks interactive but is not. Buttons don't respond yet. This gap is usually 200ms–1 second depending on JS bundle size. Most users don't notice on fast connections. On slow 3G it can be very noticeable.

---

### 7.4 SSR — Server Side Rendering

The HTML is generated **at request time** — on the server, fresh for every single user request.

```
User requests page:
  User → Server → fetches data → builds HTML → sends to browser
  Happens fresh every single request
```

**Best for:** Pages that need real-time or personalised data — dashboards, user profiles, live feeds.

| | SSR |
|---|---|
| **When HTML is built** | Every request |
| **Data freshness** | Always fresh |
| **Speed** | Slower (server must do work first) |
| **Server load at runtime** | High — scales with traffic |
| **Personalisation** | ✅ Yes — can use session, cookies, user data |
| **SEO** | ✅ Excellent |

#### User interaction with SSR

```
User clicks link
        ↓
Request hits server  ← wait begins here
        ↓
Server fetches data from DB
        ↓
Server renders full HTML with data  ← takes 100–500ms typically
        ↓
Browser receives and paints full page content  ← FCP (later than SSG)
        ↓
Browser downloads and executes JS bundle
        ↓
Hydration — React attaches event listeners
        ↓
Page becomes interactive  ← TTI
```

**What the user experiences:** A noticeable wait before anything appears — the server has to do work first. Once content appears it looks complete, but like SSG there is still a hydration gap before interactions work. Every navigation in a traditional SSR app hits the server again. Modern frameworks like Next.js mitigate this by doing the first load as SSR and subsequent navigations client-side.

---

### 7.5 ISR — Incremental Static Regeneration

The best of both worlds. Pages are pre-built like SSG but **automatically regenerated in the background** after a set time interval, without a full rebuild.

```
First request after build:
  User → CDN → returns pre-built HTML (fast, like SSG)

After revalidation period (e.g. 60 seconds):
  Next user request → CDN serves stale page immediately (still fast)
  Background: server quietly regenerates fresh HTML
  Subsequent requests → CDN serves new fresh HTML

Result: user always gets a fast response, data stays reasonably fresh
```

**Best for:** Content that changes occasionally but not in real-time — product pages, news articles, menu items, pricing pages.

| | ISR |
|---|---|
| **When HTML is built** | Build time + background refresh |
| **Data freshness** | Fresh within revalidation window |
| **Speed** | Fast (CDN) |
| **Server load at runtime** | Low — background regeneration only |
| **Personalisation** | ❌ Not possible (same page for all) |
| **SEO** | ✅ Excellent |

#### User interaction with ISR

```
User clicks link
        ↓
CDN returns cached HTML immediately  ← FCP is early (like SSG)
        ↓
Browser paints full page content
        ↓
Hydration
        ↓
Page becomes interactive  ← TTI

Meanwhile (if revalidation triggered):
  Server quietly regenerates page in background
  CDN cache updated
  Next user gets fresh HTML
```

**What the user experiences:** Almost identical to SSG — fast initial paint, brief hydration gap, then fully interactive. The difference is invisible to most users. They may occasionally see data that is slightly stale (within the revalidation window) but the page feels fast. The only user-visible quirk is the **first user after a revalidation** — they get the stale version while the new one builds in the background. Next request gets the fresh one.

---

### 7.6 Side-by-Side Comparison

| | SSG | SSR | ISR |
|---|---|---|---|
| **When HTML is built** | Build time | Every request | Build time + background |
| **Data freshness** | Stale until rebuild | Always fresh | Fresh within window |
| **Initial wait for user** | Almost none | Noticeable (server thinking) | Almost none |
| **FCP** | Very fast | Slower | Very fast |
| **TTI** | Fast (hydration gap only) | Moderate (wait + hydration) | Fast (hydration gap only) |
| **Server load** | None at runtime | High (every request) | Low (background only) |
| **Personalisation** | ❌ | ✅ | ❌ |
| **On slow network** | Still fast (CDN edge) | Painful (server + transfer) | Still fast (CDN edge) |
| **On slow server** | Not affected | Very painful | Barely affected |
| **SEO** | ✅ Excellent | ✅ Excellent | ✅ Excellent |

---

### 7.7 How to Choose — Decision Tree

```
Does the page need personalised data per user?
  Yes → SSR

Does the page need real-time data (changes every few seconds)?
  Yes → SSR (or SSR + client-side fetch for live parts)

Does the content change occasionally (minutes to hours)?
  Yes → ISR with appropriate revalidation window

Does the content rarely change (days to weeks)?
  Yes → SSG
```

---

### 7.8 The Hydration Problem — Going Deeper

All three strategies share the hydration gap. This is an active area of improvement in modern frameworks.

**React 18 Selective Hydration:** Instead of hydrating the entire page at once, React prioritises hydrating whatever the user is interacting with first. Click a button — React hydrates that component immediately, even if the rest of the page is not hydrated yet.

**Island Architecture (Astro, Fresh):** Only the interactive parts of the page ship JavaScript at all. Static parts (a blog article body) ship zero JS. Only the comment box or like button ships JS and hydrates.

```
Island architecture:
  Static content (article text, images) → pure HTML, no JS shipped
  Interactive islands (comments, likes, cart) → JS + hydration only here
  Result: much smaller JS bundle, dramatically faster TTI
```

---

### 7.9 How Rendering Strategies Connect to the Eight Pillars

| Pillar | SSG | SSR | ISR |
|---|---|---|---|
| **Scalability** | Excellent — CDN handles all load | Requires server capacity planning | Good — CDN handles most load |
| **Performance** | Fastest possible FCP | Slower FCP, depends on server speed | Near-SSG performance |
| **Accessibility** | Full HTML for screen readers ✅ | Full HTML for screen readers ✅ | Full HTML for screen readers ✅ |
| **Observability** | Limited — CDN-level analytics only | Full server-side visibility per request | Mix of CDN and server observability |
| **Security** | Minimal server attack surface | Full server — must secure carefully | Partial server exposure |
| **Reliability** | Very high — static files rarely fail | Depends on server and DB uptime | High — CDN fallback if regen fails |

---

## Quick Reference

### Phrases that signal senior thinking

- *"It depends on the read/write ratio…"*
- *"I'd start with X and optimise to Y once we hit Z scale"*
- *"The tradeoff here is between consistency and availability — for this domain I'd accept eventual consistency because…"*
- *"Before I answer, let me clarify the scale requirements…"*
- *"One failure mode I want to flag is…"*
- *"I'd add a trace ID on every request so we can diagnose failures end-to-end"*
- *"We already had X in place, so I multiplexed Y through it rather than adding a second connection"*
- *"This is a scalability question but also a team scalability question — let me address both"*
- *"The rendering strategy depends on how frequently this data changes and whether it needs to be personalised"*

---

### The core mental models

- **Idempotence:** Same operation, many times = same result as once. Always design retries to be safe.
- **Separation of concerns:** OLTP for live operations. OLAP for analytics. Never mix them.
- **Reuse before adding:** Existing infrastructure is cheaper than new infrastructure. Multiplex, extend, adapt.
- **Trace the chain:** Every frontend decision has a backend consequence. Think through all layers.
- **Plan for failure:** Design the happy path last. Design the failure modes first.
- **Patterns complement, not compete:** Monolith/microservices + event-driven + CQRS + BFF can all exist in the same system simultaneously.
- **Eight pillars checklist:** Before shipping anything to production, ask — is this scalable, accessible, extensible, observable, reliable, maintainable, secure, and performant?
- **Rendering is a spectrum:** SSG → ISR → SSR ordered by data freshness need and server cost. Choose based on how often data changes and whether personalisation is required.

---

*Think out loud. Drive the conversation. Design for failure. Build for humans.*
