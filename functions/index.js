const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const TYPE_TITLES = {
  info: 'Chamber Bingo',
  win: 'We have a winner!',
  raffle: 'Raffle Update',
  game: 'Game Update',
};

exports.sendPushOnNotification = onDocumentCreated('notifications/{notificationId}', async (event) => {
  const notification = event.data.data();
  if (!notification) return;

  const db = getFirestore();
  const messaging = getMessaging();

  const title = TYPE_TITLES[notification.type] || 'Chamber Bingo';
  const body = notification.message;

  // Gather FCM tokens from all users (or just the target user)
  let usersSnap;
  if (notification.userId === 'all') {
    usersSnap = await db.collection('users').where('fcmTokens', '!=', null).get();
  } else {
    usersSnap = await db.collection('users').where('__name__', '==', notification.userId).get();
  }

  const tokens = [];
  usersSnap.forEach(doc => {
    const { fcmTokens } = doc.data();
    if (Array.isArray(fcmTokens)) tokens.push(...fcmTokens);
  });

  if (tokens.length === 0) return;

  // Send in batches of 500 (FCM limit)
  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));

  await Promise.all(
    chunks.map(chunk =>
      messaging.sendEachForMulticast({
        tokens: chunk,
        notification: { title, body },
        webpush: {
          notification: { icon: 'https://bingo.simplestepsolutions.com/icons/icon-192.png' },
          fcmOptions: { link: 'https://bingo.simplestepsolutions.com/' },
        },
      }).then(response => {
        // Clean up invalid tokens
        const toRemove = [];
        response.responses.forEach((resp, i) => {
          if (!resp.success && (resp.error?.code === 'messaging/invalid-registration-token' || resp.error?.code === 'messaging/registration-token-not-registered')) {
            toRemove.push(chunk[i]);
          }
        });
        if (toRemove.length > 0) {
          const batch = db.batch();
          usersSnap.forEach(userDoc => {
            const { fcmTokens } = userDoc.data();
            if (!Array.isArray(fcmTokens)) return;
            const cleaned = fcmTokens.filter(t => !toRemove.includes(t));
            if (cleaned.length !== fcmTokens.length) {
              batch.update(userDoc.ref, { fcmTokens: cleaned });
            }
          });
          return batch.commit();
        }
      })
    )
  );
});
