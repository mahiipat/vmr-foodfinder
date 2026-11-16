This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Sprint 5 prototype backend

All application backend logic is in [backend/AppBackend.ts](backend/AppBackend.ts). Firebase initialization stays in [backend/firebase.js](backend/firebase.js). Screens call the exported helpers directly; there are no Next.js API routes, Admin SDK, server credentials, or separate backend services.

### Behavior and scope

- Firebase client transactions persist group membership, nominations, readiness, ballots, results, and feedback.
- `subscribeRoomState` uses Firestore `onSnapshot` directly on the room document. There is no polling or HTTP round trip. Its cleanup function detaches the listener.
- The UI shows only a member's nominations before voting; all eligible contenders appear when voting starts. **This is prototype UI filtering, not a confidentiality boundary:** authenticated clients with a room ID can read the underlying shared document, including other nominations and preferences. Do not store sensitive information in rooms.
- Removing a nomination preserves it if another member still nominates the same restaurant. Preference changes reset readiness. If all ready members have no eligible contenders, everyone becomes not-ready and receives the reask message.
- Groups get a 50/50 random/runoff strategy at creation unless `createGroup` receives an explicit `tieStrategy`. Random ties finalize a tied winner; runoff ties open one fresh single-choice ballot using the existing voting screen. A second tie falls back to random. Results remain stored in Firestore.
- Login/signup are optional. Guests use anonymous Firebase identities. The homepage shows registered users their name, My profile, and Log out instead of Log in/Sign up. Registered users join rooms automatically with saved defaults; guests enter a name. The profile screen saves budget/distance defaults through the same `profiles/{uid}` data used by group joining. The results screen's satisfaction buttons persist feedback and show group response totals. Profiles prefill new membership without overwriting later room edits. User-facing errors use plain language rather than SDK error messages/codes.
- No restaurant-provider API is called. Name-only nominations have unknown price, rating, and distance. Unknown prices are eligible only when everyone leaves all budget ranges selected. Supplied restaurant metadata remains usable for budget filtering.
- Distance filtering is deferred, but the original location-permission button, manual address input, and distance preference controls are restored unchanged from commit `754347a`. They save preferences without calling any restaurant/geocoding service; saved location/distance preferences do not block voting.
- Existing version-2 groups remain compatible. Pre-sprint groups with the old format require recreation.

### Firebase setup

Use the existing public web configuration in [backend/firebase.js](backend/firebase.js). Enable **Anonymous** Authentication for guests; enable **Email/Password** only if testing the optional account forms. The homepage navigation links to `/login` and `/signup`. No Admin/service-account credential or environment file is required.

If live group creation returns `auth/configuration-not-found`, Firebase Authentication has not been initialized for the project associated with the configured API key. Open [Firebase Authentication](https://console.firebase.google.com/project/movie-voting-app-663bb/authentication), click **Get started**, then enable **Anonymous** under **Sign-in method**. Enable **Email/Password** for login/signup. Anonymous sign-in supplies guest IDs automatically; it does not require users to create accounts. If Auth is already initialized in your intended project, compare its web app configuration in Project settings with the configuration in [backend/firebase.js](backend/firebase.js). Enabling Firestore or running the emulator does not enable live Authentication.

[firebase.json](firebase.json) selects [firestore.rules](firestore.rules) and local emulator ports. The prototype rules permit authenticated room reads/writes, validate the room shape, and restrict account profiles to their owners. They intentionally do not isolate members' fields within shared room documents. Review them before using real user data.

The rules file is not automatically deployed. To use it on the real Firebase project, run this yourself:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules --project YOUR_PROJECT
```

### Firestore study tracking and app-chosen tiebreak comparisons

All application telemetry now writes directly to **Firestore**, not Google/Firebase Analytics. The Analytics SDK initialization and measurement ID have been removed. Existing GA history is neither deleted nor imported; measurements that were never collected cannot be recovered. Server rendering does not emit events. Local Auth/Firestore emulators collect events under `environment=emulator`, without touching production.

Data is stored in two places:

- **`study_events/{autoId}`**: append-only event records with `eventName`, the original `parameters`, server `recordedAt`, client `clientTimeMs`, `actorUid`, `schemaVersion`, `studyRunId`, `environment`, `appVersion`, and browser/session `context`. The normal screen timing and custom event APIs remain unchanged.
- **`rooms/{roomId}.study`**: a small summary persisted **inside the same transaction as the group action**: immutable run/environment/version/assignment metadata, shortlist evaluations/empty evaluations/all-pruned attempts, first-round/runoff ties, voting/runoff/decision timestamps, decision seconds, actual resolution, and current happy/response counts. Summaries survive raw-event delivery failures and transaction retries do not double-increment counters. Existing rooms without this field remain compatible and are not relabeled as new study groups.

Context includes anonymous browser visitor/session IDs, a normalized page, room ID where applicable, referrer **hostname**, bounded UTM source/medium/campaign labels, user-agent/platform/language/timezone, device category, screen resolution, and viewport size. No full referrer URL, arbitrary query string, email, or participant name is collected in telemetry. Events retain the existing `selected_restaurant_id`, which can contain a typed restaurant name. Do not put personal information in nominations or campaign labels.

`first_visit` and `session_start` replace GA's automatic equivalents for this app. Browser identity is kept in local storage; sessions use tab session storage and restart after 30 minutes without an event. Storage-blocked browsers use temporary identity and log a warning. These provide basic activity/return-visit analysis, **not** GA's modeled attribution, cross-device identity, or complete acquisition/retention products. OS/browser/version details can be interpreted from the stored user agent, subject to browser reduction; exact hardware model is often unavailable. `appVersion` comes from the package manifest. Guests still need no account form: telemetry and room actions share one anonymous Firebase sign-in.

#### Original event contracts retained

| Original events | Current behavior |
| --- | --- |
| `group_creation_started` | Retained before creation. |
| `group_created` | Retained, reported once after successful creation; includes the chosen tiebreak strategy and group context. |
| `group_joined` | Retained after each successful join, including `returning_member`; automatic account joins are covered too. Filter `returning_member=false` to count new memberships. |
| `invite_link_copied`, `nominations_started` | Retained. |
| `budget_ranges_updated` | Retained with `selected_range_count`, now reflecting the actual saved budget selection when it changes. |
| `restaurant_nominated`, `ready_to_vote` | Retained after the successful state change; nominations include source/count details. |
| `vote_selection_changed` | Retains `selected_restaurant_id` and `action`; adds the chosen strategy and round. |
| `votes_submitted` | Retains `selected_restaurant_count`; adds round and ballot-replacement context. |
| `return_to_voting`, `new_group_started` | Retained. |
| `screen_view` | Retains `firebase_screen`/`firebase_screen_class` for home, group_room, nominations, voting, and results; also covers login, signup, and profile. Adds `screen_name` and a per-visit identifier for timing joins. |

All original event names and their listed parameters remain tracked. Successful-write events are generated centrally after a committed action, not by every member's room listener.

Group lifecycle parameters retain the opaque `group_id`, comparison label `experiment_id=tie_strategy_v1`, app-chosen `tie_strategy` (`random` or `runoff`), `round`, `phase`, member/nomination/candidate counts, elapsed seconds since creation, and dietary-pruning policy. `group_cohort` is the room's immutable study run, or `legacy` for older rooms.

| Events | Measurement |
| --- | --- |
| `group_created`, `experiment_assigned` | Group-level experiment assignment; `assignment_source` distinguishes randomized assignment from an explicit test override. |
| `group_joined` | Successful join attempts, including `returning_member`, so new and returning memberships can be analyzed separately. |
| `restaurant_nominated`, `restaurant_nomination_removed`, `restaurant_details_updated` | Counts of added/removed/enriched nominations; typed versus provider source and dietary lookup availability. |
| `budget_ranges_updated`, `dietary_needs_updated`, `distance_preferences_updated` | Preference changes, using counts/availability flags rather than the actual location or dietary selections. |
| `ready_to_vote`, `readiness_withdrawn`, `readiness_reset` | Readiness changes and resets caused by edits or new members. |
| `shortlist_evaluated` | Each all-ready evaluation: nomination count, eligible count, pruned count, and whether all nominated choices were removed. |
| `all_choices_pruned`, `shortlist_empty` | Distinguishes constraints eliminating existing nominations from evaluating a group with no nominations. Both reset readiness. |
| `voting_started` | Eligible ballot opened. Its elapsed time measures creation-to-shortlist time. |
| `votes_submitted`, `voting_round_completed` | Ballot size, ballot replacements, completed rounds, tied-leader count, and actual round-level ties. |
| `tie_detected`, `runoff_started`, `tie_resolved` | Ties only after everyone votes, not transient ties while waiting for ballots. |
| `decision_completed` | One final decision, total `decision_seconds` from group creation, winner vote count, `had_tie`, actual `resolution_method`, and `random_fallback`. |
| `winner_satisfaction_submitted` | First/changed responses, plus current happy/response totals; identical repeated responses do not create another analytics event. |
| `restaurant_search_started`, `restaurant_search_completed`, `restaurant_search_failed`, `restaurant_search_unavailable` | Nearby/text mode, result count, request duration, provider errors, and missing configuration. Superseded/aborted searches do not count as failures. |
| `page_time_spent` | Foreground page-time segments with `screen_name`, `page_visit_id`, `duration_ms`, and `flush_reason`. |

The app still randomly chooses the tiebreak method when creating a group; **Firebase does not choose or manage the method**. `experiment_assigned` is just a custom record of that choice, not a Firebase A/B Testing integration. `tie_strategy` is the chosen group method, not necessarily the final resolution. `resolution_method` is `none` if the first ballot has a unique winner, `runoff` if the runoff has a unique winner, or `random` for a random draw. A tied runoff retains `tie_strategy=runoff` but reports `resolution_method=random` and `random_fallback=true`. Compare groups by their app-chosen method, then relate that to the latest happy/response totals and any separately gathered in-person feedback. Join to `experiment_assigned` by `group_id` to exclude explicit developer overrides (`assignment_source=explicit`) rather than random assignments.

#### Time spent on every application page

`page_time_spent` measures time while a page is **visible and focused**, across home, group_room, nominations, voting, results, login, signup, and profile. It pauses when hidden/unfocused, flushes on navigation/tab hiding, resumes after back-forward cache restoration, and checkpoints active visits every 30 seconds. Cleanup removes listeners/timers and does not count the same interval twice. This is foreground time, not proof of continuous interaction, and abrupt browser termination can still lose the final partial interval.

Sum `duration_ms` for each browser visitor and `page_visit_id` to obtain the visit's page time; average those visit totals per `screen_name`. Do not average heartbeat segments as though each were a separate visit. The matching `screen_view` includes the same visit ID. No GA custom dimensions, BigQuery linkage, or Analytics processing delay is needed.

Raw events are sent by the acting client **after a successful group commit**, never by snapshot listeners or inside a retry. Raw writes remain best-effort: networking, denied rules, or tab closure can lose them; failures are explicitly logged to the browser console. Per-group study counters/results are part of the room transaction, so those core results do not depend on the raw log succeeding. `recordedAt` is a Firestore server timestamp; decision durations and phase timestamps use client clocks and include waiting/idle time. Browser heartbeat writes have a cost (about two per foreground minute per tab), in addition to action events.

#### Keep developer tests separate from participant runs

The default run ID is **`developer_testing`**, including production builds. Before a real study, set this public build-time setting in your local/deployment environment and restart/rebuild:

```bash
NEXT_PUBLIC_STUDY_RUN_ID=pilot_01
```

Run IDs allow 1–80 letters, digits, underscores, or hyphens. Create fresh rooms after changing the run ID; existing room summaries keep their original immutable run. Use a new ID for each participant batch or study run. Filtering `studyRunId`/`study.runId` and environment excludes developer/legacy data without deleting anything or depending on an arbitrary date cutoff. Do not conduct later developer testing using the live participant-run deployment; use a separate run/environment. Browser visitor IDs persist across runs, while exported first/last-seen dates describe observations **within the selected run**, not a person's lifetime history.

#### Deployment and access

**Deploy the updated rules before the updated app**, because new room summaries require the optional `study` field and telemetry writes require the new collection rule. Rules remain compatible with older rooms. Using your locally authenticated Firebase CLI:

```bash
firebase login
firebase firestore:databases:list --project movie-voting-app-663bb
firebase firestore:databases:get '(default)' --project movie-voting-app-663bb
firebase deploy --only firestore:rules --project movie-voting-app-663bb
```

The implementation was validated against the **standard-edition local Firestore emulator**. The CLI was not authenticated to the cloud during this change, so the live database edition/rules were not inspected or deployed. No new cloud database was created.

Prototype event rules allow authenticated authors to create bounded records with their own UID and a server timestamp, deny all event edits/deletes, and restrict event reads to an externally granted `studyAnalyst` custom claim. IAM-authorized console/admin REST exports are separate and do not need this claim. Clients cannot grant themselves analyst access. New event names/parameter shapes must also be added to the event-specific rules validators; unsupported writes produce a browser-console warning. The existing class-prototype room rules still permit authenticated reads/writes of shared room documents; that pre-existing trust model is not a production confidentiality boundary. Client-reported study metrics are not tamper-proof. Review the rules/privacy policy before collecting real personal data or broadly sharing the app.

#### Reading data and making tables

In the Firebase console, inspect **Firestore Database > Data > study_events**, or a room's **study** map. For a repeatable export, use the [study exporter](scripts/export-study.mjs), which uses Firestore REST and needs **Google Cloud IAM read/query permission** (for example, Datastore Viewer). A Firebase web API key or ordinary participant login does not grant access to everyone else's telemetry. No private key needs to be shared with the assistant or put in the app.

With Google Cloud CLI installed and authorized locally:

```bash
gcloud auth login
npm run study:export -- --project movie-voting-app-663bb --run pilot_01
```

Alternatively, supply a short-lived OAuth token through `FIRESTORE_ACCESS_TOKEN` in the local terminal environment, never chat/client code. The Firebase CLI login used for deployment and the Google Cloud CLI login used for export are distinct. To save reports outside the repository, pass `--out /absolute/private/path/study-report`; its parent directory must already exist. Use `--database DATABASE_ID` for a non-default database.

The exporter filters by run on the server, paginates through all records, then filters by environment (`production` by default). It writes:

- `study-report.json`: raw selected event records and all derived tables.
- `study-report-groups.csv`: one row per room, including chosen/actual method, timings, pruning/tie counts, and current happy/unhappy/response counts.
- `study-report-methods.csv`: side-by-side randomized-group comparison; explicit developer strategy overrides remain in group rows but are excluded from these totals. Includes nonempty-pruning and completed-first-round tie rates, completion counts, decision time, and satisfaction totals.
- `study-report-pageVisits.csv`: summed foreground duration per browser/page visit, including zero-duration screen visits and grouping across guest-account upgrades.
- `study-report-visitors.csv`: first/last observations, session counts, and active dates within the run, for basic retention/activity tables. The JSON also contains event counts and browser/source context for custom breakdowns.

Pruning rate excludes evaluations with no nominations. Initial tie rate uses completed first rounds, not page views or individual votes. Decision averages use completed groups; incomplete groups remain visible separately. Satisfaction uses persisted latest responses, not a sum of repeated feedback events. Room summaries in the export omit names, addresses, nominations, and ballots; raw events still contain pseudonymous identifiers/browser metadata and must be treated as private research data. Default report filenames are ignored by Git. Future assistant analysis can use these exports or your authorized local reporting connection; it does not gain automatic access just because Firestore is used.

### Local testing

Firebase emulators provide local Auth and Firestore without touching the production project. Start them in one terminal:

```bash
npx -y firebase-tools@latest emulators:start --project demo-foodfinder --only auth,firestore
```

Start Next.js in another terminal:

```bash
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-foodfinder NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true NEXT_PUBLIC_STUDY_RUN_ID=local_demo npm run dev -- --port 3100
```

Open http://localhost:3100 and use a normal window plus an incognito window to represent separate guests. Create a group, add different nominations, mark ready, and vote. Keep every budget selected for the normal name-only flow; restricted budgets exercise the empty-shortlist/reset behavior until restaurant price data is supplied.

Regression tests live in [tests/](tests/), not the backend folder:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

With the emulators running, validate real snapshot delivery and concurrent voting transactions:

```bash
FIREBASE_PROJECT_ID=demo-foodfinder FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node --test tests/firestore.integration.mjs
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
