// Picture sizes, kept apart from the jobs that fetch them so both the sync and
// the assistant's tools can use this without dragging each other in.

/**
 * eBay serves the same photo at several sizes from one path -- s-l225 beside a
 * row of text, s-l1600 for anything bigger. The Browse API hands back the
 * thumbnail, and a person copying an image address out of a listing usually
 * gets s-l500; either one stretched over a 1080x1920 video ad is soft and
 * blocky. Same picture, same path, bigger file.
 *
 * Anything that isn't one of those sized paths is returned untouched.
 */
export function largestEbayImage(url) {
  return String(url || "").replace(/\/s-l\d+\.(jpg|jpeg|png|webp)(\?|$)/i, "/s-l1600.$1$2");
}
