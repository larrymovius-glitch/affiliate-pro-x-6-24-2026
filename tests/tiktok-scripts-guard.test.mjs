import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { tiktokRuleForLink } from "../api/_lib/platformRules.js";

// The AutoPilot TikTok Scripts tab used to write a ready-to-post script for
// any product, including ones TikTok bans for affiliates. Maya already refused.

test("a get-rich product is banned by its link name alone", () => {
  const rule = tiktokRuleForLink({ product_name: "5 AI-Powered Income Secrets - EBook", network: "digistore24" });
  assert.equal(rule.status, "banned");
});

test("the product's description counts, not just the link name", () => {
  const link = { product_name: "Morning Tonic", network: "clickbank" };
  const product = { name: "Morning Tonic", description: "Supports healthy weight loss" };
  assert.equal(tiktokRuleForLink(link, product).status, "banned");
});

test("eBay merchandise is allowed", () => {
  assert.equal(tiktokRuleForLink({ product_name: "Passive income book", network: "ebay" }).status, "allowed");
});

test("an ordinary product is allowed", () => {
  assert.equal(tiktokRuleForLink({ product_name: "Digital Detox for Kids - eBook" }).status, "banned",
    "'detox' is on TikTok's weight-loss list, so this one is caught too");
  assert.equal(tiktokRuleForLink({ product_name: "47 Productivity Secrets - eBook" }).status, "allowed");
});

test("the TikTok Scripts tab checks the rule before asking the AI", () => {
  const src = readFileSync(new URL("../src/components/autopilot/TikTokPostGenerator.jsx", import.meta.url), "utf8");
  assert.match(src, /tiktokRuleForLink/);
  const guard = src.indexOf("if (!selected || banned");
  const llm = src.indexOf("InvokeLLM");
  assert.ok(guard !== -1 && guard < llm, "the banned check must run before the AI call");
  assert.match(src, /disabled=\{[^}]*banned/);
});
