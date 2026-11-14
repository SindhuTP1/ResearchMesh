# ResearchMesh

Academic collaboration and mentorship matching for a university. Students find faculty who are **actively** publishing in their area *and* have room in their lab; faculty find students across departments with the exact skills a project needs. Join requests and decisions arrive in real time.

**Stack:** MongoDB · Express 5 · Apollo Server 5 · React 19 · Apollo Client 4 · Node.js 22 · graphql-ws · DataLoader

---

## Run it in VS Code

**Prerequisites:** Node.js 22+ and MongoDB running locally on port 27017 (the Windows "MongoDB" service), or any MongoDB URI.

```bash
npm run setup      # once: installs root, server and client dependencies
npm run dev        # API (http://localhost:4000) + web app (http://localhost:5180), using MongoDB from server/.env
```

Open **http://localhost:5180**.

- `server/.env` holds `MONGODB_URI` (default `mongodb://127.0.0.1:27017/researchmesh`), `JWT_SECRET` and `ADMIN_SIGNUP_CODE`. Copy `server/.env.example` if it's missing.
- The database starts with **departments only — no people**. Every student, faculty and admin account is created on the sign-up page, and everything is kept between restarts.
- `npm run reset:people` removes every student and faculty account and everything they made (labs, projects, chats, files…). It saves a full backup to `backups/` first. Departments and the admin stay.
- The web app runs on port **5180** (not Vite's usual 5173, which another local project uses).
- No MongoDB? `npm run dev:memory` runs an embedded MongoDB (nothing to install). Its data is saved in `server/.devdata`, so accounts survive restarts; delete that folder to start fresh.
- Chat files are stored in MongoDB GridFS (bucket `attachments`), so there is nothing else to configure.

### Accounts and the three portals

There are **no demo logins and no preloaded people**. Create accounts on the sign-up page and pick a role; the login page also asks which portal you're entering, and refuses if the account has a different role.

**Remember me** (on by default) keeps you signed in on that browser and fills in your email next time. Passwords are never stored by the app: the browser's password manager offers to save them when you sign up or log in.

| Role | How to get an account | What the portal has |
| --- | --- | --- |
| **Student** | Sign up as a student | Dashboard (profile strength, top mentor matches, projects that fit your skills, labs with openings in your areas, application tracker), Find faculty, My matches, Projects, Labs, My applications |
| **Faculty** | Sign up as faculty (department and designation required). The account waits for admin verification; it works meanwhile, with an “Unverified” tag | Dashboard (requests waiting, lab capacity, research output by year, students to invite), My lab, My projects, Publications, Join requests, Find students, Faculty directory |
| **Admin** | **Exactly one admin.** The first person to sign up as admin with the access code (`ADMIN_SIGNUP_CODE` in `server/.env`) becomes the admin; after that the admin option is closed and nobody can be promoted to admin. Enforced by a unique MongoDB index, not just the UI | Platform overview (department table, lab capacity, request outcomes, recent activity), Faculty verifications, Users and roles, Departments, Projects & labs moderation |

### Teammates, connections, chat and calls

- **Find teammates** (students): students ranked by shared interests (55%), shared skills (25%) and the skills they'd bring that you lack (20%). Start a team and invite people to it.
- **Connections**: requests must be accepted; accepting a join request or invite connects people automatically.
- **Messages** (students and faculty), all live over the WebSocket:
  - 1:1 chats, faculty lab groups and ad-hoc groups, one team chat per project, students' own groups
  - **files and images** (button, drag & drop or paste; 10 MB; stored in GridFS; only members can download), image lightbox
  - **edit / delete** your messages (group admins can delete any), **emoji reactions**, emoji picker
  - **typing indicators**, **read receipts** (✓ Sent / ✓✓ Seen / Seen by N), **online dots**
  - **push notifications** (🔔 in Messages): Web Push via a service worker, so messages, calls and requests reach you when no tab is open
- **Voice and video calls** (📞 / 📹 in any chat, 1:1 or groups of up to ~6): peer-to-peer WebRTC, signalled over the same WebSocket. Call timer, mute, camera toggle, minimise. Browsers allow mic/camera only on `https` or `localhost`; across strict networks set a TURN server in `client/.env` (`VITE_ICE_SERVERS`).
- **Interface**: page transitions, animated dashboards (typewriter hero, count-up stats, swipeable sliders, match rings), skeleton loading, confetti when you're accepted, light/dark/system theme toggle, **Ctrl+K** quick search. Animations switch off for people who prefer reduced motion.

**Try chat and video:** sign up a student in a normal window and another student in a private window, connect them (Find teammates → Connect → accept), then open *Messages* and press **📹 Video call**.

**See real-time working:** in one window, sign up as faculty, create a lab on *My lab* and post a project. In a private window, sign up as a student with matching skills and request to join. The faculty dashboard shows the request instantly, no refresh.

## Deploy

In production one Node server does everything: the API, the WebSocket (chat, live updates, call signalling) **and** the built web app, all on one address. Any host that runs Node 22 or Docker works (Render, Railway, a VPS…). Hosts provide HTTPS, which browsers require for the camera and microphone.

**1. Database: MongoDB Atlas (free tier)**
Create a cluster, add a database user, allow access from anywhere (`0.0.0.0/0`), and copy the connection string, e.g. `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/researchmesh`.

**2. Call relay (TURN) — needed for calls between different networks**
Without it, calls between two people on different Wi-Fi / mobile data often fail to connect. A free option is Metered.ca (Open Relay, free tier): create an app and copy its TURN URLs, username and credential.

**3. Create the web service**
- Build command: `npm run setup && npm run build`
- Start command: `npm start`
- Or use the `Dockerfile` in this folder (`docker build -t researchmesh .`).

**4. Environment variables**

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | your Atlas connection string |
| `JWT_SECRET` | a long random string (32+ characters) |
| `ADMIN_SIGNUP_CODE` | a secret code (8+ characters) — whoever has it creates the one admin account |
| `TURN_URLS` | e.g. `turn:global.relay.metered.ca:80,turn:global.relay.metered.ca:443,turns:global.relay.metered.ca:443?transport=tcp` |
| `TURN_USERNAME`, `TURN_CREDENTIAL` | from your TURN provider |
| `PORT` | set automatically by most hosts |

The server refuses to start in production if `MONGODB_URI`, `JWT_SECRET` or `ADMIN_SIGNUP_CODE` is missing, and warns if no TURN server is set.

**5. After the first deploy**
Open the site, sign up as **Admin** with your code (only one admin can ever exist), then create the student and faculty accounts. Two people connect (Find teammates → Connect → Accept, or by having a join request accepted), and can then chat and voice/video call from any device.

### Testing on two laptops (chat, voice and video between accounts)

Browsers only allow the camera and microphone on `https://` or `localhost`, so the second laptop needs HTTPS:

```bash
npm run dev:lan    # instead of npm run dev
```

1. Vite prints `Network: https://<this-PC's-IP>:5180`. Both laptops must be on the same Wi-Fi.
2. On the first run, Windows asks whether Node.js may use the network: allow **Private networks**.
3. On each laptop open that `https://…:5180` address. The browser warns about the self-signed certificate once: **Advanced → Proceed**.
4. Sign up a different account on each laptop, connect them, open **Messages**, and use 📞 / 📹.

Campus or public Wi-Fi that isolates devices from each other blocks this; a phone hotspot works. Push notifications need a trusted certificate, so on the second laptop they only work while the tab is open.

### Using a real (persistent) MongoDB

```bash
cp server/.env.example server/.env   # set MONGODB_URI, JWT_SECRET and ADMIN_SIGNUP_CODE
npm run dev                          # creates the departments if the database is empty
```

Docker one-liner for a local Mongo: `docker run -d -p 27017:27017 --name mongo mongo:7`

### Other commands

| Command | |
| --- | --- |
| `npm test` | 36 tests: matching engine unit tests + end-to-end API tests (auth, portals, verification, search filters, DataLoader, subscriptions, connections, chat permissions, live messages, groups, invites, call signalling, attachments, reactions, edits, typing, read receipts, presence, push) |
| `npm run dev:lan` | Same as `dev`, but HTTPS and reachable from other devices on the Wi-Fi |
| `npm run reset:people` | Back up, then delete all student and faculty accounts and their data |
| `npm run seed:sample` | **Wipes the database** and loads a small sample directory of fake people (demos only) |
| `npm run build` | Production build of the client |
| `npm start` | Production server: API + built web app on one port (`NODE_ENV=production`) |
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
│   │   └── seed/              seed.js (departments + sample data), resetPeople.js
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
| DataLoader off (`x-dataloader: off` header) | **176** |

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

