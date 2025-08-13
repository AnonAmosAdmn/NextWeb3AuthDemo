/* eslint-disable @typescript-eslint/no-unused-vars */

// app/api/auth/verify/route.ts
import { verifyMessage } from 'ethers';
import { sign as signJwt } from 'jsonwebtoken';
import type { JwtPayload } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const AUTH_TTL = parseInt(process.env.AUTH_JWT_EXPIRES_IN_SECONDS || '3600', 10);
const NONCE_TTL = parseInt(process.env.NONCE_TOKEN_TTL_SECONDS || '120', 10);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { address, signature, nonceToken } = body || {};

    if (!JWT_SECRET) throw new Error('Missing JWT_SECRET environment variable');
    if (!address || !signature || !nonceToken) {
      return new Response(JSON.stringify({ error: 'address, signature and nonceToken required' }), { status: 400 });
    }

    // 1) Verify the nonce token
    let noncePayload: string | JwtPayload;
    try {
      noncePayload = jwt.verify(nonceToken, JWT_SECRET);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'invalid or expired nonce token' }), { status: 400 });
    }

    if (typeof noncePayload === 'string') {
      return new Response(JSON.stringify({ error: 'invalid nonce token payload' }), { status: 400 });
    }

    if (noncePayload.address && noncePayload.address.toLowerCase() !== address.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'nonce token bound to a different address' }), { status: 400 });
    }

    // 2) Reconstruct the message (must match frontend exactly)
    const origin = req.headers.get('origin') || `${new URL(req.url).origin}`;
    const message = `Sign-in to ${origin}\n\nNonce: ${noncePayload.nonce}\nExpires-in: ${NONCE_TTL}s`;

    // 3) Verify signature
    let recovered: string;
    try {
      recovered = verifyMessage(message, signature);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'invalid signature format' }), { status: 400 });
    }

    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return new Response(JSON.stringify({ error: 'signature verification failed' }), { status: 401 });
    }

    // 4) Issue auth token (JWT) as httpOnly cookie
    const authPayload = {
      sub: address.toLowerCase(),
      iat: Math.floor(Date.now() / 1000),
    };
    const token = signJwt(authPayload, JWT_SECRET, { expiresIn: AUTH_TTL });

    const cookie = `token=${token}; HttpOnly; Path=/; Max-Age=${AUTH_TTL}; SameSite=Lax; Secure`;

    // 5) Return token + payload in JSON too (so front-end can render immediately)
    return new Response(
      JSON.stringify({
        ok: true,
        token,
        payload: authPayload,
        address: address.toLowerCase(),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookie,
        },
      }
    );
  } catch (err) {
    console.error('verify error', err);
    return new Response(JSON.stringify({ error: 'server error' }), { status: 500 });
  }
}
