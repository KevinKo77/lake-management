import test from 'node:test';
import assert from 'node:assert/strict';
import {defaults, normalizeModel} from '../src/finance.js';
import {decisionQueue, decisionDesk} from '../src/workspace.js';

test('review prompts expose missing evidence and losses without mutating economics', () => {
  const o = {id:'case-1', label:'<img src=x>', note:'', diligence:{contract:true, revenue:false, counterparty:false}, model:normalizeModel({...defaults, revenue:0})};
  const before = structuredClone(o);
  const [row] = decisionQueue([o]);
  assert.equal(row.checks, 1);
  assert.ok(row.npv < 0);
  assert.equal(row.prompts.length, 4);
  assert.deepEqual(o, before);
  assert.doesNotMatch(decisionDesk([o]), /<img/);
});

test('declared diligence never hides an economic loss or becomes approval', () => {
  const o = {id:'case-2',label:'Fictif',demo:true,note:'Source analyste',diligence:{contract:true,revenue:true,counterparty:true},model:normalizeModel({...defaults,revenue:0})};
  const [row] = decisionQueue([o]);
  assert.equal(row.prompts.length, 2);
  assert.equal(row.demo, true);
  assert.match(decisionDesk([o]), /FICTIONAL/);
  assert.match(decisionDesk([o]), /no automatic approval/);
  assert.match(decisionDesk([]), /Create your first case/);
});
