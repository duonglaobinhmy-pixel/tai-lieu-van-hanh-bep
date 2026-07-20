function base64url(bytes) {
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64url(new Uint8Array(signature));
}

export async function onRequestPost(context) {
  try {
    const { password = "" } = await context.request.json();
    const portalPassword = String(context.env.PORTAL_PASSWORD || "");

    if (!portalPassword) {
      return Response.json({ error: "SERVER_NOT_CONFIGURED" }, { status: 500 });
    }

    if (String(password) !== portalPassword) {
      return Response.json({ error: "INVALID_PASSWORD" }, { status: 401 });
    }

    const payload = {
      sub: "bbm-admin",
      exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
    };
    const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
    const signature = await hmac(portalPassword, body);

    return Response.json({ token: body + "." + signature, expiresIn: 28800 });
  } catch {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
}
