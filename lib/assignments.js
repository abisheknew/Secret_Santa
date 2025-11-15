// Pure, testable assignment helpers
function shuffle(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// exclusions: object mapping giverId -> Set of excluded receiverIds
function computeMapping(memberIds, exclusions, maxRetries = 2000){
  if (!Array.isArray(memberIds) || memberIds.length < 2) return { success:false, error:'Need at least 2 participants' };
  const excl = {};
  memberIds.forEach(id => { excl[id] = new Set([id]); });
  if (exclusions) {
    for (const [a,b,mutual] of exclusions) {
      // expectation: exclusions is array of [user_a_id, user_b_id, mutual?]
      if (!excl[a]) excl[a] = new Set([a]);
      excl[a].add(b);
      if (mutual) { if (!excl[b]) excl[b] = new Set([b]); excl[b].add(a); }
    }
  }

  for (let attempt=0; attempt<maxRetries; attempt++){
    const receivers = shuffle(memberIds);
    let ok = true;
    for (let i=0;i<memberIds.length;i++){
      const giver = memberIds[i];
      const receiver = receivers[i];
      if (excl[giver] && excl[giver].has(receiver)) { ok = false; break; }
    }
    if (ok) return { success:true, mapping: memberIds.map((giver, idx) => ({ giver_id: giver, receiver_id: receivers[idx] })) };
  }
  return { success:false, error:'Unable to find valid assignment under current constraints' };
}

module.exports = { shuffle, computeMapping };
