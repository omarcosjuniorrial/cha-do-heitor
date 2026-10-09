import { getStore } from '@netlify/blobs';
import { runGiftAction } from './gifts-core.mjs';

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
    },
  });
}

export default async function handler(request) {
  if (request.method !== 'POST') return json({ error: 'Método não permitido.' }, 405);
  const size = Number(request.headers.get('content-length') || 0);
  if (size > 12000) return json({ error: 'Solicitação muito grande.' }, 413);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Solicitação inválida.' }, 400); }
  try {
    const store = getStore({ name: 'presentes-heitor', consistency: 'strong' });
    // The password is defined only in Netlify's server-side environment, never in public JS.
    const adminSecret = typeof Netlify !== 'undefined' ? (Netlify.env.get('HEITOR_ADMIN_PASSWORD') || '') : '';
    const result = await runGiftAction(store, body, adminSecret);
    return json(result, result.status || 200);
  } catch (error) {
    console.error('Não foi possível acessar a lista de presentes:', error);
    return json({ error: 'Não foi possível registrar sua escolha. Tente novamente mais tarde.' }, 503);
  }
}

export const config = {
  path: '/api/presentes',
  method: ['POST'],
  rateLimit: { action: 'rate_limit', aggregateBy: 'ip', windowSize: 60, windowLimit: 30 },
};