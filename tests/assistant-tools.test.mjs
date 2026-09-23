import assert from "node:assert/strict";
import test from "node:test";
import { chatWithAgent, getAgent, trimHistory } from "../api/_lib/agents.js";
import { TOOL_DEFINITIONS } from "../api/_lib/assistantTools.js";

// A stand-in Anthropic client. `script` is a list of responses to hand back,
// one per round, so a test can stage "model asks for a tool, then answers".
function fakeClient(script) {
  const seen = [];
  return {
    seen,
    messages: {
      create: async (req) => {
        seen.push(req);
        return script[seen.length - 1] ?? { stop_reason: "end_turn", content: [{ type: "text", text: "done" }] };
      },
    },
  };
}

const text = (t) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });
const wantsTool = (id, name, input = {}) => ({
  stop_reason: "tool_use",
  content: [{ type: "tool_use", id, name, input }],
});

const user = { id: "user-1", email: "a@b.c" };

test("tools are sent on every request", async () => {
  const client = fakeClient([text("hi")]);
  await chatWithAgent({ agent_name: "atlas", messages: [{ role: "user", content: "hi" }], user, client });
  assert.ok(Array.isArray(client.seen[0].tools), "tools array must be present");
  assert.equal(client.seen[0].tools.length, TOOL_DEFINITIONS.length);
});

test("a tool call round-trips and the result is fed back", async () => {
  const client = fakeClient([wantsTool("t1", "get_my_stats"), text("You have 3 clicks.")]);
  const calls = [];
  const result = await chatWithAgent({
    agent_name: "maya",
    messages: [{ role: "user", content: "how am I doing?" }],
    user,
    client,
    runTool: async (name, input, ctx) => { calls.push({ name, ctx }); return { clicks: 3 }; },
  });

  assert.deepEqual(calls.map((c) => c.name), ["get_my_stats"]);
  assert.equal(result.reply.content, "You have 3 clicks.");
  assert.deepEqual(result.tool_calls, ["get_my_stats"]);

  // Second request must carry the assistant's tool_use turn and our tool_result.
  const second = client.seen[1].messages;
  assert.equal(second[1].role, "assistant");
  assert.equal(second[1].content[0].type, "tool_use");
  assert.equal(second[2].role, "user");
  assert.equal(second[2].content[0].type, "tool_result");
  assert.equal(second[2].content[0].tool_use_id, "t1");
  assert.equal(JSON.parse(second[2].content[0].content).clicks, 3);
});

test("the executor always receives the authenticated user, never a model-supplied one", async () => {
  const client = fakeClient([
    // The model tries to name a different owner.
    wantsTool("t1", "list_my_links", { user_id: "someone-else", created_by_id: "someone-else" }),
    text("here they are"),
  ]);
  let ctxSeen;
  await chatWithAgent({
    agent_name: "atlas",
    messages: [{ role: "user", content: "show links" }],
    user,
    client,
    runTool: async (_n, _i, ctx) => { ctxSeen = ctx; return { links: [] }; },
  });
  assert.equal(ctxSeen.user.id, "user-1", "ctx.user must come from the session");
});

test("parallel tool calls all return in one user message, in order", async () => {
  const client = fakeClient([
    {
      stop_reason: "tool_use",
      content: [
        { type: "tool_use", id: "a", name: "list_my_links", input: {} },
        { type: "tool_use", id: "b", name: "list_my_products", input: {} },
      ],
    },
    text("ok"),
  ]);
  await chatWithAgent({
    agent_name: "atlas",
    messages: [{ role: "user", content: "everything" }],
    user,
    client,
    runTool: async (name) => ({ name }),
  });
  const results = client.seen[1].messages[2].content;
  assert.equal(results.length, 2);
  assert.deepEqual(results.map((r) => r.tool_use_id), ["a", "b"]);
});

test("a failing tool is marked is_error and the turn still completes", async () => {
  const client = fakeClient([wantsTool("t1", "request_payout", { amount: 999 }), text("Not enough balance.")]);
  const result = await chatWithAgent({
    agent_name: "maya",
    messages: [{ role: "user", content: "pay me 999" }],
    user,
    client,
    runTool: async () => ({ error: "Only $2.00 is available." }),
  });
  const toolResult = client.seen[1].messages[2].content[0];
  assert.equal(toolResult.is_error, true);
  assert.equal(result.reply.content, "Not enough balance.");
});

test("a looping model is capped instead of running forever", async () => {
  // Always asks for another tool, never answers.
  const client = fakeClient(Array.from({ length: 20 }, (_, i) => wantsTool(`t${i}`, "get_my_stats")));
  const result = await chatWithAgent({
    agent_name: "atlas",
    messages: [{ role: "user", content: "loop" }],
    user,
    client,
    runTool: async () => ({ ok: true }),
  });
  assert.equal(client.seen.length, 5, "must stop at MAX_TOOL_ROUNDS");
  assert.match(result.reply.content, /more steps/i);

  // The handler forwards only `messages`, and the client reads the reply from
  // the last assistant message -- so the fallback has to be in the history too,
  // or a capped turn renders as nothing.
  const last = result.messages[result.messages.length - 1];
  assert.equal(last.role, "assistant", "transcript must not end on a user tool_result");
  assert.equal(last.content, result.reply.content);
});

test("every returned transcript ends on an assistant turn", async () => {
  // Normal path: the assistant's own turn is already the last entry.
  const plain = fakeClient([text("all done")]);
  const a = await chatWithAgent({ agent_name: "atlas", messages: [{ role: "user", content: "hi" }], user, client: plain });
  assert.equal(a.messages[a.messages.length - 1].role, "assistant");

  // After a tool round too.
  const withTool = fakeClient([wantsTool("t1", "get_my_stats"), text("2 clicks")]);
  const b = await chatWithAgent({
    agent_name: "atlas",
    messages: [{ role: "user", content: "stats" }],
    user,
    client: withTool,
    runTool: async () => ({ clicks: 2 }),
  });
  assert.equal(b.messages[b.messages.length - 1].role, "assistant");
});

test("who the user is reaches the system prompt", async () => {
  const client = fakeClient([text("hi")]);
  await chatWithAgent({
    agent_name: "maya",
    messages: [{ role: "user", content: "hi" }],
    user: { id: "u9", email: "vet@x.com", veteran_status: "verified_veteran", payoutReady: false },
    client,
  });
  const system = client.seen[0].system;
  assert.match(system, /u9/);
  assert.match(system, /verified_veteran/);
  assert.match(system, /Payout details are NOT set up/);
});

test("both personas exist and advertise their tools", () => {
  for (const name of ["maya", "atlas"]) {
    const agent = getAgent(name);
    assert.match(agent.instructions, /You have tools/);
    assert.match(agent.instructions, /get_my_stats/);
  }
  assert.throws(() => getAgent("nobody"), /Unknown agent/);
});

test("every tool definition is well formed", () => {
  const names = new Set();
  for (const tool of TOOL_DEFINITIONS) {
    assert.ok(tool.name && !names.has(tool.name), `unique name: ${tool.name}`);
    names.add(tool.name);
    assert.ok(tool.description?.length > 20, `${tool.name} needs a real description`);
    assert.equal(tool.input_schema.type, "object");
    for (const req of tool.input_schema.required || []) {
      assert.ok(tool.input_schema.properties[req], `${tool.name}.${req} required but not defined`);
    }
    // No tool may accept an owner -- scoping is this layer's job, not the model's.
    for (const prop of Object.keys(tool.input_schema.properties || {})) {
      assert.ok(
        !/^(user_id|created_by_id|owner|owner_user_id)$/.test(prop),
        `${tool.name} must not take ${prop}`
      );
    }
  }
});

test("a short history is sent whole, with caching on", async () => {
  const client = fakeClient([text("hi")]);
  const history = [
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
    { role: "user", content: "three" },
  ];
  await chatWithAgent({ agent_name: "maya", messages: history, user, client });
  // The fake client keeps a reference and the reply is appended after, so
  // check what was sent from the front rather than by length.
  assert.equal(client.seen[0].messages[0].content, "one");
  assert.equal(client.seen[0].messages[2].content, "three");
  assert.deepEqual(client.seen[0].cache_control, { type: "ephemeral" });
});

test("a long history is cut back, starting on something the user said", () => {
  // 70 messages: user/assistant pairs, with a tool round where the cut would
  // otherwise land, so a naive slice would start on a tool_result.
  const long = [];
  for (let i = 0; i < 35; i += 1) {
    long.push({ role: "user", content: `q${i}` });
    long.push({ role: "assistant", content: `a${i}` });
  }
  long[40] = { role: "user", content: [{ type: "tool_result", tool_use_id: "x", content: "{}" }] };
  long.push({ role: "user", content: "latest" });

  const trimmed = trimHistory(long);
  assert.ok(trimmed.length <= 31, `kept ${trimmed.length}`);
  assert.equal(trimmed[0].role, "user");
  assert.equal(typeof trimmed[0].content, "string", "must not start on a tool_result");
  assert.equal(trimmed.at(-1).content, "latest");
});

test("history at or under the limit is left alone", () => {
  const short = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: String(i) }));
  assert.equal(trimHistory(short), short);
});
