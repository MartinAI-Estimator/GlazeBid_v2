/**
 * supabaseClient.js — LOCAL-ONLY STUB (Supabase removed, AUDIT 1.3)
 *
 * GlazeBid is local-first: the project file on disk is the single source of
 * truth and no cloud backend exists. This stub keeps the legacy import surface
 * (`supabase`, `isSupabaseConfigured`) alive so old call sites degrade
 * gracefully instead of crashing, without shipping the @supabase/supabase-js
 * dependency or making any network calls.
 *
 * Every query resolves to { data: null, error: { message: 'local mode' } } —
 * the same shape callers already handle for "not configured".
 */

const LOCAL_ERROR = { message: 'GlazeBid is local-first — cloud persistence is disabled.' };

// Chainable no-op query builder: supabase.from(...).select(...).eq(...) etc.
// Awaiting any point in the chain resolves to { data: null, error }.
function makeChain() {
  const result = Promise.resolve({ data: null, error: LOCAL_ERROR });
  const chain = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then')  return result.then.bind(result);
      if (prop === 'catch') return result.catch.bind(result);
      if (prop === 'finally') return result.finally.bind(result);
      return () => chain;
    },
    apply() { return chain; },
  });
  return chain;
}

export const supabase = new Proxy({}, {
  get(_t, prop) {
    if (prop === 'auth') {
      return {
        getSession: async () => ({ data: { session: null }, error: null }),
        signOut:    async () => ({ error: null }),
      };
    }
    return () => makeChain();
  },
});

export const isSupabaseConfigured = () => false;

export default supabase;
