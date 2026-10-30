# ResearchMesh

Academic collaboration and mentorship matching for a university. Students find faculty who are **actively** publishing in their area *and* have room in their lab; faculty find students across departments with the exact skills a project needs. Join requests and decisions arrive in real time.

**Stack:** MongoDB · Express 5 · Apollo Server 5 · React 19 · Apollo Client 4 · Node.js 22 · graphql-ws · DataLoader

---

## Run it in VS Code

**Prerequisite:** Node.js 22 or newer (`node -v`).

```bash
# 1. Open the folder in VS Code, then in the integrated terminal:
npm run setup      # installs root, server and client dependencies

# 2. Start everything (API + web) — no MongoDB install needed
npm run dev
```

Open **http://localhost:5173** and click one of the demo-login buttons. Apollo Sandbox (to try raw GraphQL) is at **http://localhost:4000/graphql**.

`npm run dev` starts an **in-memory MongoDB** and seeds demo data each time. The first run downloads a MongoDB binary (~70 MB), so give it a minute. Data resets when you stop the server.

| Demo login (password `password123`) | What to try |
| --- | --- |
| `student@researchmesh.dev` | Find faculty, My matches (move the sliders), request to join a project |
| `faculty@researchmesh.dev` | My lab dashboard, Find students, accept/decline requests |
| `admin@researchmesh.dev` | Admin stats and role management |

**See real-time working:** open a normal window logged in as *faculty* on *My lab*, and a private window logged in as *student*. Request to join "Legal-clause RAG assistant" as the student — the faculty window shows the request instantly, no refresh.

### Using a real (persistent) MongoDB

```bash
cp server/.env.example server/.env   # set MONGODB_URI (local, Docker or Atlas) and JWT_SECRET
npm run seed                         # wipes and seeds that database
npm run dev:mongo
```

Docker one-liner for a local Mongo: `docker run -d -p 27017:27017 --name mongo mongo:7`

### Other commands

| Command | |
| --- | --- |
| `npm test` | 19 tests: matching engine unit tests + end-to-end API tests (auth, DataLoader, subscriptions) |
| `npm run build` | Production build of the client |
| **F5** in VS Code | Debug configs for the API, tests and the client (see `.vscode/launch.json`) |

---

## Project structure

```
researchmesh/
├── server/
│   ├── src/
│   │   ├── app.js                  Express + Apollo + graphql-ws on one port
│   │   ├── index.js / dev-memory.js  entry points (real Mongo / in-memory Mongo)
│   │   ├── auth.js                 JWT, role ranks, error helpers
│   │   ├── models/index.js         Mongoose schemas + indexes
│   │   ├── graphql/
│   │   │   ├── typeDefs.js         the schema (with @auth directive)
│   │   │   ├── authDirective.js    schema transformer enforcing @auth
│   │   │   ├── loaders.js          per-request DataLoaders (N+1 fix)
│   │   │   └── resolvers/          types, query, mutation, subscription
│   │   ├── services/
│   │   │   ├── matching.js         recommendation engine (pure functions)
│   │   │   └── notify.js           persist + publish notifications
│   │   ├── queryCounter.js         counts DB round-trips per request
│   │   └── seed/seed.js
│   └── tests/
├── client/
│   └── src/
│       ├── apollo/client.js        split link (HTTP / WebSocket), auth, cache policies
│       ├── graphql/operations.js   fragments, queries, mutations, subscriptions
│       ├── auth/AuthContext.jsx    token + per-user ApolloClient
│       ├── components/             Layout (live subscriptions), MatchBar, PersonRow…
│       └── pages/
└── docs/example-queries.graphql    copy-paste queries for Apollo Sandbox
```

---

## How the interesting parts work

### 1. Why GraphQL fits this data

Users → Labs → Projects → Publications → Departments are all cross-referenced, and each screen needs a different slice:

- **Search card** — name, top skills, open slots, recent paper count (`UserCard` fragment)
- **Full profile** — plus publications with co-authors, connections, projects
- **Lab dashboard** — lab → members → their projects, grants, pending requests → requester skills

With REST you'd either over-fetch (one fat `/users/:id`) or chain 4–5 calls. Here each page sends one query shaped exactly like what it renders. See `client/src/graphql/operations.js`.

### 2. N+1 queries and DataLoader

Rendering 20 faculty with `department`, `lab { members { department } }`, `publications { authors }` and `projects` naively fires one query per field per row.

`server/src/graphql/loaders.js` creates **fresh DataLoaders per request** (so the cache never leaks between users). Every `load(id)` in the same event-loop tick is collapsed into one `find({ _id: { $in: [...] } })`.

**Measured** (in `tests/api.test.js`, and visible in every response's `extensions.dbQueries`):

| | DB queries for the same nested query |
| --- | --- |
| DataLoader on | **8** |
| DataLoader off (`x-dataloader: off` header) | **89** |

Two details worth mentioning in an interview: batch functions must **return results in the same order as the keys** (we map through a `Map`), and one-to-many relations (author → publications) use a *grouped* loader that buckets results per key.

### 3. The headline search is a single aggregation

"NLP faculty who published in the last 2 years with an open lab slot" (`searchFaculty` in `resolvers/query.js`):

```
$match faculty → $lookup recent publications → $lookup labs they head
→ $match (area in interests | lab areas | paper keywords; has recent paper; openSlots > 0)
→ $facet { page of results, total count }
```

One round-trip, paging included. "Recent" means publication year — so a professor whose last NLP paper was 2019 doesn't appear, which is the whole point of the product.

### 4. Matching algorithm (`server/src/services/matching.js`)

Each faculty candidate gets an explainable score in [0, 1]:

```
score = 0.40 · skillSimilarity      IDF-weighted cosine over skill vectors (proficiency 1–5 → 0.2–1.0)
      + 0.35 · interestSimilarity   IDF-weighted cosine over interests + keywords from papers in the last 3 years
      + 0.15 · recency              0.6 · 0.5^(years since last paper / 2) + 0.4 · (1 − e^(−recentPapers/2))
      + 0.10 · availability         0 if lab full, else 0.5 + 0.5 · openSlots/capacity
```

- **IDF weighting** means sharing a rare skill (`genomics`) counts far more than sharing a common one (`python`).
- Results include a **breakdown** and human-readable **reasons** ("Shared interests: legal ai, nlp"), rendered as the segmented bar in the UI.
- Weights are a GraphQL argument, so the *My matches* sliders re-rank live.
- For **projects**, required-skill *coverage* dominates (70%) with topical fit second — a test caught an early version where interest overlap could beat actually having the skills.

### 5. Real-time with subscriptions

- `graphql-ws` shares the HTTP server's port and `/graphql` path (`server/src/app.js`).
- The socket authenticates once via `connectionParams.authorization`; `withFilter` makes sure each event only reaches its recipient.
- Notifications are **persisted** (so you see them after reconnecting) *and* published.
- On the client, `split` routes subscriptions to the WebSocket link. Incoming notifications are written **straight into the Apollo cache** (`cache.modify`), so the badge count, list and toast update without refetching.
- "Notify me when a matching opening appears": raising a lab's `openSlots` or posting a project scores unattached students with the matching engine and notifies those above a threshold.

In-memory `PubSub` works for one Node process. To scale horizontally, swap in `graphql-redis-subscriptions` (same interface).

### 6. Role-based access declared in the schema

```graphql
email: String! @auth(requires: FACULTY)
grants: [Grant!]! @auth(requires: FACULTY)
searchStudents(input: StudentSearchInput!): UserSearchResult! @auth(requires: FACULTY)
adminStats: AdminStats! @auth(requires: ADMIN)
```

`authDirective.js` is a schema transformer (`mapSchema`) that wraps every annotated resolver. Roles are ranked (STUDENT < FACULTY < ADMIN). A **self rule** lets a student read their *own* `email` even though the field requires FACULTY. Ownership checks (only the lab head sees their request queue) live in resolvers.

### 7. Correctness details

- Accepting a request uses **atomic conditional updates** — `findOneAndUpdate({ openSlots: { $gt: 0 } }, { $inc: { openSlots: -1 } })` and a `$size < maxMembers` check — so two simultaneous accepts can't overfill a lab.
- Duplicate pending requests are rejected; accepting a student into a lab withdraws their other pending lab requests.
- A new `ApolloClient` is created when the token changes, so the WebSocket re-authenticates and one user's cache never shows to the next.

---

## Interview talking points (60-second version)

1. **Problem:** finding a mentor is cold emails and stale department pages. The product's core filter is *recency* — who is publishing now — plus *availability*.
2. **Why GraphQL:** deeply relational data, very different shapes per view; one query per screen.
3. **N+1:** per-request DataLoader took a nested query from 89 DB round-trips to 8 — and I measure it in a test.
4. **Search:** a single MongoDB aggregation with `$lookup` and `$facet`.
5. **Matching:** IDF-weighted cosine similarity + recency decay + availability, explainable breakdown, tunable weights.
6. **Real-time:** graphql-ws subscriptions with per-user filtering, persisted notifications, Apollo cache updates.
7. **Security:** `@auth` schema directive with a self rule, plus ownership checks; atomic updates for race conditions.

**What I'd do next:** Redis PubSub for multiple instances; cursor-based pagination; import publications from ORCID / Semantic Scholar instead of manual entry; embedding-based similarity for interests (so "LLMs" matches "large language models"); rate limiting and query-depth limits on the API.
