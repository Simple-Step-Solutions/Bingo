import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inAppBrowser, platformOf, androidChromeIntent, iosSafariMajor } from './browserEnv';

// Real user agents. The iPhone Safari one is copied from our own Cloud Run logs
// on 11/24/2026 (iOS 26+ freezes the OS token at 18_7).
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1';
const IPHONE_SAFARI_18 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/158.0.0.0 Mobile/15E148 Safari/604.1';
const IPHONE_FACEBOOK = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/500.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.7;FBSS/3;FBCR/;FBID/phone;FBLC/en_US;FBOP/80]';
const IPHONE_MESSENGER = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/480.0.0.0;FBBV/1;FBDV/iPhone15,2;FBMD/iPhone;FBSN/iOS;FBSV/18.7]';
const IPHONE_INSTAGRAM = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 400.0.0.0 (iPhone15,2; iOS 18_7; en_US; en; scale=3.00; 1179x2556; 1)';
const IPHONE_GENERIC_WEBVIEW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Mobile Safari/537.36';
const ANDROID_FACEBOOK = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/158.0.0.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/500.0.0.0;]';
const ANDROID_INSTAGRAM = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/158.0.0.0 Mobile Safari/537.36 Instagram 400.0.0.0 Android';
const ANDROID_WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/158.0.0.0 Mobile Safari/537.36';
const ANDROID_SAMSUNG = 'Mozilla/5.0 (Linux; Android 14; SM-S921U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36';
const DESKTOP_EDGE = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36 Edg/158.0.0.0';

test('real browsers are not flagged as in-app', () => {
  for (const ua of [IPHONE_SAFARI, IPHONE_SAFARI_18, IPHONE_CHROME, ANDROID_CHROME, ANDROID_SAMSUNG, DESKTOP_EDGE]) {
    assert.equal(inAppBrowser(ua), null, ua);
  }
});

test('social app browsers are named so the message can say which app', () => {
  assert.equal(inAppBrowser(IPHONE_FACEBOOK), 'Facebook');
  assert.equal(inAppBrowser(ANDROID_FACEBOOK), 'Facebook');
  assert.equal(inAppBrowser(IPHONE_MESSENGER), 'Messenger');
  assert.equal(inAppBrowser(IPHONE_INSTAGRAM), 'Instagram');
  assert.equal(inAppBrowser(ANDROID_INSTAGRAM), 'Instagram');
});

test('unnamed embedded browsers are still caught', () => {
  assert.equal(inAppBrowser(ANDROID_WEBVIEW), 'app');
  assert.equal(inAppBrowser(IPHONE_GENERIC_WEBVIEW), 'app');
});

test('an installed iPhone app looks like a bare WebView but is not one', () => {
  // Home screen web apps on iOS drop the Safari token from the user agent.
  assert.equal(inAppBrowser(IPHONE_GENERIC_WEBVIEW, { standalone: true }), null);
});

test('platform', () => {
  assert.equal(platformOf(IPHONE_SAFARI), 'ios');
  assert.equal(platformOf(IPHONE_INSTAGRAM), 'ios');
  assert.equal(platformOf(ANDROID_FACEBOOK), 'android');
  assert.equal(platformOf(DESKTOP_EDGE), 'other');
  // iPadOS 13+ reports as a Mac; touch points separate it.
  const ipad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15';
  assert.equal(platformOf(ipad, 5), 'ios');
  assert.equal(platformOf(ipad, 0), 'other');
});

test('Safari version, for picking which Share button instructions to show', () => {
  assert.equal(iosSafariMajor(IPHONE_SAFARI), 27);
  assert.equal(iosSafariMajor(IPHONE_SAFARI_18), 18);
  assert.equal(iosSafariMajor(IPHONE_CHROME), null);
});

test('Android open-in-Chrome link keeps the path and query, including the invite', () => {
  assert.equal(
    androidChromeIntent('https://bingo.simplestepsolutions.com/?invite=abc123&hint=a%40b.co'),
    'intent://bingo.simplestepsolutions.com/?invite=abc123&hint=a%40b.co#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fbingo.simplestepsolutions.com%2F%3Finvite%3Dabc123%26hint%3Da%2540b.co;end',
  );
});
