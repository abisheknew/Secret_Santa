const { test } = require('node:test');
const assert = require('assert');
const { computeMapping, shuffle } = require('../lib/assignments');

test('shuffle preserves elements', () => {
  const arr = [1,2,3,4,5];
  const s = shuffle(arr);
  assert.deepEqual(s.slice().sort(), arr.slice().sort());
});

test('computeMapping simple valid', () => {
  const members = ['a','b','c','d'];
  const res = computeMapping(members, []);
  assert.equal(res.success, true);
  assert.equal(res.mapping.length, 4);
  for (const m of res.mapping) assert.notEqual(m.giver_id, m.receiver_id);
});

test('computeMapping respects exclusions', () => {
  const members = ['a','b','c'];
  const exclusions = [['a','b',false], ['b','c',true]];
  const res = computeMapping(members, exclusions, 5000);
  // This constraint set is unsatisfiable for 3 members (validated manually), expect failure
  assert.equal(res.success, false);
});

test('computeMapping reports impossible when too constrained', () => {
  const members = ['a','b'];
  const exclusions = [['a','b',true]];
  const res = computeMapping(members, exclusions, 50);
  assert.equal(res.success, false);
});
