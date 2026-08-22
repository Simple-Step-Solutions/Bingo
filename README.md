# Chamber Bingo

Chamber Bingo is a community engagement app built for local chambers of commerce. Players download the app, get a randomized bingo card filled with nearby businesses, and visit them in real life to complete their card. Each square has a task — buy a coffee, try a menu item, book a service — verified on-site by scanning a QR code or tapping an NFC tag. Complete a line, win a prize. Complete more, enter the raffle.

The goal is to get people off their phones and into local shops, while giving the chamber a measurable, gamified way to drive foot traffic across their member businesses.

Built by [Simple Step Solutions](https://www.simplestepsolutions.com) for the Hudson Valley Gateway Chamber of Commerce.

---

## How It Works

### For Players

1. Sign up and pick your town
2. Get a randomized bingo card — businesses from your town and surrounding areas
3. Visit a business and complete their task
4. Scan the QR code or tap the NFC tag at the business to verify your visit
5. Complete a row, column, or diagonal to get BINGO and claim your prize
6. Keep going to earn raffle entries

### For Businesses

Businesses get a QR code to print and display. When a player scans it on-site, the visit is verified and their bingo card updates automatically. Businesses with an NFC-enabled placard can also offer tap-to-verify.

### For the Chamber

The chamber controls everything through an admin panel:
- Add and manage participating businesses
- Configure board size, difficulty, and the free space
- Set bingo prizes and raffle rules
- Pick raffle winners randomly from eligible entries
- Broadcast notifications to all players
- Upload branding (logo, colors) that applies across the app instantly

---

## Features

- Randomized bingo boards per player, weighted by town and difficulty setting
- QR code scanning and NFC tap verification
- GPS proximity check — players must be at the business to verify
- Raffle entry system with configurable completion requirements
- Real-time notifications from the chamber to all players
- Interactive business map with filtering by town
- Progressive Web App - installable on iOS and Android. The app shell and
  cached data load without a connection; verifying a visit needs one.
- Role-based access: player, business, chamber, admin
- Branded per chamber — colors, logo, and chamber name are all configurable

---

## Tech

If you want to run this yourself:

**Stack:** React 19 + TypeScript, Vite 6, Tailwind CSS 4, Firebase (Firestore, Auth, Storage), Firebase Hosting

**Requirements:** Node.js 20+, a Firebase project with Firestore, Authentication (Google + Email), and Storage enabled

**Local setup:**

```bash
npm install
cp .env.example .env
# Fill in your Firebase config values from Firebase Console > Project Settings
npm run dev
```

**Deploy:** Push to `main`. GitHub Actions runs the gates (typecheck, rules
tests, function tests), then deploys hosting, functions and rules. Pull requests
run the gates without deploying.

**Docs:**
- [CLAUDE.md](CLAUDE.md) - architecture, the named-database gotcha, the security
  model, and the brand rules. Read this first.
- [Updating icons](docs/updating-icons.md)
- `firestore.rules` and `storage.rules` for the security rules, and
  `rules-tests/` for what they are asserted to do
- `.github/workflows/deploy.yml` for the pipeline

Secrets, CORS and custom-domain setup are configured in the Firebase console and
in GitHub repository secrets; there is no doc for them yet.

---

## License

Private. Built and maintained by [Simple Step Solutions](https://www.simplestepsolutions.com).
