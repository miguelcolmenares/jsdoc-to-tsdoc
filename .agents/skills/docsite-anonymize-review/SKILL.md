---
name: docsite-anonymize-review
description: Review what a docsite site is about to publish for content that must not be public, such as client names, internal hosts, credentials and infrastructure details, and configure the anonymization to keep it out. Use before the first publish of a site, when documented content changes, or when docsite extract or check reports a finding.
---

# docsite-anonymize-review

Everything extracted from the repository ends up on a website. The built-in deny rules catch credential shapes and a few kinds of internal detail, but they cannot know what is sensitive to this organization: a client name, a project codename, an internal service. This skill is the human-judgment layer on top of the mechanical one.

## When to Use

- Before a site is published for the first time.
- After the documented content grew (new docs, new skills or prompts, new tools).
- When `docsite extract` refuses to write, or `docsite check` fails on a finding.

## What the tool already does

1. **Closed contract.** An adapter can only emit fields `content.v1` declares.
2. **Extraction scan.** `anonymize.excludePaths` keeps files from being read, `anonymize.replace` swaps literal text everywhere, then the result is scanned. A match makes `extract` refuse to write `generated.json`.
3. **`docsite check`** re-runs extraction and the scan, applies the visibility gate and scans the built site with `--dist dist`.

Built-in rules, always on: AWS access keys, private key blocks, GitHub, Slack and npm tokens and JSON Web Tokens (high confidence, they also run over the built bundles); hard-coded credential assignments, AWS ARNs with an account id, private network addresses, internal hostnames (`.internal`, `.corp`, `.lan`, `.intranet`) and email addresses (medium confidence, extracted content only). Emails at `example.com`, `example.org`, `example.net`, `.test`, `.invalid`, `.localhost`, and `noreply@` senders are accepted. A finding prints the path inside the content and only the first three characters of the match.

## Review

1. **List what is published.** Read `site/src/content/generated.json` (never paste it into a message wholesale) and the config's `options`. Note which repository files feed each collection.
2. **Read it as an outsider would.** Look for:
   - people, customers, partners and vendor names that are not already public
   - internal URLs, hostnames, IPs, account or project ids, ticket keys and tracker links
   - infrastructure detail: bucket names, cluster names, environment layouts, firewall or auth notes
   - code, examples or logs copied from real incidents or real data
   - anything a README marks as internal, draft, private or "do not share"
3. **Decide per finding, and ask the user when unsure.** Whether something may be public is their call, not yours.
4. **Fix at the right layer, in this order:**
   - Whole file that must not be read: `anonymize.excludePaths` (globs relative to the repository root).
   - A name or host that appears in otherwise fine content: `anonymize.replace`, a literal-text map, for example `"Acme Corp": "<client>"`.
   - A pattern specific to this organization: `anonymize.denyPatterns`, JavaScript regular expressions, case-sensitive, counted as high confidence.
   - A false positive that is genuinely fine: `anonymize.allow`, an exact string. Never use `allow` to silence a real finding.
5. **Re-run** `npm run build` and `npm run check:publish` in `site/`. Repeat until the extraction is clean and you cannot find anything more when reading the output again.

## Rules

- Never edit `generated.json` to remove something, it is regenerated and the source keeps leaking on the next build.
- Never weaken a rule to make a check pass.
- Do not print a secret you find, say where it is and what kind it is.
- A clean run means the mechanical rules found nothing, not that the content is safe. Say which of the two you verified.
