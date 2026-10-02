import assert from "node:assert/strict";
import test from "node:test";
import { isAutomatedVisit } from "../api/_lib/bots.js";

// A click is only worth counting if a person made it. Getting this wrong in
// either direction misleads: count crawlers and one Facebook post looks like
// 33 clicks in three minutes; drop people and real traffic vanishes. The
// person cases matter most, because the obvious shortcuts ("facebook", "bot")
// silently throw real visitors away.

const visit = (ua, method = "GET") => ({ method, headers: { "user-agent": ua } });

const PEOPLE = {
  "Chrome on Windows":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "Safari on iPhone":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  "the Facebook app on iPhone":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.106;FBDV/iPhone15,2;FBSN/iOS;FBSV/17.5;FBLC/en_US]",
  "the Facebook app on Android":
    "Mozilla/5.0 (Linux; Android 14; SM-S918U Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/127.0.6533.103 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/477.0.0.49.83;]",
  "the X app on iPhone":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone/10.54",
  "the Snapchat app":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Snapchat/13.10.0.40 (like Safari/8618.2.12.10.4, panda)",
  "a CUBOT phone, whose model name contains 'bot'":
    "Mozilla/5.0 (Linux; Android 12; CUBOT KINGKONG 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
};

const SOFTWARE = {
  "Facebook's link-preview crawler": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  "Meta's newer crawler": "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)",
  "Facebot": "Facebot",
  "X's preview crawler": "Twitterbot/1.0",
  "LinkedIn's preview crawler": "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
  "WhatsApp's link preview": "WhatsApp/2.23.20.0 A",
  "Slack's link expander": "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
  "Discord's preview": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
  "Telegram's preview": "TelegramBot (like TwitterBot)",
  "Pinterest's crawler": "Pinterest/0.2 (+https://www.pinterest.com/bot.html)",
  "Googlebot": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
  "curl": "curl/8.4.0",
  "python-requests": "python-requests/2.31.0",
  "headless Chrome": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
};

for (const [who, ua] of Object.entries(PEOPLE)) {
  test(`counts ${who} as a person`, () => {
    assert.equal(isAutomatedVisit(visit(ua)), false);
  });
}

for (const [what, ua] of Object.entries(SOFTWARE)) {
  test(`does not count ${what}`, () => {
    assert.equal(isAutomatedVisit(visit(ua)), true);
  });
}

test("does not count a visit with no user agent at all", () => {
  assert.equal(isAutomatedVisit({ method: "GET", headers: {} }), true);
  assert.equal(isAutomatedVisit(visit("   ")), true);
});

test("does not count a HEAD request, even from a real browser's user agent", () => {
  // Link checkers probe with HEAD; a person's browser never does.
  assert.equal(isAutomatedVisit(visit(PEOPLE["Chrome on Windows"], "HEAD")), true);
});

test("survives a missing request or headers object without throwing", () => {
  assert.equal(isAutomatedVisit(undefined), true);
  assert.equal(isAutomatedVisit({}), true);
});
