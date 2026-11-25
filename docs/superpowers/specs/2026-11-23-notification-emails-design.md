# Notification emails

Approved by Logan, 11/23/2026.

## Intent

Notifications only reach people in the app's bell or as a phone push, and only
if they allowed push. Staff miss "someone asked to manage X" until they next
open the admin panel, and an owner whose claim was approved may not find out.
Copy the bell to email for anything addressed to one person.

## Goals

- Every notification whose `userId` is one account also goes to that
  account's email.
- Today that covers: claim requests waiting (to every chamber and admin
  account), and claim decisions (to the business owner).
- Anything addressed to one person later gets email with no extra work.

## Non-goals and anti-goals

- **Broadcasts (`userId: 'all'`) are never emailed.** They stay bell and
  push. Emailing every player is bulk mail: it needs opt-in and unsubscribe,
  and SES production access was granted for transactional mail.
- No digest, preferences or unsubscribe for now. These are one-off
  transactional messages about the recipient's own account.
- An anti-goal: emailing anyone twice for one notification.

## Approaches

- **A. Copy the bell with a trigger (picked).** A function on new
  `notifications` documents emails the one recipient. Logan: "copy the bell
  then, if it's the same lift." It covers future alerts for free and keeps
  the mailer account's permissions small.
- **B. Explicit email calls where alerts are created.** This could name the
  requester in staff mail, but those callables would need to run as the
  mailer account, and that account would then need permission to change
  user roles. The blast radius is too big. Rejected.

## Design

- **Trigger:** `emailNotification`, `onDocumentCreated('notifications/{id}')`,
  on the named database, us-east1, running as
  `bingo-invite-mailer@sss-hvgcc-bingo` (the only account AWS trusts).
- **Skips:** `userId` missing or `'all'`, no user document, or no email (it
  checks the user document's `email`, then the Auth record).
- **Idempotent:** it creates `notification_emails/{notificationId}` in a
  transaction before sending, so a redelivered event sends nothing. A failed
  send is recorded and can be retried.
- **Email:** from "Chamber Bingo" at `invites@bingo.simplestep.solutions`,
  since the AWS policy allows only that address. Reply-To is
  info@hvgatewaychamber.com. The subject is the same title as the push
  (`TYPE_TITLES`). The body is the message text, escaped, plus a button to
  the app (`/admin` for staff, `/` for everyone else). No attachment.
- **Shared mailer:** the SES and Google-to-AWS token code moves from
  `inviteMail.js` to `lib/mailer.js`. Invites and notifications use it, and
  the attachment is optional.
- **Google IAM (project only):** the mailer account gets
  `roles/eventarc.eventReceiver` and `roles/run.invoker`, both needed by a
  database-triggered function running as a custom account. Nothing changes
  in AWS.
- **Rules:** `notification_emails` has no client access (default deny).

## Testing

- Unit tests for the pure parts: the skip rules, subject and link choice,
  and escaping.
- After deploy: create one notification for Logan's admin account only, then
  confirm it reaches his inbox and that a second delivery doesn't resend.

## Left to the builder

The email's exact layout and wording beyond the above.
