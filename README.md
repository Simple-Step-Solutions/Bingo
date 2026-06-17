# Chamber Bingo

A progressive web app for the Hudson Valley Gateway Chamber of Commerce. Players visit local businesses to complete bingo cards, earn raffle entries, and explore the community.

Built by [Simple Step Solutions](https://www.simplestepsolutions.com).

---

## Stack

- **Frontend:** React 19, TypeScript, Vite 6, Tailwind CSS 4
- **Backend:** Firebase (Firestore, Auth, Storage)
- **Hosting:** Firebase Hosting
- **CI/CD:** GitHub Actions

---

## Local Development

**Prerequisites:** Node.js 20+

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Copy the env example and fill in your Firebase config:
   ```bash
   cp .env.example .env
   ```
   Values are in Firebase Console > Project Settings > Your apps.

3. Start the dev server:
   ```bash
   npm run dev
   ```
   Runs at `http://localhost:3000`.

> **Note:** Firebase Storage uploads will fail from localhost unless you apply the CORS config (see below).

---

## Firebase Setup

### Storage CORS

Run once to allow uploads from localhost and production:

```bash
gsutil cors set cors.json gs://sss-hvgcc-bingo.firebasestorage.app
```

If you don't have `gsutil` locally, paste the contents of `cors.json` into Google Cloud Shell at [console.cloud.google.com](https://console.cloud.google.com) and run the command there.

### Firestore & Storage Rules

Rules are in `firestore.rules` and `storage.rules`. Deploy via Firebase CLI:

```bash
firebase deploy --only firestore:rules,storage
```

Or paste them manually in the Firebase Console.

---

## Deployment

Push to `main` and the GitHub Actions workflow deploys automatically to Firebase Hosting.

**Required GitHub Actions secrets** (Settings > Secrets and variables > Actions):

| Secret | Source |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase Console > Project Settings > Your apps |
| `VITE_FIREBASE_AUTH_DOMAIN` | same |
| `VITE_FIREBASE_PROJECT_ID` | same |
| `VITE_FIREBASE_STORAGE_BUCKET` | same |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | same |
| `VITE_FIREBASE_APP_ID` | same |
| `VITE_FIREBASE_DATABASE_ID` | same |
| `FIREBASE_SERVICE_ACCOUNT` | Firebase Console > Project Settings > Service accounts > Generate new private key (paste full JSON) |

The app deploys to `https://sss-hvgcc-bingo.web.app` by default. Custom domain is configured in Firebase Console > Hosting > Add custom domain.

---

## PWA Icons

The manifest currently uses `sss-logo.png` as a placeholder. Before launch, generate proper icons:

1. Go to [pwabuilder.com/imageGenerator](https://www.pwabuilder.com/imageGenerator)
2. Upload the app icon (192x192 and 512x512 PNGs)
3. Drop them into `public/icons/` as `icon-192.png` and `icon-512.png`
4. Update the icon paths in `vite.config.ts`

---

## Roles

| Role | Access |
|---|---|
| `player` | Bingo board, map, raffle |
| `business` | Player access + business check-in dashboard |
| `chamber` | Business access + admin panel (chamber manager, game master) |
| `admin` | Full access including system settings |

---

## Project ID

`sss-hvgcc-bingo`
