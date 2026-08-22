const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { FieldValue } = require('firebase-admin/firestore');
const logger = require('firebase-functions/logger');

const { db, callableOpts } = require('./lib/db');
const { generateCode, normalizeCode, hashCode } = require('./lib/codes');
const { requireRole, writeAudit } = require('./lib/guards');

/**
 * Business verification codes, split across three documents:
 *
 *   businesses/{id}        public profile. No code, no nfcId.
 *   business_secrets/{id}  the printable code, readable by chamber and the owner
 *   code_index/{sha256}    hash -> businessId. Admin SDK only, nobody can read it.
 *
 * The player never receives a code by any path. Dashboard no longer resolves
 * codes at all; it hands the scanned string to verifyVisit and the server
 * decides.
 */

const writeCodePair = async (businessId, { rotate }) => {
  const secretRef = db().collection('business_secrets').doc(businessId);
  const existing = await secretRef.get();

  if (existing.exists && !rotate) {
    return { code: existing.data().code, created: false };
  }

  const code = generateCode();
  const normalized = normalizeCode(code);
  const hash = hashCode(normalized);

  const indexRef = db().collection('code_index').doc(hash);
  if ((await indexRef.get()).exists) {
    // 80 bits: this does not happen. If it somehow does, fail loudly rather
    // than silently pointing one code at two businesses.
    throw new HttpsError('internal', 'Code collision. Try again.');
  }

  const batch = db().batch();

  // Retire the previous code so a rotated poster stops working the moment the
  // new one is printed. Deactivated rather than deleted, so a scan of an old
  // poster can be told apart from a scan of a code that never existed.
  if (existing.exists && existing.data().codeHash) {
    batch.set(db().collection('code_index').doc(existing.data().codeHash),
      { active: false, retiredAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  batch.set(indexRef, {
    businessId,
    type: 'static',
    active: true,
    createdAt: FieldValue.serverTimestamp(),
  });

  batch.set(secretRef, {
    businessId,
    code,
    codeHash: hash,
    nfcId: existing.exists ? (existing.data().nfcId || null) : null,
    rotatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await batch.commit();
  return { code, created: true };
};

/** Issue or rotate one business's code. */
exports.provisionBusinessCode = onCall(callableOpts(), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'chamber');
  const { businessId, rotate } = request.data || {};

  if (typeof businessId !== 'string' || !businessId) {
    throw new HttpsError('invalid-argument', 'businessId is required.');
  }
  const bizSnap = await db().collection('businesses').doc(businessId).get();
  if (!bizSnap.exists) throw new HttpsError('not-found', 'No such business.');

  const result = await writeCodePair(businessId, { rotate: rotate === true });

  if (result.created) {
    await writeAudit({
      actorUid: uid,
      actorEmail: (profile && profile.email) || '',
      actorRole: role,
      action: rotate ? 'rotate_business_code' : 'provision_business_code',
      targetUid: businessId,
      details: { businessName: bizSnap.data().name },
    });
  }

  return result;
});

/**
 * Rotate every code at once. Run this the morning of the event so every code
 * that leaked during setup and testing dies before the first player scans.
 *
 * Admin only. A chamber account issuing one code is routine; invalidating every
 * printed poster in the county is not.
 */
exports.rotateAllCodes = onCall(callableOpts({ timeoutSeconds: 540 }), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'admin');

  const bizSnap = await db().collection('businesses').get();
  const results = [];
  let failed = 0;

  for (const doc of bizSnap.docs) {
    try {
      const r = await writeCodePair(doc.id, { rotate: true });
      results.push({ businessId: doc.id, name: doc.data().name, code: r.code });
    } catch (err) {
      failed += 1;
      logger.error('rotateAllCodes failed for business', { businessId: doc.id, error: err.message });
    }
  }

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: 'rotate_all_codes',
    targetUid: 'ALL',
    details: { rotated: results.length, failed },
  });

  return { rotated: results.length, failed, results };
});

/**
 * Attach or replace an NFC tag serial for a business.
 *
 * NFC serials are not secret -- anyone with a phone can read one off a tag --
 * so they are treated as a second lookup key rather than as a credential. The
 * geofence and the on-your-board check are what actually gate a completion.
 */
exports.setBusinessNfc = onCall(callableOpts(), async (request) => {
  const { uid, role, profile } = await requireRole(request, 'chamber');
  const { businessId, nfcId } = request.data || {};

  if (typeof businessId !== 'string' || !businessId) {
    throw new HttpsError('invalid-argument', 'businessId is required.');
  }
  const bizSnap = await db().collection('businesses').doc(businessId).get();
  if (!bizSnap.exists) throw new HttpsError('not-found', 'No such business.');

  const secretRef = db().collection('business_secrets').doc(businessId);
  const existing = await secretRef.get();
  const previous = existing.exists ? existing.data().nfcId : null;

  const batch = db().batch();

  if (previous) {
    batch.set(db().collection('code_index').doc(hashCode(normalizeCode(previous))),
      { active: false, retiredAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  if (nfcId) {
    if (typeof nfcId !== 'string' || nfcId.length > 128) {
      throw new HttpsError('invalid-argument', 'That does not look like an NFC serial.');
    }
    batch.set(db().collection('code_index').doc(hashCode(normalizeCode(nfcId))), {
      businessId,
      type: 'nfc',
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  batch.set(secretRef, { businessId, nfcId: nfcId || null }, { merge: true });
  await batch.commit();

  await writeAudit({
    actorUid: uid,
    actorEmail: (profile && profile.email) || '',
    actorRole: role,
    action: nfcId ? 'set_business_nfc' : 'clear_business_nfc',
    targetUid: businessId,
    details: { businessName: bizSnap.data().name },
  });

  return { ok: true };
});
