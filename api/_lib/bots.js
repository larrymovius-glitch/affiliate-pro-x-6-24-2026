// Tells a person apart from software visiting a /r/ link.
//
// Every request used to count as a click. Posting one link to Facebook sent 20
// "clicks" through in a single minute and 33 that day -- Facebook's preview
// crawler fetching it to draw the link card, several times over -- while the
// visits that plausibly were people (arriving from facebook.com) numbered six.
// Counts that size mislead about what is working.
//
// The list names crawlers exactly rather than matching words like "bot" or
// "facebook", because the obvious shortcuts catch real people:
//   - someone tapping a link inside the Facebook app sends FBAN / FB_IAB;
//     that is a person, and only facebookexternalhit / Facebot /
//     meta-external* are the crawler;
//   - the X, LinkedIn, Pinterest and Snapchat apps likewise name themselves
//     in their in-app browsers, which carry people;
//   - a bare /bot/ would match phone models such as CUBOT.
//
// Software that disguises itself as a browser still gets through. This is for
// honest counts, not fraud detection.
const AUTOMATED_AGENTS = new RegExp(
  [
    // Link previews in social and chat apps
    "facebookexternalhit", "facebot", "meta-external(?:agent|fetcher)",
    "twitterbot", "linkedinbot", "slackbot", "slack-imgproxy", "discordbot",
    "telegrambot", "whatsapp/", "skypeuripreview", "redditbot", "vkshare",
    "pinterestbot", "pinterest\\.com/bot", "embedly", "iframely",
    // Search engines
    "googlebot", "google-inspectiontool", "adsbot-google", "bingbot",
    "bingpreview", "applebot", "duckduckbot", "yandex(?:bot|images)",
    "baiduspider",
    // Scripts and headless browsers
    "headlesschrome", "^curl/", "^wget/", "python-requests", "go-http-client",
    "node-fetch", "axios/",
  ].join("|"),
  "i"
);

/**
 * True when a request to a tracked link came from software rather than a
 * person. Such visits are still redirected -- a link preview is drawn by
 * following the link -- but must not be counted as clicks.
 *
 * @param {{ method?: string, headers?: Record<string, string | string[] | undefined> }} req
 */
export function isAutomatedVisit(req) {
  // Link checkers probe with HEAD; a person's browser never does.
  if (String(req?.method || "").toUpperCase() === "HEAD") return true;
  const agent = req?.headers?.["user-agent"];
  const ua = String(Array.isArray(agent) ? agent[0] : agent || "").trim();
  // Every real browser sends a user agent; an empty one is a script.
  if (!ua) return true;
  return AUTOMATED_AGENTS.test(ua);
}
