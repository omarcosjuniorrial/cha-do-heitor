import { createHash } from 'node:crypto';
import { GIFTS } from '../../data/gifts.mjs';

const byId = new Map(GIFTS.map((gift) => [gift.id, gift]));
const prefix = 'unit/';
const keyFor = (id, slot) => `${prefix}${id}/${slot}`;
const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
const validToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

async function readSlot(store, key) {
  return store.getWithMetadata(key, { type: 'json', consistency: 'strong' });
}

async function writeSlot(store, key, content, old) {
  if (!old) return store.setJSON(key, content, { onlyIfNew: true });
  return store.setJSON(key, content, { onlyIfMatch: old.etag });
}

async function readAll(store, hash) {
  const listing = await store.list({ prefix });
  const keys = (listing.blobs || []).map((value) => value.key).filter((key) => /^unit\/[1-9]\d*\/[1-9]\d*$/.test(key));
  const entries = await Promise.all(keys.map(async (key) => {
    const record = await store.get(key, { type: 'json', consistency: 'strong' });
    return { key, record };
  }));
  const inventory = new Map(GIFTS.map((g) => [g.id, 0]));
  const mine = [];
  for (const { key, record } of entries) {
    const [, sid, ss] = key.split('/');
    const id = Number(sid), slot = Number(ss);
    const gift = byId.get(id);
    if (!gift || slot > gift.desired) continue;
    if (record?.released) continue;
    // Corrupt or unavailable records count as occupied to avoid overselling.
    inventory.set(id, inventory.get(id) + 1);
    if (record?.hash && record.hash === hash) mine.push({ id, slot });
  }
  return {
    inventory: GIFTS.map((gift) => ({ id: gift.id, reserved: inventory.get(gift.id) })),
    mine,
  };
}

async function reserve(store, selections, hash) {
  if (!Array.isArray(selections) || selections.length < 1 || selections.length > GIFTS.length)
    return { error: 'Selecione ao menos um mimo válido.', status: 400 };
  const seen = new Set();
  let requested = 0;
  for (const { id, qty } of selections) {
    const gift = byId.get(id);
    if (!gift || seen.has(id) || !Number.isInteger(qty) || qty < 1 || qty > gift.desired)
      return { error: 'Quantidade ou presente inválido. Atualize a página.', status: 400 };
    seen.add(id);
    requested += qty;
  }
  if (requested > 100) return { error: 'Seleção muito grande.', status: 400 };
  const reservedUnits = [];
  const missing = [];
  for (const { id, qty } of selections) {
    const gift = byId.get(id);
    let acquired = 0;
    for (let slot = 1; slot <= gift.desired && acquired < qty; slot++) {
      const key = keyFor(id, slot);
      // CAS on one physical gift unit: no shared read/modify/write counters.
      // A released slot can be conditionally re-claimed using its ETag.
      const old = await readSlot(store, key);
      if (old && !old.data?.released) continue;
      const updated = await writeSlot(store, key, { hash, released: false, savedAt: new Date().toISOString() }, old);
      if (updated.modified) {
        reservedUnits.push({ id, slot });
        acquired++;
      }
    }
    if (acquired < qty) missing.push({ id, requested: qty, reserved: acquired });
  }
  return { reservedUnits, missing };
}

async function release(store, id, hash) {
  const gift = byId.get(id);
  if (!gift) return { error: 'Mimo inválido.', status: 400 };
  let released = 0;
  for (let slot = 1; slot <= gift.desired; slot++) {
    const key = keyFor(id, slot);
    const old = await readSlot(store, key);
    if (!old || old.data?.released || old.data?.hash !== hash) continue;
    const result = await writeSlot(store, key, { released: true, savedAt: new Date().toISOString() }, old);
    if (result.modified) released++;
  }
  return { released };
}

export async function runGiftAction(store, body) {
  if (!body || !validToken(body.token)) return { error: 'Identificação do navegador inválida.', status: 400 };
  const hash = tokenHash(body.token);
  if (body.action === 'status') return readAll(store, hash);
  if (body.action === 'reserve') return reserve(store, body.selections, hash);
  if (body.action === 'release') return release(store, body.id, hash);
  return { error: 'Operação não reconhecida.', status: 400 };
}