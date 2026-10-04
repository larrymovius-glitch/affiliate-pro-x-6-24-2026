import { connectedNetworkIds } from "./affiliateNetworks.js";

// The three things a new user has to do before the app can earn them
// anything. Every new signup so far stopped before step 2 -- none made a
// single link -- so the dashboard leads with these until they're done.
//
// Each step is checked from real data, never ticked by hand, so the list
// can't claim progress that isn't there.
export function startHereSteps({ user, links = [] }) {
  const networkJoined = connectedNetworkIds(user).size > 0;
  const linkMade = links.length > 0;
  // Shared = something actually reached the outside: a link is on the public
  // share page, or a link has been clicked.
  const shared = links.some((l) => l.bio_featured_at || (l.clicks || 0) > 0);

  return [
    { id: "network", done: networkJoined },
    { id: "link", done: linkMade },
    { id: "share", done: shared },
  ];
}

export function startHereComplete(steps) {
  return steps.every((s) => s.done);
}
