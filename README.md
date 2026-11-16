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

### Analytics and app-chosen tiebreak comparisons

Analytics still collects the original events and standard GA4 user activity, engagement, acquisition/source, retention, and technical/device data. Device category, OS/version, browser/platform, and screen resolution remain available as supported by the browser, consent settings, and GA4; detailed device model information can be limited on the web. No collection is disabled for the purpose of excluding developer history from reports. Emulators and server-side rendering still do not send analytics.

Before initializing Analytics, `setDefaultEventParameters` attaches `analytics_version=2`, `study_cohort=study_20261116`, `app_environment` (`production`, `development`, or `test`), and `app_version` to subsequent SDK events, **including automatic events**. Explicit custom events also receive these parameters. `app_version` comes from the package manifest (bump it for a new application release); it is separate from the analytics schema version. Register it as a custom dimension for web reports. These labels do not change standard GA4 acquisition/device collection or retroactively label historical events.

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

The earlier instrumentation draft omitted `returning_member` and `selected_restaurant_id` and only emitted first joins; those original contracts are restored. Some successful-write events moved from screen handlers to the transaction wrapper to prevent duplicate reporting, without removing their original event names.

Group lifecycle events also carry an opaque `group_id`, a comparison label `experiment_id=tie_strategy_v1`, the app-chosen `tie_strategy` (`random` or `runoff`), `round`, `phase`, member/nomination/candidate counts, elapsed seconds since group creation, and the dietary-pruning policy. No member names, group names, addresses, coordinates, search text, or full ballots are included in these custom parameters. The original `selected_restaurant_id` is retained; name-only nomination IDs can contain a restaurant's name, so never put personal information in nominations. GA4 still collects its standard device/page metadata.

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

GA4 already calculates standard engagement time. Additionally, `page_time_spent` explicitly measures time while a page is **visible and focused**, across home, group_room, nominations, voting, results, login, signup, and profile. It pauses when hidden/unfocused, flushes on navigation/tab hiding, resumes after back-forward cache restoration, and checkpoints active visits every 30 seconds. Cleanup removes listeners/timers and does not count the same interval twice. This is foreground time, not proof of continuous interaction, and abrupt browser termination can still lose the final partial interval.

Sum `duration_ms` for each `page_visit_id` to obtain the visit's page time; average those visit totals per `screen_name`. Do not average individual heartbeat segments as though each were a separate visit. The matching `screen_view` includes the same visit ID. This custom metric intentionally does **not** populate `engagement_time_msec`, so it does not double-count GA4's native engagement metric. Register `screen_name` as an event-scoped dimension and `duration_ms` as a custom time metric in milliseconds; do not register high-cardinality `page_visit_id` as a dimension.

Group events are emitted by the acting client **after a successful Firestore commit**, never by a snapshot listener or inside a transaction retry. No room schema, security rules, experiment allocation, or realtime mechanism changed. Analytics remains best-effort: blocked scripts, offline clients, or closing a tab immediately after a write can lose events. Timing uses client clocks and includes waiting/idle time; it is approximate wall-clock time, not active screen time. Subtract/join `voting_started` and `decision_completed` timestamps for voting duration, and `runoff_started` and `decision_completed` for tiebreak duration. No historical events are backfilled.

#### Ignore the earlier test data

Until a different actual study start is provided, the reporting cutoff is this follow-up request: **November 15, 2026 at 8:53:20.605 PM EST** (`2026-11-16T01:53:20.605Z`). Existing Analytics data is **not deleted or reset**, and all original event collection remains enabled. New group events label rooms created before that instant as `group_cohort=legacy`; later rooms use `group_cohort=study_20261116`.

To exclude developer history from **all metrics and events**, set the report/exploration date range to the actual study period. Date filters apply to automatic and custom events, without changing what is collected. If the study starts November 16 in the GA4 property's timezone, starting the report on that date excludes all earlier calendar days. Standard date-range filters work at calendar-day granularity and cannot express this request's precise mid-day boundary. For that exact boundary, query the BigQuery export with:

```sql
WHERE event_timestamp >= UNIX_MICROS(TIMESTAMP('2026-11-16T01:53:20.605Z'))
```

For data collected with this deployed version, additionally filter `study_cohort=study_20261116` and `app_environment=production` once those custom dimensions are registered. The default cohort label now also reaches automatic SDK events; earlier automatic data has no label. Do not apply `group_cohort` globally to activity/acquisition/device reports, since only group lifecycle events have it. Use `group_cohort=study_20261116` for the group-comparison report to exclude old rooms. No report filters or custom definitions have been applied to the live GA4 property from this workspace yet. The code cannot recover missing measurements between the cutoff and deployment or reclassify older events.

A timestamp or production build alone cannot distinguish future developer testing on the live site from participant use. Exclude known internal traffic in report comparisons/segments, or agree on a fresh study cohort at the actual start. Do not activate destructive data-exclusion filters merely to hide historical tests. Filtering a reporting period also does not reset a developer browser's existing GA identity/first-visit date; retention and acquisition still use GA4's normal identity and attribution rules.

In **GA4 Admin > Custom definitions**, create event-scoped dimensions for `study_cohort`, `group_cohort`, `app_environment`, `app_version`, `screen_name`, `experiment_id`, `tie_strategy`, `assignment_source`, `resolution_method`, and `random_fallback`; add custom metrics for `duration_ms`, `decision_seconds`, `elapsed_seconds`, `pruned_count`, and `eligible_count` as needed. New definitions can take 24–48 hours to appear. Do not register high-cardinality `group_id` as a custom dimension; use it in BigQuery instead. Use DebugView/Realtime to check events after deployment.

Useful per-variant report columns are group count, completion rate, nonempty shortlist evaluations, all-pruned count/rate, completed first rounds, first-round tie count/rate, runoff count, random-fallback count, mean/median decision time, and final satisfaction. Pruning rate is `all_choices_pruned / nonempty shortlist_evaluated` (attempt-based); initial tie rate is first-round ties divided by completed first rounds (`round=0`), not ties divided by page views or votes. Compute time statistics over completed groups and report incomplete groups separately. For final satisfaction, take the latest feedback event per group and use its `happy_count`/`response_count`, rather than summing cumulative totals or counting changed replies as new respondents.

#### Reading data and making tables

The app's Firebase web configuration permits event collection, **not reporting access**. Tables can be generated from an uploaded CSV/JSON export, an authorized [GA4 Data API](https://developers.google.com/analytics/devguides/reporting/data/v1) connection, or an authorized [BigQuery export](https://firebase.google.com/docs/projects/bigquery-export). No reporting credentials or cloud configuration were added by this change.

No secret API key is needed to configure a report in the browser. Provide the numeric **GA4 Property ID** (GA4 Admin > Property details, not the `G-...` measurement ID) and share a signed-in Analytics browser with the appropriate access. Reading reports requires access to the property; property-level custom definitions/report customization require Editor-level access. Alternatively, authorize the Google Analytics Data API with your own OAuth login or an appropriately permitted service account through local credentials. Never paste passwords, access tokens, or service-account private keys into chat or the app's client environment. A Firebase web API key cannot read Analytics reports. Uploaded report exports are sufficient when no direct connection is desired.

For raw group-level A/B analysis, link Analytics to BigQuery through **Firebase Project settings > Integrations > BigQuery** (or GA4's BigQuery link). Enable export before collecting study data; do not rely on historical backfill. BigQuery retains event parameters without requiring GA4 custom definitions and supports exact timestamp filtering, group joins, medians, and latest-response summaries. GA4 reporting generally needs registered custom definitions for these parameters. Authorized read/query permissions are required; do not put service-account credentials into client code or commit them. BigQuery storage/queries may incur charges beyond free limits.

### Local testing

Firebase emulators provide local Auth and Firestore without touching the production project. Start them in one terminal:

```bash
npx -y firebase-tools@latest emulators:start --project demo-foodfinder --only auth,firestore
```

Start Next.js in another terminal:

```bash
NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-foodfinder NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true npm run dev -- --port 3100
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
