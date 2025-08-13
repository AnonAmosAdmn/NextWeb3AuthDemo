// /api/auth/logout/route.ts
export async function POST() {
  // Expire cookie
  const cookie = `token=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax; Secure`;
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': cookie
    }
  });
}
