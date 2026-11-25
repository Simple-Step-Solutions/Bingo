# Notification Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email every notification that is addressed to one person, and never email broadcasts.

**Architecture:** Pull the SES send and the Google-to-AWS credential code out of `functions/inviteMail.js` into `functions/lib/mailer.js`. Pure rules for which notifications to email, and what to put in them, live in `functions/lib/notificationEmail.js`. A Firestore trigger in `functions/notificationMail.js` runs as the mailer service account and uses both.

**Tech Stack:** Node 22, firebase-functions v5 (v2 triggers), @aws-sdk/client-sesv2, @aws-sdk/client-sts, google-auth-library, nodemailer, node:test.

**Spec:** `docs/superpowers/specs/2026-11-23-notification-emails-design.md`

## Global Constraints

- Named Firestore database: always `db()` from `functions/lib/db.js`, and triggers pass `database: databaseId`.
- Region `us-east1` for every function. SES region `us-east-1`.
- The trigger runs as `bingo-invite-mailer@sss-hvgcc-bingo.iam.gserviceaccount.com`, the only account the AWS role trusts.
- From: `Chamber Bingo <invites@bingo.simplestep.solutions>`. The AWS policy allows no other address.
- Reply-To: `info@hvgatewaychamber.com`.
- Never email `userId: 'all'`.
- No em dashes in copy, comments or docs.

## Review Focus

- A notification whose `userId` is `'all'`, missing, empty, or not a string sends nothing.
- A recipient with no user document, or no email on the document or the Auth record, is skipped and logged, not thrown.
- A redelivered create event for the same notification sends no second email.
- Message text containing `<`, `&` or quotes is escaped in the HTML.
- A staff recipient (chamber or admin) gets a button to `/admin`. Everyone else gets `/`.

---

### Task 1: Shared mailer, with invites moved onto it

**Files:**
- Create: `functions/lib/mailer.js`
- Modify: `functions/inviteMail.js` (remove `googleIdToken`, `federatedCredentials`, `sesClient`, `composer`, `sendOne` and their constants, and import from the mailer)

**Interfaces:**
- Produces: `sendMail({ fromName: string, to: string, cc?: string, subject: string, text: string, html: string, attachments?: Array<{filename, content: Buffer, contentType}> }) => Promise<string|null>`, which returns the SES MessageId. Also `MAILER_SA: string` and `FROM_ADDRESS = 'invites@bingo.simplestep.solutions'`. Reply-To is always `info@hvgatewaychamber.com`.
- Consumes: nothing new.

- [ ] **Step 1:** Move the code as-is (keep the google-auth-library ID token with its IAM fallback, the STS exchange, and the nodemailer raw build) and make the `from` name a parameter. `inviteMail.js` calls `sendMail({ fromName: 'Hudson Valley Gateway Chamber', ..., attachments: [howTo] })` and uses `MAILER_SA` for its `serviceAccount`.
- [ ] **Step 2:** Run `cd functions && npm test`. Expect 42 passing, and `FIRESTORE_DATABASE_ID=x node -e "require('./index.js')"` loads.
- [ ] **Step 3:** Commit `refactor: share the SES mailer between invites and notifications`.

### Task 2: Pure notification-email rules

**Files:**
- Create: `functions/lib/notificationEmail.js`
- Test: `functions/test/notificationEmail.test.js`

**Interfaces:**
- Produces: `shouldEmail(notification) => boolean`, which is true only for a non-empty string `userId` that isn't `'all'`. Also `buildNotificationEmail({ notification, role }) => { subject, text, html }`. The subject comes from `TYPE_TITLES` (info `Chamber Bingo`, win `We have a winner!`, raffle `Raffle Update`, game `Game Update`, default `Chamber Bingo`). The body is the message, escaped, plus a button: `https://bingo.simplestepsolutions.com/admin` when role is `chamber` or `admin`, otherwise `https://bingo.simplestepsolutions.com/`. Move `TYPE_TITLES` here and import it in `functions/index.js`.

- [ ] **Step 1: Write the failing tests**
  - `shouldEmail` is false for `{userId:'all'}`, `{}`, `{userId:''}` and `{userId:42}`, and true for `{userId:'abc'}`.
  - The subject for `type:'win'` is `We have a winner!`, and for an unknown type it's `Chamber Bingo`.
  - Role `chamber` gets `/admin` in the html, and role `business` doesn't.
  - A message `<b>&"` appears as `&lt;b&gt;&amp;&quot;` in the html, and the text keeps it raw.
- [ ] **Step 2:** Run `npm test` and expect the new tests to fail (module missing).
- [ ] **Step 3:** Implement. Reuse `escapeHtml` from `lib/inviteLetter.js`.
- [ ] **Step 4:** Run `npm test` and expect everything to pass.
- [ ] **Step 5:** Commit `feat: rules for which notifications get emailed`.

### Task 3: The trigger

**Files:**
- Create: `functions/notificationMail.js`
- Modify: `functions/index.js` (export `emailNotification`)

**Interfaces:**
- Consumes: `sendMail` and `MAILER_SA` (Task 1), and `shouldEmail` and `buildNotificationEmail` (Task 2).
- Produces: `exports.emailNotification = onDocumentCreated({ document: 'notifications/{notificationId}', database: databaseId, region: 'us-east1', serviceAccount: MAILER_SA, maxInstances: 5 }, handler)`.

- [ ] **Step 1:** In the handler:
  - Return early if `!shouldEmail(n)`.
  - Read `users/{userId}`. The email is the document's `email`, else `getAuth().getUser(userId).email`. If neither exists, log at info level and return.
  - Claim `notification_emails/{notificationId}` in a transaction (`status: 'sending'`). If it exists and isn't `failed`, return.
  - Send, then set `status: 'sent'` with `messageId` and `sentAt`. On error, set `status: 'failed'` with `error` (500 characters max), log it, and don't rethrow.
- [ ] **Step 2:** Run `npm test` and the `index.js` load check.
- [ ] **Step 3:** Commit `feat: email notifications addressed to one person`.

### Task 4: Permissions, deploy and live check

- [ ] **Step 1:** Grant the mailer account, at project level in `sss-hvgcc-bingo`, `roles/eventarc.eventReceiver` and `roles/run.invoker`.
- [ ] **Step 2:** Open a PR, wait for green CI, merge, and watch the `deploy-functions` job succeed.
- [ ] **Step 3:** With the Admin SDK, add one notification `{userId: <Logan admin uid>, type: 'info', message: 'Test: notification emails are working.', timestamp: <ISO>, createdBy: 'system'}`. Check that it arrives in Logan's Gmail with an `/admin` button, and that `notification_emails/{id}` shows `sent`. Then delete that notification.
