import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runGiftAction } from '../netlify/functions/gifts-core.mjs';
import { GIFTS } from '../data/gifts.mjs';

class MockStore {
  constructor(){this.store=new Map();this.i=0;}
  async getWithMetadata(key){const value=this.store.get(key);return value?{data:structuredClone(value.data),etag:value.etag}:null;}
  async get(key){const value=this.store.get(key);return value?structuredClone(value.data):null;}
  async setJSON(key,data,opts){const value=this.store.get(key);
    if(opts.onlyIfNew && value)return {modified:false};
    if(opts.onlyIfMatch && (!value || opts.onlyIfMatch!==value.etag))return {modified:false};
    this.store.set(key,{data:structuredClone(data),etag:`etag-${++this.i}`});return {modified:true};
  }
  async list({prefix}){return {blobs:[...this.store.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))};}
}
const t1='a'.repeat(64),t2='b'.repeat(64),t3='c'.repeat(64);
const status = (store,token)=>runGiftAction(store,{action:'status',token});
const reserve = (store,token,id,qty)=>runGiftAction(store,{action:'reserve',token,selections:[{id,qty}]});
const release = (store,token,id)=>runGiftAction(store,{action:'release',token,id});
const reserved = (snap,id)=>snap.inventory.find(i=>i.id===id)?.reserved;

test('catálogo correto, com quantidades',()=>{
  assert.equal(GIFTS.length,43);assert.equal(GIFTS.reduce((n,g)=>n+g.desired,0),100);
});

test('a reserva é compartilhada e o presente esgotado não ultrapassa o limite',async()=>{
  const s=new MockStore();
  const a=await reserve(s,t1,2,1);
  assert.deepEqual(a.reservedUnits,[{id:2,slot:1}]);
  const b=await reserve(s,t2,2,1);
  assert.equal(b.reservedUnits.length,0);
  assert.equal(b.missing.length,1);
  assert.equal(reserved(await status(s,t3),2),1);
  assert.deepEqual((await status(s,t1)).mine,[{id:2,slot:1}]);
  assert.deepEqual((await status(s,t2)).mine,[]);
});

test('somente a pessoa com token correto pode liberar um mimo e outras podem ocupar a vaga',async()=>{
  const s=new MockStore();await reserve(s,t1,1,2);
  assert.equal((await release(s,t2,1)).released,0);
  assert.equal(reserved(await status(s,t3),1),2);
  assert.equal((await release(s,t1,1)).released,2);
  assert.equal(reserved(await status(s,t3),1),0);
  const b=await reserve(s,t2,1,3);
  assert.equal(b.reservedUnits.length,3);
  assert.equal(reserved(await status(s,t3),1),3);
});

test('concorrência: no máximo uma reserva por unidade',async()=>{
  const s=new MockStore();
  const [a,b]=await Promise.all([reserve(s,t1,2,1),reserve(s,t2,2,1)]);
  assert.equal(a.reservedUnits.length+b.reservedUnits.length,1);
  assert.equal(reserved(await status(s,t3),2),1);
});

test('nenhum pedido inválido altera estoque',async()=>{
  const s=new MockStore();
  assert.equal((await reserve(s,t1,2,2)).status,400);
  assert.equal((await runGiftAction(s,{action:'reserve',token:'bad',selections:[{id:2,qty:1}]})).status,400);
  assert.equal(reserved(await status(s,t1),2),0);
});

test('o painel exige senha secreta configurada no servidor e não aceita senha errada',async()=>{
  const s=new MockStore();
  await reserve(s,t1,1,2);
  assert.equal((await runGiftAction(s,{action:'adminStatus',password:'teste'})).status,503);
  assert.equal((await runGiftAction(s,{action:'adminRelease',password:'senha-invalida',id:1},'uma-senha-super-segura-123')).status,401);
  assert.equal(reserved(await status(s,t3),1),2);
  const admin=await runGiftAction(s,{action:'adminStatus',password:'uma-senha-super-segura-123'},'uma-senha-super-segura-123');
  assert.equal(reserved(admin,1),2);
  assert.equal(admin.mine,undefined);
});

test('os papais podem liberar uma unidade reservada por vez sem expor os tokens',async()=>{
  const s=new MockStore();
  await reserve(s,t1,1,2);
  const secret='uma-senha-super-segura-123';
  const action={action:'adminRelease',password:secret,id:1};
  assert.equal((await runGiftAction(s,action,secret)).released,1);
  assert.equal(reserved(await status(s,t2),1),1);
  assert.equal((await runGiftAction(s,action,secret)).released,1);
  assert.equal(reserved(await status(s,t2),1),0);
  assert.equal((await runGiftAction(s,action,secret)).status,409);
  assert.equal((await reserve(s,t2,1,3)).reservedUnits.length,3);
});
test('os pais podem ampliar um mimo esgotado, sem afetar a reserva antiga',async()=>{
  const s=new MockStore(),pwd='uma-senha-super-segura-123';
  await reserve(s,t1,2,1);
  const before=await status(s,t2);
  assert.equal(before.inventory.find(x=>x.id===2).available,0);
  assert.equal((await runGiftAction(s,{action:'adminAddUnit',password:'errada',id:2},pwd)).status,401);
  const added=await runGiftAction(s,{action:'adminAddUnit',password:pwd,id:2},pwd);
  assert.equal(added.desired,2);
  const after=await status(s,t2);
  assert.deepEqual(after.inventory.find(x=>x.id===2),{id:2,reserved:1,desired:2,available:1});
  const second=await reserve(s,t2,2,1);
  assert.deepEqual(second.reservedUnits,[{id:2,slot:2}]);
  assert.deepEqual((await status(s,t1)).mine,[{id:2,slot:1}]);
  const panel=await runGiftAction(s,{action:'adminStatus',password:pwd},pwd);
  assert.equal(panel.inventory.find(x=>x.id===2).reserved,2);
  assert.equal(panel.mine,undefined);
  assert.equal(JSON.stringify(panel).includes(t1),false);
  assert.equal(JSON.stringify(panel).includes(t2),false);
});
test('uma reserva adicional pode ser liberada pelo convidado ou pelos papais',async()=>{
  const s=new MockStore(),pwd='uma-senha-super-segura-123';
  await runGiftAction(s,{action:'adminAddUnit',password:pwd,id:2},pwd);
  await reserve(s,t1,2,1);
  await reserve(s,t2,2,1);
  assert.equal((await release(s,t2,2)).released,1);
  assert.equal(reserved(await status(s,t3),2),1);
  assert.equal((await runGiftAction(s,{action:'adminRelease',password:pwd,id:2},pwd)).released,1);
  assert.equal(reserved(await status(s,t3),2),0);
  assert.equal((await status(s,t3)).inventory.find(x=>x.id===2).desired,2);
});
test('aumento simultâneo de capacidade preserva todas as unidades',async()=>{
  const s=new MockStore(),pwd='uma-senha-super-segura-123',change={action:'adminAddUnit',password:pwd,id:2};
  const [a,b]=await Promise.all([runGiftAction(s,change,pwd),runGiftAction(s,change,pwd)]);
  assert.equal(a.added,1);assert.equal(b.added,1);
  assert.equal((await status(s,t3)).inventory.find(x=>x.id===2).desired,3);
});
