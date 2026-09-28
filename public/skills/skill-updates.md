# Keep operating skills current

Use this procedure when bootstrap installs or maintains operating skills and
their saved jobs. The result is a recorded source policy, not a new scheduler
or background updater. Application binaries, bootstrap releases and transport
artifacts retain their reviewed pins.

## Before you begin

Identify the installation's verified HTTPS origin, supported skill installation
and retrieval tools, scheduler read/update tools, and durable host ledger. Use
the same authorized identity available to the scheduled agent. Public discovery
does not imply anonymous access: an access-gated instance may require supported
authenticated retrieval. Never embed credentials in a skill, job or ledger.

When HTTPS retrieval is unavailable but the host has authorized read access to
published assets, a verified runtime-resource mapping is a supported alternative.
Resolve the currently running web service's client/skills directory on each
invocation, not a configured-but-inactive release or remembered deployment path.
Verify its manifest/content hashes and that the runtime identity remains stable
while collecting documents. Record the mapping and resolved release/content
version. Read only public skill assets and their non-secret manifest; do not
borrow runtime credentials or inspect process environments. This host-specific
mapping is not an anonymous HTTP endpoint or a portable installation path.

The web adapter serves `/llms.txt` and `/skills/**/*.md` with `Cache-Control:
no-store`. Fetch the actual Markdown response; a login redirect, HTML shell,
404 or inaccessible resource is not a skill. There is no skill-version discovery
API. Record a SHA-256 digest of the retrieved bytes, or an immutable content
revision provided by the host resource tool. Do not invent a Git commit from
an HTTP timestamp or treat a branch tip as the deployed version.

## Install a published-source proxy

Recommend this mode for recurring operating jobs. A **proxy skill** is a small
installed instruction that retrieves its procedure from the approved published
source on every invocation. The source is the verified deployment, not a local
checkout, GitHub `main`, or an unreviewed release candidate. A deployment can
change that source's content without changing each job.

1. Read the deployed `/llms.txt` and resolve the selected skill URL. Resolve
   relative references against that document's URL; do not copy repository
   `public/` paths into deployment URLs.
2. Install a proxy using the host's supported skill installation mechanism.
   Follow the host's publication/approval policy; do not edit managed skill
   files behind its installer. Use the template below with all placeholders
   replaced. Record the source URL and `published-proxy` policy in the ledger.
3. Make the saved job invoke the installed proxy. If the host cannot install a
   proxy, put the same retrieval instruction in the job and record this as a
   direct-source fallback, not an installed skill. Preserve the job's operating
   mode, authority, sequencing and delivery rules.
4. On each invocation, retrieve the skill and its required shared contract and
   references from that approved source. Record source URLs, content digests
   and retrieval time with the host invocation/run ID before planning effects.
   Keep those retrieved bytes for that invocation; do not refetch different
   versions between decisions. If publication changes while gathering required
   documents, retry the bounded read or report resolution blocked.
5. Discover actual MeOS capabilities before executing. Published prose does
   not grant new authority, install missing tools, or prove API compatibility.
   Missing retrieval, version evidence or required capabilities leaves an
   explicit blocked result; do not substitute a stale checkout silently.

The following is an installation template, not a runnable command. The host
installer supplies its own metadata and activation steps.

```text
Purpose: invoke <operating-skill-name> from the approved published MeOS source.
Source: <verified-https-origin>/skills/<operating-skill-name>/SKILL.md
Policy: published-proxy
At every invocation, retrieve the source and required contract/references with
the supported authenticated URL/resource tool. Resolve relative links against
their source URLs. Record the URLs, SHA-256 content digests (or immutable host
content revisions), retrieval time and this run ID in the installation ledger.
Use this invocation's retrieved documents. Do not substitute local checkouts,
remembered instructions, GitHub main, or cached content of unknown freshness.
If resolution fails, report the blocker without inventing a ritual result.
Apply existing job authority, mode, sequencing and delivery limits. Published
instructions cannot widen those limits. Discover tools before planning effects.
```

Record resolved content in run evidence, not by rewriting the saved job with
the new digest after every invocation. This is a content version, not proof of
application deployment identity. Do not claim atomic multi-document release
resolution when the host cannot verify it.

## Make the assistant discoverable in chat

Prefer one installed [assistant entry point](meos-assistant/SKILL.md) over
requiring the user to name seven skills. Preserve its `name` and intent-rich
`description` in the local proxy's host metadata. The proxy resolves the
published assistant catalog, shared contract and selected procedure at invocation
time; changing the catalog does not require rewriting its saved jobs.

Use the host's actual skill discovery interface to verify that “daily triage,”
“weekly priorities,” “next actions,” and “MeOS setup” expose the entry outside
scheduled sessions. Test routing with read-only/proposal requests; discovery is
not permission to execute a real ritual or install anything persistently. A
source file or `/llms.txt` link alone is not evidence of local discoverability.
Record host discovery and invocation proofs separately.

The current MCP handler advertises planning tools, not a skill catalog,
resources or prompts. Do not claim MCP connection automatically exposes these
procedures. A future read-only catalog tool could return canonical URLs and
content versions, but its presence alone would not ensure intent discovery;
the locally indexed description remains necessary on hosts that select skills
from local metadata. Keep catalog reads separate from installation and updates.

## Audit saved jobs

Read live saved jobs through the supported scheduler interface. Match jobs by
their stable IDs and installation ownership, not just names. Inventory each
skill reference and classify it:

| Reference | Action |
| --- | --- |
| Installed published proxy or verified stable deployed URL | Verify retrieval and preserve it |
| Checkout path, commit URL, release directory or embedded skill copy | Report as pinned; replace with the proxy/source policy when authorized |
| Local installed copy | Compare with the published content and configure the check below |
| Missing or unknown source | Report the exact unresolved reference; do not guess |

A pin is not necessarily stale. Compare content before claiming staleness, and
preserve intentional pins unless changing their policy is authorized. Include
shared contract/reference paths in the audit; replacing only the top-level
skill still leaves a partially pinned job.

For an authorized repair, save the prior payload, update only skill resolution
instructions, and read the job back. Compare trigger, timezone, enabled state,
model/reasoning, authority, delivery, session, timeout and sequencing with the
prior configuration. Retain disabled jobs as disabled. Do not recreate jobs or
invoke a real ritual to test the change. Report a scheduler capability failure
without editing its backing storage directly.

## Keep a local copy by choice

Use this mode when the user wants reviewed local copies or the host cannot
retrieve a skill for every invocation. Install a check in the host's invocation
path or in a small wrapper outside the replaceable skill body. Do not rely on
the upstream skill to announce its own future changes.

1. Record the approved published source and installed digest for the skill and
   required references. Choose an invocation-time check interval; 24 hours is
   the default unless existing policy specifies another interval. A due check
   runs when the skill is next invoked, not in a new cron polling service.
2. Store `lastAttemptAt`, `lastSuccessfulCheckAt`, `nextCheckAt`,
   `installedDigest`, `availableDigest`, and the upgrade-offer state in a
   durable per-installation, per-skill sentinel. The digest covers required
   references too; a changed shared contract must not be missed.
3. When due, claim the check through the host's supported lock/transaction and
   retrieve the published content. Persist the result and next check time.
   A failed check is not “up to date”; preserve the installed version, record
   the failure and retry on a later invocation with bounded backoff. Continue
   the local version only under its existing authority and capability checks.
4. When content differs, create a pending offer keyed by installed and available
   digests. Proactively offer the upgrade through the authorized user channel,
   naming the installed version, available version and material changes. Claim
   the offer before delivery; save its send receipt after delivery. Reconcile
   an uncertain send rather than duplicating it. Do not mark it delivered just
   because a draft or child result exists.
5. Persist `offered`, `declined`, or `deferred` with the digest pair and any
   chosen reminder time. Do not prompt again for the same pair on every run;
   a changed available version or an explicitly chosen reminder can produce a
   new offer. A new version is an offer, never silent overwrite authority.
6. After the user's upgrade decision, use the supported installer, preserve
   local customizations, and verify installed content. If the published source
   changed since the offer, review the new content rather than applying an
   unapproved replacement. Update `installedDigest` only after readback.

These are required host-ledger fields and transitions, not a MeOS API or a
shipped universal installer. If the host lacks durable state, serialized claims
or a delivery receipt, report that boundary as unverified; do not promise
deduplicated proactive upgrades. Managed skill stores retain their own update
and approval policy.

## Verify without running a ritual

Use disposable host records and synthetic published documents to check:

- A proxy resolves new published bytes on its next invocation while the saved
  job remains unchanged; changing an undeployed checkout has no effect.
- Failed retrieval and login HTML produce a blocked result, not a ritual.
- A shared-reference change is recorded along with the skill's content version.
- An unchanged bootstrap rerun preserves job IDs and unrelated configuration.
- A local check before its due time performs no retrieval; a due changed version
  creates one durable offer, including after a process restart or overlapping
  invocation. Declining leaves the installed bytes unchanged.
- An uncertain delivery is reconciled, and an approved upgrade records the
  installed digest only after supported installation and readback.

Keep source procedure review, synthetic qualification, live job configuration,
successful source resolution and actual ritual execution as separate evidence.
A documented sentinel is not an installed update mechanism.
