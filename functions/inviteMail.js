const { onCall, HttpsError } = require('firebase-functions/v2/https');
const logger = require('firebase-functions/logger');
const { FieldValue } = require('firebase-admin/firestore');
const fs = require('node:fs');
const path = require('node:path');
const nodemailer = require('nodemailer');
const { SESv2Client, SendEmailCommand } = require('@aws-sdk/client-sesv2');
const { STSClient, AssumeRoleWithWebIdentityCommand } = require('@aws-sdk/client-sts');
const { GoogleAuth } = require('google-auth-library');

const { db, callableOpts } = require('./lib/db');
const { requireRole, writeAudit } = require('./lib/guards');
const { issueInvite } = require('./invites');
const {
  DEFAULT_SUBJECT, DEFAULT_LETTER, letterProblem, renderLetter, pickRecipients,
} = require('./lib/inviteLetter');

/**
 * The launch invites: the chamber's letter, each business's own sign-up link,
 * and the How-To PDF, sent through Amazon SES.
 *
 * SES lives in AWS account 485867726406, us-east-1, sending as the verified
 * domain bingo.simplestep.solutions (Easy DKIM, MAIL FROM bounce.bingo...).
 * A subdomain, so nothing here touches mail for simplestep.solutions itself.
 *
 * Replies go to the chamber, not to us: Reply-To and CC are the chamber's
 * info@ address, as agreed with Julia on the 11/18 call.
 */

/*
 * No stored AWS keys. This function runs as its own service account, and AWS
 * trusts Google as an identity provider: the function asks the metadata server
 * for a Google ID token for that account and trades it with STS for one-hour
 * credentials on the role below. The role's trust policy accepts only this
 * account's unique ID with audience sts.amazonaws.com, and its permissions
 * (and permissions boundary) allow nothing but sending as invites@.
 */
const MAILER_SA = 'bingo-invite-mailer@sss-hvgcc-bingo.iam.gserviceaccount.com';
const SES_ROLE_ARN = 'arn:aws:iam::485867726406:role/chamber-bingo-ses-sender';
const TOKEN_AUDIENCE = 'sts.amazonaws.com';
const googleAuth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

const SES_REGION = 'us-east-1';
const FROM = { name: 'Hudson Valley Gateway Chamber', address: 'invites@bingo.simplestep.solutions' };
const CHAMBER_INBOX = 'info@hvgatewaychamber.com';
const APP_URL = 'https://bingo.simplestepsolutions.com';
const ATTACHMENT_NAME = 'HowToChamberBingo_2026.pdf';
const LETTER_DOC = 'inviteLetter';

// Read once per instance. Bundled with the function so a send never depends
// on a Storage download working at that moment.
let pdf;
const howToPdf = () => {
  if (!pdf) pdf = fs.readFileSync(path.join(__dirname, 'assets', ATTACHMENT_NAME));
  return pdf;
};

const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });

/**
 * A Google ID token for MAILER_SA, audience sts.amazonaws.com.
 *
 * Fallback: the IAM Credentials API's generateIdToken, called with the
 * account's ordinary access token. The mailer account holds
 * roles/iam.serviceAccountOpenIdTokenCreator on itself only.
 */
const googleIdToken = async () => {
  // Google's own client first: it is what Firestore uses here, and it talks
  // to the metadata server correctly. Hand-rolled fetch() calls to the
  // metadata server got 404s in production.
  try {
    const client = await googleAuth.getIdTokenClient(TOKEN_AUDIENCE);
    return await client.idTokenProvider.fetchIdToken(TOKEN_AUDIENCE);
  } catch (err) {
    logger.warn('Direct ID token failed, trying IAM Credentials', { err: err.message });
  }

  const accessToken = await googleAuth.getAccessToken();
  if (!accessToken) throw new Error('No Google access token for the mailer account');

  const idRes = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${MAILER_SA}:generateIdToken`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience: TOKEN_AUDIENCE, includeEmail: false }),
    },
  );
  if (!idRes.ok) {
    const detail = (await idRes.text()).slice(0, 300);
    throw new Error(`IAM refused an ID token (${idRes.status}): ${detail}`);
  }
  return (await idRes.json()).token;
};

/**
 * A credential provider. The SDK caches what it returns and calls it again
 * shortly before the expiration, so a long-lived instance keeps working.
 */
const federatedCredentials = async () => {
  const sts = new STSClient({ region: SES_REGION });
  const { Credentials: c } = await sts.send(new AssumeRoleWithWebIdentityCommand({
    RoleArn: SES_ROLE_ARN,
    RoleSessionName: 'chamber-bingo-invites',
    WebIdentityToken: await googleIdToken(),
    DurationSeconds: 3600,
  }));
  return {
    accessKeyId: c.AccessKeyId,
    secretAccessKey: c.SecretAccessKey,
    sessionToken: c.SessionToken,
    expiration: c.Expiration,
  };
};

let ses;
const sesClient = () => {
  if (!ses) ses = new SESv2Client({ region: SES_REGION, credentials: federatedCredentials });
  return ses;
};

/** Build the MIME message and hand it to SES. Returns the SES message id. */
const sendOne = async ({ to, cc, subject, text, html }) => {
  const { message } = await composer.sendMail({
    from: FROM,
    to,
    cc: cc || undefined,
    replyTo: CHAMBER_INBOX,
    subject,
    text,
    html,
    attachments: [{ filename: ATTACHMENT_NAME, content: howToPdf(), contentType: 'application/pdf' }],
  });
  const res = await sesClient().send(new SendEmailCommand({
    FromEmailAddress: `${FROM.name} <${FROM.address}>`,
    Destination: { ToAddresses: [to], CcAddresses: cc ? [cc] : [] },
    Content: { Raw: { Data: message } },
  }));
  return res.MessageId || null;
};

const loadLetter = async () => {
  const snap = await db().collection('settings').doc(LETTER_DOC).get();
  const data = snap.exists ? snap.data() : {};
  return {
    subject: typeof data.subject === 'string' && data.subject.trim() ? data.subject : DEFAULT_SUBJECT,
    letter: typeof data.letter === 'string' && data.letter.trim() ? data.letter : DEFAULT_LETTER,
    saved: snap.exists,
  };
};

const loadRecipients = async () => {
  const [bizSnap, secretSnap, ownerSnap, sentSnap] = await Promise.all([
    db().collection('businesses').get(),
    db().collection('business_secrets').get(),
    db().collection('users').where('role', '==', 'business').get(),
    db().collection('invite_sends').where('status', '==', 'sent').get(),
  ]);
  const businesses = bizSnap.docs.map((d) => ({ id: d.id, name: d.data().name || d.id, email: d.data().email || '' }));
  const loginEmails = Object.fromEntries(secretSnap.docs.map((d) => [d.id, d.data().loginEmail || '']));
  const ownedIds = new Set(ownerSnap.docs.map((d) => d.data().businessId).filter(Boolean));
  const sentIds = new Set(sentSnap.docs.map((d) => d.id));
  return pickRecipients({ businesses, loginEmails, ownedIds, sentIds });
};

/**
 * Claim a business for this send. A transaction, so two presses of the button
 * (or two chamber staff at once) cannot both email the same business. A
 * previous failure can be retried; a success or an in-flight send cannot.
 */
const claimSend = async (businessId, email, uid) => {
  const ref = db().collection('invite_sends').doc(businessId);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.data().status !== 'failed') return false;
    tx.set(ref, { businessId, email, status: 'sending', startedAt: FieldValue.serverTimestamp(), sentBy: uid });
    return true;
  });
};

/**
 * One callable, three modes:
 *   preview  who would get it, who is skipped and why, and the saved letter
 *   test     the letter to the caller's own address, with a dummy link
 *   send     the real thing, to every business preview listed
 *
 * The letter always comes from settings/inviteLetter, which the dialog saves
 * before calling, so what the chamber previewed is exactly what goes out.
 */
exports.sendInvites = onCall(callableOpts({
  serviceAccount: MAILER_SA,
  timeoutSeconds: 540,
  maxInstances: 2,
}), async (request) => {
  const { uid, role: actorRole, profile, auth } = await requireRole(request, 'chamber');
  const mode = (request.data && request.data.mode) || 'preview';
  if (!['preview', 'test', 'send'].includes(mode)) {
    throw new HttpsError('invalid-argument', 'Unknown mode.');
  }

  const { subject, letter, saved } = await loadLetter();
  const actorEmail = (profile && profile.email) || auth.token.email || '';

  if (mode === 'preview') {
    const { send, skipped } = await loadRecipients();
    return { subject, letter, saved, send, skipped };
  }

  const problem = letterProblem({ subject, letter });
  if (problem) throw new HttpsError('failed-precondition', problem);

  if (mode === 'test') {
    if (!auth.token.email) throw new HttpsError('failed-precondition', 'Your account has no email address to send a test to.');
    // No link: the sample marker shows where each business's link will sit.
    const { text, html } = renderLetter({ letter, link: null, businessName: 'Sample Business' });
    try {
      await sendOne({ to: auth.token.email, subject: `[TEST] ${subject}`, text, html });
    } catch (err) {
      logger.error('Test invite failed', { err: err.message, name: err.name });
      throw new HttpsError('internal', `The test email did not send: ${err.message}`);
    }
    await writeAudit({
      actorUid: uid, actorEmail, actorRole, action: 'test_invite_email', targetUid: 'n/a',
      details: { to: auth.token.email },
    });
    return { ok: true, to: auth.token.email };
  }

  // mode === 'send'
  const { send, skipped } = await loadRecipients();
  const results = [];
  for (const r of send) {
    if (!(await claimSend(r.id, r.email, uid))) {
      results.push({ id: r.id, name: r.name, email: r.email, status: 'skipped', error: 'Already sent or sending' });
      continue;
    }
    const ref = db().collection('invite_sends').doc(r.id);
    try {
      const { token, inviteId, expiresAt } = await issueInvite({
        role: 'business', businessId: r.id, businessName: r.name, emailHint: r.email, uid, profile,
      });
      const { text, html } = renderLetter({ letter, link: `${APP_URL}/?invite=${token}`, businessName: r.name });
      const messageId = await sendOne({ to: r.email, cc: CHAMBER_INBOX, subject, text, html });
      await ref.set({
        status: 'sent', sentAt: FieldValue.serverTimestamp(), messageId, inviteId, expiresAt,
      }, { merge: true });
      results.push({ id: r.id, name: r.name, email: r.email, status: 'sent' });
    } catch (err) {
      logger.error('Invite email failed', { businessId: r.id, err: err.message, name: err.name });
      await ref.set({ status: 'failed', error: String(err.message || err).slice(0, 500), failedAt: FieldValue.serverTimestamp() }, { merge: true });
      results.push({ id: r.id, name: r.name, email: r.email, status: 'failed', error: err.message });
    }
  }

  const sentCount = results.filter((r) => r.status === 'sent').length;
  const failedCount = results.filter((r) => r.status === 'failed').length;
  await writeAudit({
    actorUid: uid, actorEmail, actorRole, action: 'send_invite_emails', targetUid: 'n/a',
    details: { sent: sentCount, failed: failedCount, skipped: skipped.length, subject },
  });

  return { results, sent: sentCount, failed: failedCount, skipped };
});
