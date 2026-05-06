# System Design & Architecture
### A Deep-Dive Handbook for Engineers

> Covers architectural patterns, system design, full-stack thinking, and real-world concepts explained from first principles. Written for personal learning and Medium publication.

---

## Table of Contents

1. [Architecture Patterns](#1-architecture-patterns)
2. [Key Concepts Explained](#2-key-concepts-explained)
3. [Real-Time Communication: SSE vs WebSocket](#3-real-time-communication-sse-vs-websocket)
4. [System Design — How to Approach Any Problem](#4-system-design--how-to-approach-any-problem)
5. [Full-Stack Thinking](#5-full-stack-thinking)
6. [Quick Reference](#quick-reference)

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

Once you've decided your structure (monolith or microservices), you need to decide how components communicate. This is a **completely separate decision**.

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

These are two separate ideas usually used together. They are about **how data is written and read** inside a service.

**CQRS (Command Query Responsibility Segregation):** Maintain two separate models. One for writing data (commands: place order, cancel order). One for reading data (queries: show order history, show dashboard). Each uses a database optimised for its job.

**Event Sourcing:** Instead of storing the current state of something, store the full history of events that led to that state. An order record does not say `status: DELIVERED`. It says: PLACED at 12:01, ACCEPTED at 12:02, PREPARED at 12:15, DELIVERED at 12:28. Current state is derived by replaying those events.

| Option | Pros | Cons / Tradeoffs |
|---|---|---|
| **CQRS + Event Sourcing** | Full audit trail. Time travel (replay history). Separate read/write scaling. Rebuild any read model by replaying events. | Significant complexity. Eventual consistency. Overkill for simple domains. Steep learning curve. |

> ⚠️ **Important:** CQRS + Event Sourcing is about **HOW DATA IS HANDLED** inside a service. You could apply it to one service inside a monolith. It is not a replacement for monolith or microservices.

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

**Online inference** means running an AI/ML model in real time, at the moment a user makes a request. The system looks at current context (user history, time of day, session data) and runs the recommendation model right then and there.

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

**The problem:** Service A calls Service B. Service B is having issues and every call times out after 30 seconds. Without protection, 100 users are all stuck waiting 30 seconds. Threads pile up. Memory fills. Service A crashes — brought down by a downstream failure that had nothing to do with it. This is called a **cascading failure**.

**The solution:** A circuit breaker monitors calls to a downstream service and trips open when failures cross a threshold. Named after a physical electrical circuit breaker that cuts the circuit during a power surge to protect everything downstream.

#### Three states

| State | Behaviour | Transition |
|---|---|---|
| **CLOSED** | Normal operation. All calls go through. | Opens after N consecutive failures |
| **OPEN** | All calls immediately return a fallback. No calls to downstream service. | Moves to HALF-OPEN after timeout (e.g. 30 seconds) |
| **HALF-OPEN** | Let one test request through. | Success → CLOSED. Failure → OPEN again. |

#### The fallback strategy — you must plan this

When the circuit is open you need a plan for what to return instead:

- **Graceful degradation:** Accept the request, flag for manual processing. User gets a response, staff handles the rest.
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

#### Which to use?

SSE is sufficient here. Person 2 is only ever **receiving** information from the server. They never need to send anything back through the live connection.

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

WebSocket connections are stateful — each client is pinned to a server. This makes horizontal scaling harder. At large scale (millions of concurrent users), companies use a dedicated connection management tier:

```
Client A ↔ WebSocket Server (holds connections only)
                    ↕
            Message broker (Kafka / Redis Pub-Sub)
                    ↕
Client B ↔ WebSocket Server (holds connections only)
                    ↕
            Business logic servers (stateless, scalable)
```

The WebSocket tier is stateful but thin — it only holds connections and routes messages. Business logic servers stay stateless and can scale freely. This is how Slack, Discord, and similar products handle millions of concurrent connections.

---

### 3.5 gRPC — The Internal Service Protocol

**gRPC** is a communication framework for services talking to each other internally. RPC stands for Remote Procedure Call — one service calls a function on another as if it were a local call, but it happens over the network.

#### How it works

- **Protobuf (Protocol Buffers):** Instead of JSON, gRPC uses a binary format. You define your data structure in a `.proto` file. Both services generate code from it automatically. Same contract, zero ambiguity.
- **Auto-generated code:** From the `.proto` file, gRPC generates client and server code in any language. A Go service and a Java service can communicate perfectly because they both generated code from the same contract.
- **HTTP/2:** Enables multiplexing (multiple requests over one connection), streaming, and header compression.

#### Why faster than REST

| | REST + JSON | gRPC + Protobuf |
|---|---|---|
| Data format | Text (human readable) | Binary (compact) |
| Payload size | Larger | 3–10x smaller |
| Parsing speed | Slower | Faster |
| Protocol | HTTP/1.1 | HTTP/2 |
| Code generation | Manual | Automatic from contract |
| Browser support | Full | Poor (needs proxy) |

#### Four communication patterns (gRPC advantage over REST)

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

> 💡 **Rule:** gRPC for internal service-to-service communication. REST or GraphQL for external clients (browsers, mobile apps). The API Gateway translates between the two worlds.

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
Messages pile up in the queue faster than consumers can process them. Result: downstream services get delayed.

**Fix:** Monitor consumer lag with alerting. Scale consumer instances horizontally when lag crosses threshold.

---

#### DB write spike
Peak traffic causes thousands of simultaneous DB connections. Most databases collapse under this.

**Fix:** Connection pooler (PgBouncer) sits between app servers and DB, maintains a small managed pool. Read replicas for non-critical reads.

---

#### Offline clients
Network drops. Without a plan, all user actions fail.

**Fix:** Store actions locally (SQLite on device). Show user a confirmation immediately. Sync to server when connectivity restores. Use timestamp + device ID to resolve conflicts.

---

#### Partial failure — The Outbox Pattern

The hardest one. Step 1 succeeds (write to DB) but Step 2 fails (publish to Kafka). The record exists but nothing downstream knows about it.

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
    Retries until successful
    Event is never lost
```

---

### 4.4 Scalability Patterns Quick Reference

| Option | Pros | Cons / Tradeoffs |
|---|---|---|
| **Horizontal scaling** | Add more instances behind a load balancer. Works for stateless services. | Need shared state (Redis) for stateful flows. Session affinity complexity. |
| **Caching (Redis)** | Massive read latency reduction. Absorbs read spikes. Reduces DB load. | Cache invalidation is hard. Stale data risk. Adds infrastructure. |
| **DB sharding** | Partition data by key across DB nodes. Independent scaling per shard. | Cross-shard queries expensive. Resharding is painful. Adds complexity. |
| **Read replicas** | Offload reads from primary. Good for reporting and analytics reads. | Replication lag. Eventual consistency on reads. |
| **CDN** | Cache static assets globally. Reduces server load. Near-zero latency for users. | Purging is slow. Not suited for dynamic or personalised content. |
| **Circuit breaker** | Stop calling a failing service. Return fallback fast. Prevents cascading failures. | Need fallback strategy. Adds complexity to service client code. |

---

## 5. Full-Stack Thinking

Full-stack awareness means every decision you make at one layer has consequences at every other layer. The ability to trace those consequences end-to-end is what separates generalist engineers from specialists.

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

#### Breaking vs non-breaking changes

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
| **Logs** | What happened and when. Use structured JSON logs. Include a correlation ID on every log line so you can filter all logs for a single request. | ELK Stack, Datadog, CloudWatch |
| **Metrics** | How the system behaves over time. Track: requests/sec, p95 latency, queue depth, error rate, cache hit rate. | Prometheus + Grafana, Datadog |
| **Traces** | Follow a single request across all services. Critical for finding which service added latency in a distributed system. | Jaeger, Zipkin, AWS X-Ray, Datadog APM |

> 💡 **Senior answer:** Add a trace ID on every request that propagates from client to API to queue consumer to payment service. When a user reports a problem, pull one trace and see exactly where the request dropped.

---

### 5.4 Database Performance: What Frontend Engineers Often Miss

- **N+1 queries:** Loading a list of records, then fetching each record's related data in a loop = N+1 queries. Fix with JOIN or batching (DataLoader pattern).
- **Missing indexes:** A query like `SELECT * FROM orders WHERE user_id = ?` runs a full table scan without an index on `user_id`. Always index foreign keys and common filter columns.
- **Pagination:** OFFSET-based pagination degrades at high offsets. Use cursor-based pagination (`WHERE id > last_seen_id LIMIT 20`) for large datasets.
- **Connection pooling:** Each server thread should not hold a DB connection open permanently. PgBouncer or a built-in pool multiplexes connections efficiently.
- **Optimistic updates:** Update the UI immediately before server confirms. Requires the server to return rich error responses for rollback, and requires idempotency to handle double submissions safely.

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

---

### The core mental models

- **Idempotence:** Same operation, many times = same result as once. Always design retries to be safe.
- **Separation of concerns:** OLTP for live operations. OLAP for analytics. Never mix them.
- **Reuse before adding:** Existing infrastructure is cheaper than new infrastructure. Multiplex, extend, adapt.
- **Trace the chain:** Every frontend decision has a backend consequence. Think through all layers.
- **Plan for failure:** Design the happy path last. Design the failure modes first.
- **Patterns complement, not compete:** Monolith/microservices + event-driven + CQRS + BFF can all exist in the same system simultaneously.

---

*Think out loud. Drive the conversation. Design for failure.*
