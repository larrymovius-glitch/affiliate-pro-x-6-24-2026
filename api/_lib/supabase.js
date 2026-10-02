import { createClient } from "@supabase/supabase-js";

export function adminClient() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// Verifies the Supabase access token the client shim sends as
// `Authorization: Bearer <token>` and hydrates the profile row, mirroring
// what base44.auth.me() used to return.
export async function getAuthedUser(req) {
  const header = req.headers["authorization"] || req.headers["Authorization"] || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return { user: null, token: null };
  // Vercel Cron sends CRON_SECRET in this same header. It is not a Supabase
  // token, and handing it to getUser logged a 403 "bad_jwt" in Supabase's
  // auth logs on every scheduled run -- the jobs still worked, but it read as
  // a nightly auth failure. Cron callers are recognised by isCronRequest.
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return { user: null, token };

  const admin = adminClient();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) {
    console.error("getAuthedUser: admin.auth.getUser failed", {
      message: error?.message,
      status: error?.status,
      name: error?.name,
      hasUrl: !!process.env.SUPABASE_URL,
      keyLength: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").length,
    });
    return { user: null, token };
  }

  const { data: profile } = await admin.from("profiles").select("*").eq("id", data.user.id).single();
  return { user: { id: data.user.id, email: data.user.email, ...(profile || {}) }, token };
}

// Vercel's Cron Jobs feature sends `Authorization: Bearer $CRON_SECRET`
// automatically. Manual/internal calls also accept `x-cron-secret` or a
// `cron_secret` field in the JSON body, matching the old Base44 checks.
export function isCronRequest(req, body = {}) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const authHeader = req.headers["authorization"] || req.headers["Authorization"] || "";
  if (authHeader === `Bearer ${secret}`) return true;
  if (req.headers["x-cron-secret"] === secret) return true;
  if (body?.cron_secret === secret) return true;
  return false;
}
