// Client-side response handling, shared by every component that talks to this
// app's API. It lives here rather than beside one of them because the rule it
// encodes only works if it is the ONLY way responses are read: it was written
// in src/app/accounts/[accountId]/page.tsx, applied there, and the other two
// consumers went on parsing bodies by hand until they were pointed back at it.
//
// No server imports — this is bundled into client components.

// A body is parsed behind its own ok check and never bare: a non-JSON body —
// Next's HTML error page from a framework-level failure, a proxy's 502 — makes
// `res.json()` throw `Unexpected token '<'`, and a bare parse turns that
// SyntaxError into the message the user sees, hiding whatever the real error
// was. `failureMessage` is what to say when the response carries no JSON error
// of its own, so callers phrase it for what they were doing. A body that will
// not parse is reported as unreadable rather than handed back for the caller to
// dereference.
export async function readJson(res: Response, failureMessage: string) {
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw new Error(data?.error?.message || failureMessage);
  // `== null`, not `=== undefined`: a 200 whose body is the JSON literal `null`
  // parses to null, which a strict check reads as a good body and hands back —
  // and every caller then dereferences it (`data.accounts`, `data.transaction`)
  // for a TypeError naming a property instead of the response. No route emits a
  // bare null today; this function is the hardened path, so it should not depend
  // on that.
  if (data == null) throw new Error(`${failureMessage}: unreadable response`);
  return data;
}
