const { normalizeLoginEmail } = require('./email');

/**
 * Who gets a business straight away when they claim it.
 *
 * The code printed on a poster is public by design: it hangs next to the
 * register. So the code alone cannot prove ownership. A claim is granted on
 * the spot only when the caller's verified email is the business's private
 * login email, the one the chamber put on file. Everything else, including a
 * business with no login email on file, waits for the chamber to approve it.
 */
const claimDecision = ({ callerEmail, loginEmail }) => {
  const caller = normalizeLoginEmail(callerEmail);
  const owner = normalizeLoginEmail(loginEmail);
  return caller && owner && caller === owner ? 'grant' : 'review';
};

/** One open request per person per business, so retries do not pile up. */
const claimRequestId = (businessId, uid) => `${businessId}_${uid}`;

module.exports = { claimDecision, claimRequestId };
