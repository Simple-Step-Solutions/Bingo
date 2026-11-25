/**
 * What kind of browser is this page running in?
 *
 * The one that matters most is the in-app browser: tapping a link inside
 * Facebook, Instagram or Messenger opens it in that app's own embedded browser,
 * not Safari or Chrome. Google refuses to sign anyone in there (its
 * "disallowed_useragent" block), Android never offers to install the app from
 * one, and anything saved there is lost when the player later opens the real
 * browser. The Chamber shares the bingo link on social media, so this is where
 * a lot of first visits land.
 *
 * Pure functions of the user agent so they can be tested without a browser.
 */

export type Platform = 'ios' | 'android' | 'other';

const NAMED: [RegExp, string][] = [
  // Messenger carries FBAN too, so it must be checked first.
  [/FBAN\/Messenger|MessengerForiOS|Orca-Android|FB_IAB\/Orca/i, 'Messenger'],
  [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, 'Facebook'],
  [/Instagram/i, 'Instagram'],
  [/Threads/i, 'Threads'],
  [/musical_ly|BytedanceWebview|TikTok/i, 'TikTok'],
  [/Snapchat/i, 'Snapchat'],
  [/LinkedInApp/i, 'LinkedIn'],
  [/Pinterest/i, 'Pinterest'],
  [/\bLine\//i, 'LINE'],
  [/Twitter|XApp/i, 'X'],
];

export const platformOf = (ua: string, maxTouchPoints = 0): Platform => {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports as a Mac; the touch points separate them.
  if (/Macintosh/i.test(ua) && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
};

/**
 * The app name when this is an embedded in-app browser, 'app' when it is one
 * we cannot name, null for a real browser.
 *
 * `standalone` must be passed for iOS: a home screen web app drops the Safari
 * token from its user agent, which otherwise looks exactly like a bare WebView.
 */
export const inAppBrowser = (ua: string, opts: { standalone?: boolean } = {}): string | null => {
  for (const [re, name] of NAMED) if (re.test(ua)) return name;

  // Android WebView marks itself with "; wv)".
  if (/Android/i.test(ua) && /;\s*wv\)/i.test(ua)) return 'app';

  // iOS: every real browser (Safari, Chrome, Edge, Firefox) includes "Safari/".
  // A WKWebView embedded in some other app does not.
  if (/iPhone|iPad|iPod/i.test(ua) && !/Safari\//i.test(ua) && !opts.standalone) return 'app';

  return null;
};

/** Safari's major version on iOS, or null for other iOS browsers. */
export const iosSafariMajor = (ua: string): number | null => {
  if (!/iPhone|iPad|iPod|Macintosh/i.test(ua)) return null;
  if (/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua)) return null;
  const m = ua.match(/Version\/(\d+)/);
  return m ? Number(m[1]) : null;
};

/**
 * An intent:// link that opens the page in Chrome from inside an Android in-app
 * browser, falling back to the plain URL if Chrome is not installed.
 */
export const androidChromeIntent = (href: string): string => {
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=${url.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
};

/** The current page as seen in a browser right now. */
export const currentBrowser = () => {
  const ua = navigator.userAgent;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  return {
    ua,
    standalone,
    platform: platformOf(ua, navigator.maxTouchPoints),
    inApp: inAppBrowser(ua, { standalone }),
    safariMajor: iosSafariMajor(ua),
  };
};
