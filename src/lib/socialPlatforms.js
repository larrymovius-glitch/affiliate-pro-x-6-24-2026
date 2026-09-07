// Catalog of social platforms a user can advertise on from /social-connect.
// These are the manual, copy-paste ones. Instagram is the exception and is not
// served by this list: it has a real OAuth flow now (api/instagramConnect.js ->
// api/instagramCallback.js) for the shared house account, rendered separately
// by src/components/social/InstagramConnect.jsx. Its card stays here for the
// posting guide, which is still useful for Stories and Reels the API cannot
// publish. The rest have no self-serve connect flow -- see the note in
// api/postToLinkedIn.js, and src/api/base44Client.js's
// `connectors.connectAppUser`, which always throws.
// Rather than a fake "Connect" button that silently does nothing, every
// platform gets the same honest treatment Facebook/Pinterest already had:
// a real link to go set the account up (or manage an existing one), plus a
// copy-paste posting guide, plus a shortcut into AI post generation.
export const SOCIAL_PLATFORMS = [
  {
    id: "instagram",
    name: "Instagram",
    url: "https://www.instagram.com",
    color: "linear-gradient(135deg, #E4405F, #FCAF45)",
    guide: [
      "Go to instagram.com and open your business or creator profile",
      "Create a new post or Reel",
      "Paste the AI-generated caption",
      "Add your affiliate link in your bio link (Instagram doesn't allow clickable links in captions) -- \"link in bio\"",
      "Include #ad or #affiliate in the caption",
      "Post to your feed or Story",
    ],
    tip: "Tip: Reels get more reach than static posts right now -- consider turning the ad copy into a short script.",
  },
  {
    id: "facebook",
    name: "Facebook",
    url: "https://www.facebook.com",
    color: "#1877F2",
    guide: [
      "Go to facebook.com",
      "Create a new post",
      "Paste the AI-generated content",
      "Add your affiliate link",
      "Include #ad or #affiliate disclosure",
      "Post to your timeline or relevant groups",
    ],
    tip: "Tip: Post to relevant Facebook groups for maximum reach. Always disclose affiliate links with #ad.",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    url: "https://www.linkedin.com",
    color: "linear-gradient(135deg, #0A66C2, #0077B5)",
    guide: [
      "Go to linkedin.com and open your profile",
      "Click \"Start a post\"",
      "Paste the AI-generated content",
      "Add your affiliate link",
      "Include #ad or #affiliate disclosure",
      "Post, and consider sharing to relevant groups",
    ],
    tip: "Tip: LinkedIn rewards native text posts over external links -- put the link in a comment for better reach.",
  },
  {
    id: "pinterest",
    name: "Pinterest",
    url: "https://www.pinterest.com",
    color: "#E60023",
    guide: [
      "Go to pinterest.com",
      "Click \"Create Pin\"",
      "Upload an image (use \"My Creatives\" in AutoPilot)",
      "Add the AI-generated description",
      "Add your affiliate link in \"Destination link\"",
      "Choose a relevant board and publish",
    ],
    tip: "Tip: Pinterest pins have a long shelf-life. Create evergreen content that drives traffic for months.",
  },
  {
    id: "tiktok",
    name: "TikTok",
    url: "https://www.tiktok.com",
    color: "linear-gradient(135deg, #000000, #25F4EE)",
    guide: [
      "Go to tiktok.com and open your account",
      "Film or upload a short video using the AI-generated script as your hook and talking points",
      "Add the AI-generated caption",
      "Add your affiliate link in your bio link (TikTok doesn't allow clickable links in captions for most accounts)",
      "Include #ad or #affiliate in the caption",
      "Post",
    ],
    tip: "Tip: Say the hook in the first 2 seconds -- TikTok's algorithm rewards videos that keep people watching.",
  },
  {
    id: "twitter",
    name: "X (Twitter)",
    url: "https://twitter.com",
    color: "#000000",
    guide: [
      "Go to twitter.com (x.com)",
      "Click \"Post\"",
      "Paste the AI-generated content",
      "Add your affiliate link directly in the post",
      "Include #ad or #affiliate disclosure",
      "Post, and consider a short reply thread for context",
    ],
    tip: "Tip: A tight hook in the first line matters more here than almost anywhere else -- most people never expand a post.",
  },
  {
    id: "youtube",
    name: "YouTube",
    url: "https://www.youtube.com",
    color: "#FF0000",
    guide: [
      "Go to youtube.com and open YouTube Studio",
      "Upload a video or Short using the AI-generated script",
      "Paste the AI-generated description",
      "Add your affiliate link at the top of the description",
      "Include #ad or an affiliate disclosure in the description",
      "Publish",
    ],
    tip: "Tip: Pin a comment with the link too -- most viewers never open the description.",
  },
  {
    id: "threads",
    name: "Threads",
    url: "https://www.threads.net",
    color: "#000000",
    guide: [
      "Go to threads.net and open your profile",
      "Tap the compose button",
      "Paste the AI-generated content",
      "Add your affiliate link directly in the post",
      "Include #ad or #affiliate disclosure",
      "Post",
    ],
    tip: "Tip: Threads favors conversational, reply-friendly posts over polished promo copy.",
  },
  {
    id: "reddit",
    name: "Reddit",
    url: "https://www.reddit.com",
    color: "#FF4500",
    guide: [
      "Go to reddit.com and find a relevant, on-topic subreddit -- check its rules for self-promotion first",
      "Create a text post (not a raw link post -- those get removed more often)",
      "Adapt the AI-generated content into something genuinely useful, not just an ad",
      "Disclose that you're an affiliate before linking",
      "Add your affiliate link only where the subreddit's rules allow it",
      "Post, and engage with any replies",
    ],
    tip: "Careful: Reddit is the strictest platform here about self-promotion -- a post that reads as an ad often gets removed and can get an account banned. Lead with value.",
  },
  {
    id: "snapchat",
    name: "Snapchat",
    url: "https://www.snapchat.com",
    color: "#FFFC00",
    guide: [
      "Go to snapchat.com and open your account",
      "Create a Snap or Story using the AI-generated script as your talking points",
      "Add your affiliate link as a Story link/swipe-up (requires a public profile with linking enabled)",
      "Include #ad or #affiliate disclosure on-screen",
      "Post to your Story",
    ],
    tip: "Tip: Snapchat's audience skews younger and expects casual, unpolished video -- don't over-produce it.",
  },
];

export function socialPlatformById(id) {
  return SOCIAL_PLATFORMS.find((p) => p.id === id) || null;
}
