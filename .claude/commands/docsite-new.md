---
description: Add a documentation microsite to this repository with @silverassist/docsite, from init to a passing publish check
---

# Docsite New

Add a documentation site to the current repository with `@silverassist/docsite`. This is the whole flow. Each phase has a skill with the detail, read it when you reach that phase:

| Phase                                     | Skill                                              |
| ----------------------------------------- | -------------------------------------------------- |
| Scaffold and first build                  | `.agents/skills/docsite-init/SKILL.md`             |
| Content the built-in adapters cannot read | `.agents/skills/docsite-adapter/SKILL.md`          |
| What must not be published                | `.agents/skills/docsite-anonymize-review/SKILL.md` |
| Visibility, deploy workflow               | `.agents/skills/docsite-publish/SKILL.md`          |
| Pages and components                      | `.agents/skills/docsite-design/SKILL.md`           |

## Steps

1. **Check the starting point.** If `docsite.config.json` or `site/` exists, stop: this repository already has a site, use `/docsite-audit` instead. Otherwise confirm Node 22 or newer and that `npm view @silverassist/docsite version` works. If it does not, stop and tell the user that `NPM_GITHUB_TOKEN` (with `read:packages`) is missing. Never ask for or print the token.
2. **Detect what the repository is** and what should be documented: markdown docs, an MCP server, a folder of regular source files, or a mix. State your reading in one line and continue, do not ask unless it is genuinely ambiguous.
3. **Scaffold** following `docsite-init`: `npx @silverassist/docsite@latest init --dry-run`, then `init`, then fit `docsite.config.json` to the repository. Use `docsite-adapter` only when the built-in adapters cannot express something the site needs.
4. **Review what will be published** following `docsite-anonymize-review`. Exclude or replace what must not be public, and ask the user about anything you are unsure of.
5. **Build and check:** `cd site && npm install && npm run build && npm run check:publish`.
6. **Decide visibility.** If the check fails because the repository is private, stop and ask the user whether the site may be public. Only on an explicit yes set `acknowledgePublicPages` and record the decision in the pull request description.
7. **Deploy workflow** following `docsite-publish`. If the repository is on Bitbucket, ask the user which target to use.
8. **Open the pull request** with `docsite.config.json`, `site/` and the workflow. Stage those paths only. The description says what the site documents, what was excluded or replaced, and the visibility decision.

## Report

| Step            | Status   | Notes                                  |
| --------------- | -------- | -------------------------------------- |
| Scaffold        | ✅/❌    | Adapter chosen                         |
| Anonymization   | ✅/❌    | Paths excluded, replacements added     |
| Build           | ✅/❌    | Items extracted per collection         |
| Publish check   | ✅/⚠️/❌ | Visibility decision, if one was needed |
| Deploy workflow | ✅/⏳    | Added, or what is still to do          |

## Never

- Print, log or commit `NPM_GITHUB_TOKEN`.
- Set `acknowledgePublicPages` without the user's explicit yes.
- Edit `site/src/content/generated.json`, it is regenerated on every build.
- Report a check as passed when it was skipped.
