/**
 * Get new versions of the app to people without them having to close it.
 *
 * The service worker (registerType autoUpdate) installs a new version and
 * takes over by itself, but the page that is already open keeps running the
 * old JavaScript until it reloads. A PWA on a phone can stay "open" for days.
 *
 * So: look for a new version every half hour and whenever the app comes back
 * to the foreground, and when a new version has taken over, reload at a moment
 * nobody notices. That is right away if the app is in the background, or else
 * the next time it comes back to the foreground. Never in the middle of
 * something, such as scanning a code at a counter.
 */

const CHECK_EVERY_MS = 30 * 60 * 1000;

export const watchForUpdates = () => {
  if (!('serviceWorker' in navigator)) return;

  // A first install also fires controllerchange; only a replacement should reload.
  const hadController = !!navigator.serviceWorker.controller;
  let pendingReload = false;
  let reloading = false;

  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (document.visibilityState === 'hidden') reload();
    else pendingReload = true;
  });

  const check = () => {
    navigator.serviceWorker.getRegistration()
      .then((reg) => reg?.update())
      .catch(() => { /* offline or between deploys; try again later */ });
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && pendingReload) {
      reload();
      return;
    }
    if (document.visibilityState === 'visible') check();
  });

  window.setInterval(check, CHECK_EVERY_MS);
};
