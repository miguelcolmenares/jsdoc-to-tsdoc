---
description: Audit an existing docsite site against the kit, for design drift, taxonomy, anonymization, CLI version and deploy
agent: agent
---

# Docsite Audit

Audit the documentation site in this repository against `@silverassist/docsite` and report what has drifted. This is read-only: report, do not fix, unless the user asks you to afterwards.

If there is no `docsite.config.json` or no `site/` folder, stop and suggest `/docsite-new`.

## Checks

Run each one and record the evidence, not just a verdict.

1. **Config.** `docsite.config.json` validates against `site/node_modules/@silverassist/docsite/schema/config.v1.schema.json`, declares `visibility`, and its adapter and options match what the repository really contains. Note collections that point at folders that no longer exist.
2. **Content and taxonomy.** `cd site && npm run generate-content` succeeds. A failure such as `no group for "x"` means an item is missing from the taxonomy. Compare the counts per collection with the repository.
3. **Component drift.** `site/.docsite.json` records the hash of every component file at install time. Report each installed file that was modified or removed:

   ```bash
   node -e "const fs=require('fs'),c=require('crypto');const l=JSON.parse(fs.readFileSync('site/.docsite.json','utf-8'));for(const[i,f]of Object.entries(l.items))for(const[p,h]of Object.entries(f)){const x=fs.existsSync('site/'+p)?c.createHash('sha256').update(fs.readFileSync('site/'+p,'utf-8')).digest('hex'):'missing';if(x!==h)console.log(i,p,x==='missing'?'missing':'modified')}"
   ```

   A modified component is not automatically wrong. Say what changed and whether it follows `.agents/skills/docsite-design/SKILL.md`.

4. **Design rules.** Search `site/src` for what the design forbids: light-theme or theme-toggle code, shadows and gradients on site components, solid gray borders, hand-copied content in pages, arbitrary Tailwind values where a scale value exists, edits to `generated.json` or `index.css`.
5. **Anonymization.** `npm run build && npm run check:publish` in `site/`. Then read `.agents/skills/docsite-anonymize-review/SKILL.md` and review the published content against it. State which of the two you did: the mechanical rules, the human review, or both.
6. **CLI version.** Compare the `@silverassist/docsite` devDependency in `site/package.json` with `npm view @silverassist/docsite version`, and read the package CHANGELOG between them for changes that matter.
7. **Deploy.** A workflow builds `site/`, runs `npm run check:publish` after the build, gives `npm ci` the `NPM_GITHUB_TOKEN` secret, sets `VITE_BASE_PATH` and copies `index.html` to `404.html`. See `.agents/skills/docsite-publish/SKILL.md`.
8. **Visibility.** If the repository is private and the deploy target is GitHub Pages, `acknowledgePublicPages` must be `true` and the decision must be written down somewhere the team can find it. Report if either is missing.

## Report

| Check                | Status   | Evidence                        |
| -------------------- | -------- | ------------------------------- |
| Config               | ✅/⚠️/❌ |                                 |
| Content and taxonomy | ✅/⚠️/❌ |                                 |
| Component drift      | ✅/⚠️/❌ | Files modified or missing       |
| Design rules         | ✅/⚠️/❌ | File and line of each violation |
| Anonymization        | ✅/⚠️/❌ | Mechanical, human or both       |
| CLI version          | ✅/⚠️/❌ | Installed and latest            |
| Deploy               | ✅/⚠️/❌ |                                 |
| Visibility           | ✅/⚠️/❌ |                                 |

End with the fixes in priority order, blockers first. Do not report a check as passed when you could not run it.
