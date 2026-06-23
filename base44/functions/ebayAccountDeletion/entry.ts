Deno.serve(async (req) => {
  try {
    const verificationToken = Deno.env.get("EBAY_VERIFICATION_TOKEN");
    const endpointUrl = "https://apx.amhere4utoday.com";

    // GET: eBay challenge handshake
    if (req.method === "GET") {
      const url = new URL(req.url);
      const challengeCode = url.searchParams.get("challenge_code");

      if (!challengeCode) {
        return Response.json({ error: "Missing challenge_code" }, { status: 400 });
      }

      // SHA-256 hash of: challengeCode + verificationToken + endpointUrl (no separators)
      const encoder = new TextEncoder();
      const data = encoder.encode(challengeCode + verificationToken + endpointUrl);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const challengeResponse = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");

      return Response.json({ challengeResponse }, { status: 200 });
    }

    // POST: eBay account deletion notification
    if (req.method === "POST") {
      // Acknowledge receipt — actual deletion is handled by deleteAccount function
      return new Response(null, { status: 200 });
    }

    return new Response("Method Not Allowed", { status: 405 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});