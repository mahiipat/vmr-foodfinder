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

Group-state backend logic is in [backend/AppBackend.ts](backend/AppBackend.ts). Firebase initialization stays in [backend/firebase.js](backend/firebase.js). Screens call the exported helpers directly. Next.js API routes proxy restaurant-provider requests only; there is no Admin SDK or separate backend service.

### Behavior and scope

- Firebase client transactions persist group membership, nominations, readiness, ballots, results, and feedback.
- `subscribeRoomState` uses Firestore `onSnapshot` directly on the room document. There is no polling or HTTP round trip. Its cleanup function detaches the listener.
- The UI shows only a member's nominations before voting; all eligible contenders appear when voting starts. **This is prototype UI filtering, not a confidentiality boundary:** authenticated clients with a room ID can read the underlying shared document, including other nominations and preferences. Do not store sensitive information in rooms.
- Removing a nomination preserves it if another member still nominates the same restaurant. Preference changes reset readiness. If all ready members have no eligible contenders, everyone becomes not-ready and receives the reask message.
- Groups get a 50/50 random/runoff strategy at creation unless `createGroup` receives an explicit `tieStrategy`. Random ties finalize a tied winner; runoff ties open one fresh single-choice ballot using the existing voting screen. A second tie falls back to random. Results remain stored in Firestore.
- Login/signup are optional. Guests use anonymous Firebase identities. The homepage shows registered users their name, My profile, and Log out instead of Log in/Sign up. Registered users join rooms automatically with saved defaults; guests enter a name. The profile screen saves budget/distance defaults through the same `profiles/{uid}` data used by group joining. The results screen's satisfaction buttons persist feedback and show group response totals. Profiles prefill new membership without overwriting later room edits. User-facing errors use plain language rather than SDK error messages/codes.
- Restaurant search uses Google Places for nearby suggestions and detailed cards (photos, ratings, address, map, and website). Typed searches retain the Google/Yelp fallback endpoint when the richer Places search is unavailable. Set `GOOGLE_PLACES_API_KEY` and optionally `YELP_API_KEY` in the server environment; never prefix these keys with `NEXT_PUBLIC_`. Enable Places API (New) for the Google key. Without provider configuration, members can still add name-only nominations.
- Selected Places metadata is saved through the same room transaction as nominations; it does not use the PR's older subcollection backend. Name-only nominations have unknown price, rating, and distance. Unknown prices are eligible only when everyone leaves all budget ranges selected. Known Google price levels use the PR's budget mapping.
- Dietary needs are optional room preferences. Yelp categories provide advisory labels, not allergen guarantees: missing tags remain "unknown" and never remove restaurants. Changing dietary needs preserves nominations and resets readiness. Existing version-2 rooms without dietary fields remain supported.
- Distance filtering is deferred, but the original location-permission button, manual address input, and distance preference controls are restored unchanged from commit `754347a`. They save preferences without calling a geocoding service; saved location/distance preferences do not block voting. Separately, restaurant search geocodes the group's city/ZIP and labels straight-line distances from that center. A member's saved coordinates take precedence when displaying their nominated restaurants' distances.
- Existing version-2 groups remain compatible. Pre-sprint groups with the old format require recreation.

### Firebase setup

Use the existing public web configuration in [backend/firebase.js](backend/firebase.js). Enable **Anonymous** Authentication for guests; enable **Email/Password** only if testing the optional account forms. The homepage navigation links to `/login` and `/signup`. No Admin/service-account credential or environment file is required.

If live group creation returns `auth/configuration-not-found`, Firebase Authentication has not been initialized for the project associated with the configured API key. Open [Firebase Authentication](https://console.firebase.google.com/project/movie-voting-app-663bb/authentication), click **Get started**, then enable **Anonymous** under **Sign-in method**. Enable **Email/Password** for login/signup. Anonymous sign-in supplies guest IDs automatically; it does not require users to create accounts. If Auth is already initialized in your intended project, compare its web app configuration in Project settings with the configuration in [backend/firebase.js](backend/firebase.js). Enabling Firestore or running the emulator does not enable live Authentication.

[firebase.json](firebase.json) selects [firestore.rules](firestore.rules) and local emulator ports. The prototype rules permit authenticated room reads/writes, validate the room shape, and restrict account profiles to their owners. They intentionally do not isolate members' fields within shared room documents. Review them before using real user data.

The rules file is not automatically deployed. To use it on the real Firebase project, run this yourself:

```bash
npx -y firebase-tools@latest deploy --only firestore:rules --project YOUR_PROJECT
```

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
