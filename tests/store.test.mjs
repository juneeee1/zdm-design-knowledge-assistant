import test from 'node:test';
import assert from 'node:assert/strict';
import { blobStore } from '../server/store.mjs';
import { BlobPreconditionFailedError } from '@vercel/blob';

test('private blob store retries conflicts without losing feedback',async()=>{
  let text=null,etag=0;
  const read=async()=>text?{stream:new Blob([text]).stream(),blob:{etag:String(etag)}}:null;
  const write=async(_key,body,options)=>{
    assert.equal(options.access,'private');
    if(text && !options.ifMatch)throw new Error('already exists');
    if(options.ifMatch && options.ifMatch!==String(etag))throw new BlobPreconditionFailedError();
    text=body;etag++;
  };
  const store=blobStore({read,write});
  await Promise.all([store.feedback({id:'a'}),store.feedback({id:'b'})]);
  assert.deepEqual(JSON.parse(text).feedback.map(r=>r.id).sort(),['a','b']);
  const reserved=await Promise.all([store.reserveAI('2026-09-14',1),store.reserveAI('2026-09-14',1)]);
  assert.equal(reserved.filter(Boolean).length,1);assert.equal(JSON.parse(text).totalAI,1);
});
test('blob store limits feedback and fails closed when storage is unavailable',async()=>{
  const state={schema:1,day:'',used:0,totalAI:0,feedback:Array.from({length:200},()=>({id:'old'}))};
  const store=blobStore({read:async()=>({stream:new Blob([JSON.stringify(state)]).stream(),blob:{etag:'1'}}),write:async()=>{throw new Error('must not write');}});
  await assert.rejects(store.feedback({id:'new'}),/FEEDBACK_LIMIT/);
  const unavailable=blobStore({read:async()=>{throw new Error('network');}});
  await assert.rejects(unavailable.reserveAI('2026-09-14',10),/network/);
});
