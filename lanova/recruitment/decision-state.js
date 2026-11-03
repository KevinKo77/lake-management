/**
 * Decision freshness (audit defect 1). A decision may be exported only if it is the successful result of
 * the LATEST submission AND that submission's inputs equal the current inputs.
 *   invalidate()            any edit: discards the accepted decision and any pending worker result
 *   submit(key)             a valid run is sent to the worker; returns its sequence number
 *   receive(seq, a, error)  'accepted' only for the pending sequence; anything else is 'stale'
 *   exportable(currentKey)  the accepted analysis if it matches the current inputs, else null
 */
export function createDecisionState() {
  let seq = 0;
  let pending = null;   // {seq, key}
  let accepted = null;  // {key, analysis}
  return {
    invalidate() { seq++; pending = null; accepted = null; return seq; },
    submit(key) {
      if (key === null || key === undefined) throw new Error('Cannot submit invalid inputs');
      seq++; pending = {seq, key}; accepted = null; return seq;
    },
    receive(gotSeq, analysis, error) {
      if (!pending || gotSeq !== pending.seq) return 'stale';
      const {key} = pending;
      pending = null;
      if (error || !analysis) { accepted = null; return 'error'; }
      accepted = {key, analysis};
      return 'accepted';
    },
    exportable(currentKey) { return accepted && currentKey !== null && accepted.key === currentKey ? accepted.analysis : null; },
    get pending() { return Boolean(pending); },
    get seq() { return seq; },
  };
}
