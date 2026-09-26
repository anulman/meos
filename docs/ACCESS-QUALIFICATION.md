# Single-owner Access qualification

## Authority and architecture

The user explicitly authorized generated internal owner credentials and requested
single-player entry through existing external Access, without recurring application
password login. Production cutover remains authorized once tests/review support
expected success. Node same-license runtime approval is recorded in the workspace.

The adapter verifies application RS256 assertions with the existing Access issuer,
application audience, exact owner email, signature, time validity and public-key
freshness. Each domain API request also verifies the native session belongs to the
configured owner. An application cookie or bare email header cannot bypass Access.
The network-disabled web process reads an isolated internal secret and public key
bundle, not host credentials. External Access policy is not changed.

Reference: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/

## Fresh proof

- Trusted isolated runner: dedicated test UID, no inherited credentials, denied
  host storage/control/network; synthetic acceptance socket identity verified.
- Focused suite:75 passing tests, plus date/planner helpers.
- Combined candidate release:26 existing integration browser checks,4 actual
  production-entrypoint checks,6 Access browser checks on the same client artifact.
- Access browser: no password/second login, native renewal/reload, save persistence,
  second tab same owner, forged assertion denial, stale-key failure and recovery.
- Independent native review: no outstanding source findings after cookie validation,
  owner-session binding and receipt-bound key-refresh unit fixes. Actual lifecycle
  and installed timer evidence are additional deployment gates, not implied here.

Exact receipts are .qualification/run-evidence-candidate-release.json and
.qualification/run-evidence-candidate-checks.json. Client is copied from that build;
never rebuild while staging/deploying. Helpers have separately reviewed pinned hashes.

## Error/regression assessment

- Review identified duplicate native cookie-name acceptance: fixed, meaningful
  regression rejects two auth_token cookies before session response.
- Strengthened owner binding: regression denies another native user's cookie even
  alongside the owner's valid external assertion.
- Browser proof initially used an overly exact accessible project name: fixed the
  proof selector to match actual accessible label. Existing save/reload test is the
  regression; no application change or redundant product test warranted.
- Browser APIRequest bypassed Chromium DNS mapping and hit network isolation denial:
  replaced with browser fetch. Test retains real browser path; network namespace was
  not relaxed. No product regression test warranted for this harness-only error.
- Direct Python unauthenticated edge request returned403 while curl HEAD returns
  existing302 Access redirect: no access-policy change; recorded verified HEAD
  observation for issuer/audience, never treats rejection as app-auth success.
- Key-refresh omission in rendered production units found by review: fixed so both
  service and timer are included in exact rendering receipt; actual installed first
  refresh/timer-next-fire proof is required before public cutover.
