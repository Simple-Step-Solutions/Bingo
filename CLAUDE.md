# Chamber Bingo

A React 19 + Vite + Tailwind 4 + Firebase PWA for the Hudson Valley Gateway
Chamber of Commerce. Players get a randomised board of member businesses, visit
them in person, scan a QR or NFC code to verify, and win prizes plus raffle
entries.

## Things that will silently cost you a day

**The Firestore database is NAMED, not `(default)`.**
`ai-studio-b22a3d46-2072-4ec8-b7cc-b2370d5fdd10`. Anything that omits it reads
and writes an empty `(default)` database with **no error and no log line**, so
the code appears to work perfectly while touching nothing.

- Client: `initializeFirestore(app, {...}, databaseId)` in `src/firebase.ts`
- Functions: always `db()` from `functions/lib/db.js`, never a bare
  `getFirestore()`
- Rules deploys: `firebase.json` uses the **array** form with an explicit
  `database` key. Do not collapse it back to the single-object form.
- Scripts: require `FIRESTORE_DATABASE_ID` and refuse to run without it

**Cloud Functions live in `us-east1`.** The default is `us-central1`, and
calling a function that is not there fails with a bare 404 that reads like the
function does not exist. It must match in the definition and in
`getFunctions(app, 'us-east1')`.

**Storage rules can only read the `(default)` database.** User documents are not
there, so any `firestore.get()` in `storage.rules` is authorising against
nothing.

## Security model

Roles come from a **custom claim**, projected from `users/{uid}.role` by the
`syncRoleClaims` trigger. The document stays the human-editable source of truth;
rules read the claim.

- `player` is the **absence** of a claim. Rules default an absent claim to
  player, which is why no backfill was needed for existing players.
- Rules currently accept **claim or document** (dual trust). This is deliberate
  and temporary, because the PWA caches its own JavaScript and users are still
  signed in with tokens minted before the trigger existed. Removing the fallback
  early locks chamber staff out of the admin panel.
- **Rules cannot check token revocation**, so a demotion takes up to an hour to
  reach them. This is asserted in the rules tests so nobody "fixes" it there.
  Anything where that hour matters belongs in a callable, which checks
  `tokensValidAfterTime`.

Everything security-relevant is a callable. The client cannot write
`completions`, `boards`, `invites`, `business_secrets`, or `code_index` at all.

**Business codes are unguessable and the player never receives one.** They live
in `business_secrets/{id}`; `code_index/{sha256(code)}` maps hash to business and
is readable by nobody. Do not put `qrCode` or `nfcId` back on the public
`businesses` document — the rules reject writes that carry either. Legacy
`CHAMBER_<id>` codes stay active in `code_index` because they are on printed
posters already in the field.

**Be honest about the geofence.** Passing coordinates to a callable is not
cryptographically stronger than checking them in the browser; both trust a
number the client chose. What it buys is that the check cannot be *skipped*, and
that every attempt is recorded. No browser scheme can prove physical presence.
The posture is unguessable codes plus `reviewSuspiciousActivity` and a human
adjudicating before prizes are handed out.

## Brand

- Colours: `#1695B2` teal (primary), `#CC5500` orange (accent)
- Fonts: Montserrat (body/UI), Lora (headings), self-hosted via
  `@fontsource-variable` so they stay in the Workbox precache
- **No em dashes** in UI copy or documentation

## Commands

```
npm run dev            # vite, port 3000
npm run lint           # tsc --noEmit, with noUnusedLocals
npm run build
npm run test:functions # pure logic, no emulator
npm run test:rules     # needs a JRE on PATH; otherwise it runs in CI
```

`npm run test:rules` starts the Firestore emulator, which is a Java process. If
there is no JRE on this machine, push and let CI run it.

## CI

`.github/workflows/deploy.yml`. Gates (lint, rules tests, function tests) run on
**every** pull request regardless of base branch, because security work ships as
a stack of PRs that target each other. Deploys are gated on
`github.event_name != 'pull_request'` and only run on push to `main`.

A skipped job renders as a green build, so a gate that never runs looks
identical to one that passes.
