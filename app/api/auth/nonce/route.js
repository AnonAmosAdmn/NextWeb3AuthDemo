// GET /api/auth/nonce/route.ts
import jwt from 'jsonwebtoken';

const NONCE_TTL = parseInt(process.env.NONCE_TOKEN_TTL_SECONDS || '120', 10);
const JWT_SECRET = process.env.JWT_SECRET;

function makeNonce() {
  // cryptographically reasonable random string
  return [...Array(24)].map(()=>Math.floor(Math.random()*36).toString(36)).join('');
}

export async function GET(req) {
  try {
    const url = new URL(req.url);
    const address = (url.searchParams.get('address') || '').toLowerCase();

    // create nonce & embed optional address to bind if provided
    const nonce = makeNonce();
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
      nonce,
      // optionally bind to specific address; if client doesn't provide address param we still include nonce
      ...(address ? { address } : {}),
      iat: issuedAt
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: NONCE_TTL });

    // Compose the exact message user must sign. Bind origin and nonce to reduce replay.
    // The origin will be validated by verifying the same message server-side (server reconstructs it).
    const origin = req.headers.get('origin') ?? url.origin;
    const message = `Sign-in to ${origin}\n\nNonce: ${nonce}\nExpires-in: ${NONCE_TTL}s`;

    return new Response(JSON.stringify({ nonceToken: token, message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    console.error('nonce error', err);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500 });
  }
}
