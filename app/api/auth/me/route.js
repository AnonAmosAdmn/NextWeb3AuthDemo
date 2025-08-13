/* eslint-disable @typescript-eslint/no-unused-vars */



// app/api/me/route.ts


import jwt from 'jsonwebtoken';

export async function GET(req) {
  const cookieHeader = req.headers.get('cookie') || '';
  const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => {
    const [key, ...v] = c.split('=');
    return [key, decodeURIComponent(v.join('='))];
  }));
  const token = cookies.token;

  if (!token) {
    return new Response(JSON.stringify({ authenticated: false }), { status: 401 });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return new Response(
      JSON.stringify({ authenticated: true, address: payload.sub, token, payload }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ authenticated: false }), { status: 401 });
  }
}
