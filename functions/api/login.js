
function base64url(bytes) {
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64url(new Uint8Array(signature));
}
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function onRequestPost(context) {
  try {
    const { password = "" } = await context.request.json();
    const expectedHash = context.env.DOCS_PASSWORD_HASH;
    const tokenSecret = context.env.AUTH_TOKEN_SECRET;
    if (!expectedHash || !tokenSecret) {
      return Response.json({ error: "SERVER_NOT_CONFIGURED" }, { status: 500 });
    }
    const actualHash = await sha256Hex(password);
    if (actualHash !== expectedHash) {
      return Response.json({ error: "INVALID_PASSWORD" }, { status: 401 });
    }
    const payload = {
      sub: "bbm-admin",
      exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60
    };
    const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
    const signature = await hmac(tokenSecret, body);
    return Response.json({ token: body + "." + signature, expiresIn: 28800 });
  } catch {
    return Response.json({ error: "INVALID_REQUEST" }, { status: 400 });
  }
}
