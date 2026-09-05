# Progress Tracker — Prototype

Prototype for: **Intelligent Data Capture & Schedule-Linking Layer for Infrastructure
Project Management**. Demonstrates ingestion of free-text field reports and discipline
spreadsheets, LLM-shaped extraction (stubbed with heuristics — see note below), fuzzy
matching to a baseline L5/L6 WBS, a human-in-the-loop review queue, and schedule/PMIS
update with a full audit trail.

## Run it

```
npm install
npm run seed    # populates demo users + baseline L5/L6 activities (idempotent)
npm start        # http://localhost:3000
```

Open `http://localhost:3000`. Auth is stubbed: use the "Acting as" dropdown in the top
bar to switch between a Supervisor (civil/piping/electrical), Planner, Admin, and PM —
each sees a different nav and different permissions server-side (not just hidden UI).

## Try the core loop

1. As **civil supervisor**: go to *Log Progress* → type
   `Started rebar fixing on F-12 today.` → submit. See the extracted event and its
   top fuzzy match.
2. Switch to **planner**: go to *Review Queue* → see the same event, lowest-confidence
   first → Accept (or click a different candidate to reassign first).
3. Go to *Schedule* → the matched activity now shows an actual start date and
   `in_progress` status. Click into it for the full audit trail.
4. Switch to **PM**: *Dashboard* shows discipline rollups, overdue activities, and a
   live audit feed.
5. Try uploading a spreadsheet (Log Progress → Spreadsheet upload) with columns
   `Activity, Date, Remarks` — same pipeline, batched.

## Structure

```
src/
  config/db.js         SQLite schema (activities, raw_entries, extracted_events,
                        matches, audit_log) + seed.js (demo data)
  services/
    extractionService.js  raw text/row -> structured {description, event_type, date}
    matchingService.js    fuzzy-matches extracted description -> L5/L6 activity,
                           with a discipline-scoped candidate pool + confidence thresholds
  middleware/auth.js    role-based access (x-user-id header stub for prototype)
  controllers/          logController, ingestController, reviewController,
                         scheduleController, dashboardController, authController
  routes/               one file per resource, mounted under /api in server.js
public/                 vanilla HTML/JS frontend (no build step)
```

## Where the real LLM plugs in

`extractionService.js` is deliberately isolated and stubbed with heuristics (keyword
sniffing for start/end, regex date parsing) so the pipeline runs with zero external
dependencies. Swap its two exported functions for a single Claude API call with a JSON
schema for `{activity_description, event_type, date, confidence}` — no other file
needs to change; the `extracted_events` table schema is the contract.

`matchingService.js` currently uses `string-similarity` (Dice coefficient) plus a small
hardcoded synonym table (spool→line, poured→pour, etc.) to bridge field vs. plan
terminology. A production version would replace `normalize()`'s synonym swap with
embedding similarity (via the same LLM) blended with the string score, and grow the
synonym table from confirmed reassignments over time — that reassignment history is
already captured in `audit_log`, so it's ready to train from.

## Design decisions worth noting in review

- **Single writer for baseline activities.** Only admin/planner can hit
  `POST /api/schedule/import`; supervisors can only write to `raw_entries` /
  `extracted_events`. Enforced server-side via `requireRole`, not just hidden nav.
- **No silent auto-commit.** Even a 95%-confidence match sits in `pending` until a
  planner accepts it — matches the "flag for planner review rather than silently
  dropping" requirement from the problem statement.
- **Unmatched activities aren't discarded.** Below a similarity floor, a match is
  auto-marked `flagged_new` instead of being forced onto the nearest wrong node.
- **Audit trail is per-match and per-activity**, so both "how did this entry get
  processed" and "what happened to this activity over time" are answerable.
