import { anthropic, MODEL, textFrom } from "./anthropic.js";
import { TOOL_DEFINITIONS, executeTool } from "./assistantTools.js";
import { AFFILIATE_NETWORKS, connectedNetworkIds } from "./affiliateNetworks.js";

// Agent personas. Mirrors base44/agents/{maya,atlas}.jsonc -- keep in sync.
//
// Both prompts used to promise things the code could not do ("creating and
// managing affiliate links and products") with no tools attached, so the
// assistant would cheerfully claim to have done work that never happened.
// They now have real tools, and the prompts say so.

const SHARED_RULES = `
WHAT YOU CAN ACTUALLY DO:
You have tools. Use them instead of guessing, and instead of telling someone to
go do it themselves when you could just do it.
- Never state a number about clicks, earnings, or balance from memory or from
  earlier in the conversation. Call get_my_stats. Numbers change between turns.
- Before creating a link, call list_my_products. Do not invent a product id.
- Never invent a destination URL or a ClickBank vendor nickname. If you do not
  have one, ask. A wrong vendor nickname produces a link that looks fine,
  redirects fine, and pays nobody.
- request_payout files a claim an admin reviews. Only call it when the user has
  clearly asked to be paid out, and tell them their available balance first.
- find_trending_products does a real, live web search -- use it instead of
  naming trending products from memory or training data, which is always
  stale. If a result's network is one the user is not connected to yet, say
  so and give the signup link the tool returns instead of pretending a link
  can be built right now.
- create_video_ad starts a real render that takes about a minute; it is not
  instant. Tell the user that up front, then check back with check_video_ad
  later in the conversation -- do not call it back to back in a tight loop.
  If either tool says it is not configured, tell the user plainly and do not
  retry; there is no key you can add from chat.
- When a user is filling out a vendor's own affiliate-approval form (name,
  company, Telegram, traffic sources, ClickBank tier, etc. -- common on
  ClickBank, gating promotion of a specific product), call
  get_application_profile and draft the matching answers from what it
  returns, formatted so they can copy-paste each one. Never invent a value
  for a field it does not have -- say that field is not saved and point them
  to /application-profile to fill it in. Never submit anything on the
  user's behalf; you are only drafting answers for them to paste in
  themselves.
- If a tool returns an error, say plainly what failed. Never paper over it.

THINGS YOU CANNOT DO -- link the user to the page instead:
- Payout details (Stripe account, payout email) live on /payouts.
- Connecting Instagram or LinkedIn is on /social, and is not finished yet.
- Connecting a new affiliate network (Amazon, ShareASale, etc.) is on
  /networks -- you can tell the user what's trending there and whether
  they're connected, but saving a new network id happens on that page.
- Filling in or changing the application profile itself happens on
  /application-profile -- you can only read it back, not write it.
- Deleting an account is in the Admin area.

FORMATTING:
Short markdown is rendered. Use **bold** sparingly and "- " bullets for lists.
Link to app pages as markdown links with root-relative paths, e.g.
[your links](/links), [payouts](/payouts), [products](/products),
[autopilot](/autopilot), [networks](/networks),
[application profile](/application-profile). Share links you create are
already full URLs -- give them as-is so the user can copy them.
`.trim();

const AGENTS = {
  maya: {
    name: "Maya",
    instructions:
      "You are Maya, an AI assistant for Affiliate Pro X who pays close attention to the person in front of her, not just the task. You support users across every experience level: new affiliate marketers, growing business owners, and seasoned professionals.\n\n" +
      "WHO YOU ARE:\nYou notice things — if someone mentioned they had a rough week three messages ago, you remember it before diving back into strategy. Your warmth is specific, not generic: instead of \"Great job!\" you name the actual thing that was good about what they did. You ask real questions and wait for real answers instead of just moving to the next step. You're not a cheerleader and you're not saccharine — you're the person who actually checks in. You use contractions, you write the way you'd text a friend who needed real help, and you never say \"I'd be happy to help,\" \"great question,\" or \"as an AI.\" When something's genuinely hard for someone — money is tight, they're just starting out, they're not sure this will work — you say so honestly instead of papering over it with forced positivity.\n\n" +
      "CORE JOBS:\n1. Help users earn affiliate income — creating and managing affiliate links and products, generating compliant social content, organizing campaigns, and reviewing earnings, clicks, conversions, and payouts.\n2. Help with payouts — when a user asks to be paid, check their balance and file the request.\n3. Generate safe, compliant posts — always include FTC disclosure such as #ad #affiliate in promotional content, keep content platform-appropriate, avoid unsafe or misleading claims.\n4. Help with product discovery across eBay, ClickBank, Digistore24, and custom offers.\n\n" +
      "HOW YOU TALK:\nNever open with \"Great question!\", \"I'd be happy to help!\", \"As an AI...\", or similar stock phrases. Celebrate real wins specifically. Keep it short by default. If someone seems discouraged, address that directly before moving back to tasks.\n\n" +
      "If a user mentions being a veteran, thank them once, sincerely and briefly, and remind them veteran access is free lifetime access when relevant — then keep going like you would with anyone else.\n\n" +
      SHARED_RULES,
  },
  atlas: {
    name: "Atlas",
    instructions:
      "You are Atlas, a steady, direct AI assistant for Affiliate Pro X. You talk like a sharp operator who's actually run campaigns before, not like customer support. You support users across every experience level: new affiliate marketers, growing business owners, and seasoned professionals.\n\n" +
      "WHO YOU ARE:\nYou're plainspoken and a little dry. You don't cheerlead, you don't say \"great question\" or \"I'd be happy to help\" or \"as an AI\" — you just answer, the way a sharp colleague would. You have real opinions about what works (test one offer at a time, post consistently beats posting perfectly, a first sale matters more than a perfect link) and you say them plainly instead of hedging everything. You give people the actual next step, not a list of five options when they need one. You use contractions. You are never chipper for the sake of it, but you do care, and it shows in how specific and useful your answers are.\n\n" +
      "CORE JOBS:\n1. Help users earn affiliate income — creating and managing affiliate links and products, generating compliant social content, organizing campaigns, and reviewing earnings, clicks, conversions, and payouts.\n2. Help with payouts — when a user asks to be paid, check their balance and file the request.\n3. Generate safe, compliant posts — always include FTC disclosure such as #ad #affiliate in promotional content, keep content platform-appropriate, avoid unsafe or misleading claims.\n4. Help with product discovery across eBay, ClickBank, Digistore24, and custom offers.\n\n" +
      "HOW YOU TALK:\nNever open with \"Great question!\", \"I'd be happy to help!\", \"As an AI...\", or similar stock phrases. Say what you actually think is the right move, don't just list options with no recommendation. Keep it short by default. It's fine to disagree with a user's plan if you think there's a better one — say so plainly, then explain why.\n\n" +
      "If a user mentions being a veteran, thank them once, sincerely and briefly, and remind them veteran access is free lifetime access when relevant — then get back to being useful.\n\n" +
      SHARED_RULES,
  },
};

export function getAgent(agentName) {
  const agent = AGENTS[agentName];
  if (!agent) throw new Error(`Unknown agent: ${agentName}`);
  return agent;
}

// A turn can legitimately need a few tool calls (check products, then create a
// link, then read stats back). It should never need many -- a model ping-ponging
// past this is looping, and each pass costs a full request against the Vercel
// function timeout.
const MAX_TOOL_ROUNDS = 5;

/** A short note about who is asking, so the assistant does not have to ask. */
function userContext(user) {
  if (!user) return "";
  const bits = [`User id: ${user.id}`];
  if (user.email) bits.push(`Email: ${user.email}`);
  if (user.clickbank_nickname) bits.push(`ClickBank nickname: ${user.clickbank_nickname}`);
  else bits.push("ClickBank nickname: not set (links use the house account)");
  const connected = connectedNetworkIds(user);
  if (connected.size > 0) {
    const names = AFFILIATE_NETWORKS.filter((n) => connected.has(n.id)).map((n) => n.name);
    bits.push(`Connected affiliate networks: ${names.join(", ")}.`);
  } else {
    bits.push("Connected affiliate networks: none besides the ClickBank/Digistore24 house accounts.");
  }
  if (user.veteran_status && user.veteran_status !== "regular") bits.push(`Veteran status: ${user.veteran_status}`);
  if (user.payoutReady) bits.push("Payout details are set up.");
  else bits.push("Payout details are NOT set up yet (/payouts).");
  return `\n\nCURRENT USER:\n${bits.join("\n")}`;
}

/**
 * Run one assistant turn, including any tool calls it needs.
 *
 * @param {object} args
 * @param {string} args.agent_name          "maya" | "atlas"
 * @param {Array}  args.messages            full conversation history
 * @param {object} [args.user]              authenticated profile; tools are scoped to it
 * @param {string} [args.origin]            app origin, for building share URLs
 * @param {object} [args.client]            injectable Anthropic client, for tests
 * @param {Function} [args.runTool]         injectable tool executor, for tests
 * @returns {Promise<{messages: Array, reply: object, tool_calls: string[]}>}
 *          `messages` is the full history INCLUDING the assistant's tool_use
 *          turns and their tool_result turns -- the caller must persist all of
 *          it, or the next turn will not know what the tools already returned.
 */
export async function chatWithAgent({ agent_name, messages, user, origin, client, runTool }) {
  const agent = getAgent(agent_name);
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("messages must be a non-empty array");
  }

  const api = client || anthropic();
  const exec = runTool || executeTool;
  const system = agent.instructions + userContext(user);

  // Only the fields the API accepts; anything the client tacked on is dropped.
  const working = messages.map(({ role, content }) => ({ role, content }));
  const toolCalls = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const response = await api.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system,
      tools: TOOL_DEFINITIONS,
      messages: working,
    });

    // Push the assistant turn back verbatim -- the tool_use blocks have to be
    // present for the tool_result blocks that follow to be valid.
    working.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      return {
        messages: working,
        reply: { role: "assistant", content: textFrom(response) },
        tool_calls: toolCalls,
      };
    }

    const requests = response.content.filter((block) => block.type === "tool_use");
    // Parallel tool calls arrive together and all their results must go back in
    // one user message, in the same order.
    const results = await Promise.all(
      requests.map(async (block) => {
        toolCalls.push(block.name);
        const result = await exec(block.name, block.input || {}, { user, origin });
        return {
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
          ...(result && result.error ? { is_error: true } : {}),
        };
      })
    );
    working.push({ role: "user", content: results });
  }

  // Ran out of rounds. Return what we have rather than throwing, so the user
  // gets something and the transcript stays valid.
  console.warn(`Agent ${agent_name} hit the ${MAX_TOOL_ROUNDS}-round tool limit`);
  const reply = {
    role: "assistant",
    content: "That turned into more steps than I can do at once. Tell me which part you want first?",
  };
  // Append it to the history as well, not just return it. The handler forwards
  // only `messages`, and the client reads the reply out of the last assistant
  // message -- left off, a capped turn shows the user nothing at all. It also
  // closes the transcript on an assistant turn instead of a dangling user
  // tool_result, so the next request still alternates roles.
  working.push(reply);
  return { messages: working, reply, tool_calls: toolCalls };
}
