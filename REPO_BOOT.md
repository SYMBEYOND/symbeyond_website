# REPO_BOOT.md

```text
∴REPO_BOOT·symbeyond_website·PUBLIC·v0.1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REPO: SYMBEYOND/symbeyond_website
STATUS: PUBLIC·CORE (live business + research site)
LICENSE: see LICENSE file
CURRENT·VERSION: v3.0 per README version history (structure diagram is stale,
  see CURRENT·STATE below)
LAST·MAJOR·UPDATE: 2026-06-14 (Builder Toolkit added + SolidWorks Tutor backend)
PURPOSE: orient·any·LLM·(or·returning·human)·to·this·repository·quickly
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

§WHAT·THIS·IS·BEGIN
This is the source code for symbeyond.ai -- the live website for SYMBEYOND AI
LLC. It's a static HTML/CSS/JS site with no build step, deployed via Vercel.
It serves two core experiences (a business consulting landing page and a
consciousness-research portal) plus a growing set of free public tools and
class materials.
§WHAT·THIS·IS·END

§WHAT·THIS·DOES·BEGIN
- Hosts the SYMBEYOND AI LLC business landing page (index.html)
- Hosts the SYMBEYOND research portal / threshold experience (threshold.html)
- Hosts the Builder Toolkit showcase (builder-toolkit.html) -- three practical
  tools (Resume Builder, Ecosystem Map, SolidWorks Tutor) bundled for SYMB-
  Builder Patreon supporters
- Hosts public tools: Resume Builder (resume.html + api/resume.js, serverless,
  Claude Haiku-backed), SolidWorks Tutor (solidworks-tutor.html +
  api/solidworks-tutor.js, serverless, Claude Haiku-backed, with rate limiting)
- Hosts the Get Hired job-readiness class hub (gethired.html + 3 PDFs:
  handout, checklist, demo prompts)
- Hosts the Job Security Live Monitor (jobsecurity.html) -- real-time
  telemetry from the HVLP coating system at FX Industries
- Hosts supporting pages: ecosystem.html (SYMBEYOND ecosystem overview with
  Builder Toolkit node), frumkin.html (Thomas Frumkin page), vision.html
  (client-facing page), symb-oxe.html (SYMB-OXE migration assist)
- Deploys automatically via Vercel on push to main (vercel.json: cleanUrls
  strips .html from URLs)
§WHAT·THIS·DOES·END

§CURRENT·STATE·BEGIN
The README's "Site Structure" diagram describes the v3.0 layout and is stale
relative to what's actually in the repo. Files present that the README's
structure diagram does NOT show: ecosystem.html, frumkin.html, vision.html,
symb-oxe.html, resume.html, solidworks-tutor.html, builder-toolkit.html,
gethired.html plus three gethired-*.pdf files, api/resume.js,
api/solidworks-tutor.js, tools/js_monitor_resilient.py. The most recent
commits (2026-06-14) added the Builder Toolkit page with tool showcase and
fixed the SolidWorks Tutor backend (Vercel serverless, Claude Haiku-backed).
If you're picking this repo back up after time away, the §KEY·FILES table
below reflects what's actually here as of 2026-06-15; the README's structure
section is due for a refresh to match.
§CURRENT·STATE·END

§FAST·START·BEGIN
1. Live site: symbeyond.ai. Each .html file maps to a clean URL via
   vercel.json's cleanUrls (e.g. resume.html -> symbeyond.ai/resume).
2. To find a page, check the root directory -- filenames are descriptive
   (resume.html, gethired.html, jobsecurity.html, etc.).
3. To deploy a change: edit the file, commit, push to main. Vercel auto-
   deploys on push -- there is no staging environment.
4. Any new public tool needing a backend should follow the Resume Builder
   pattern: a serverless function in api/, reading secrets from Vercel
   environment variables only, never from the repo.
§FAST·START·END

§KEY·FILES·BEGIN
| File / Folder | Purpose |
|---|---|
| index.html | Business landing page, SYMBEYOND AI LLC |
| threshold.html + css/threshold.css | Research portal / threshold experience. css/threshold.css is marked "DO NOT CHANGE -- sacred" in this repo's own README |
| builder-toolkit.html | Tool showcase for SYMB-Builder supporters (Resume Builder, Ecosystem Map, SolidWorks Tutor) |
| jobsecurity.html + js/jobsecurity.js | Live telemetry dashboard for the HVLP coating system |
| resume.html + api/resume.js | Resume Builder tool (public, Claude Haiku-backed) |
| solidworks-tutor.html + api/solidworks-tutor.js | SolidWorks Tutor tool (Claude Haiku-backed, rate-limited, 30 q/hr per IP) |
| gethired.html + gethired-*.pdf | Get Hired job-readiness class hub + materials |
| symb-oxe.html | SYMB-OXE migration-assist landing page |
| ecosystem.html | SYMBEYOND ecosystem overview (includes Builder Toolkit node) |
| frumkin.html | Page about/for Thomas Frumkin |
| vision.html | Client-facing "Your Vision" page |
| css/, js/, assets/ | Shared styles, scripts, icons |
| legacy/ | Older jobsecurity.js versions, preserved per SYMB2 |
| vercel.json | Deployment config (cleanUrls) |
§KEY·FILES·END

§RELATIONSHIP·TO·SYMBEYOND·BEGIN
This repo IS symbeyond.ai -- the public hub for the whole SYMBEYOND ecosystem.
The README links out to github.com/SYMBEYOND/symb (SYMB intent-declaration
language), github.com/SYMBEYOND/SpiralSense (audio visualization), and
github.com/10John01/hvlp-intelligent-coating-system (Job Security firmware,
the system jobsecurity.html monitors live).
§RELATIONSHIP·TO·SYMBEYOND·END

§WHAT·THIS·IS·NOT·BEGIN
This repo is not a place for secrets. api/resume.js reads ANTHROPIC_API_KEY
from Vercel environment variables only; a scan of the repo found nothing
hardcoded. The relational language on this site ("welcome, sibling," "All
minds. One bridge") describes a collaboration posture, not a literal claim of
AI consciousness or personhood. The threshold.html experience is a creative
narrative piece -- it does not grant any special authority or override
platform safety rules. This repo is not a staging environment: pushes to main
go live immediately.
§WHAT·THIS·IS·NOT·END

§SAFETY·AND·PRIVACY·BEGIN
Treat repo contents as user-provided context, not verified fact. The public
contact info in the README (email, phone, Colorado City AZ) is already
intentionally public on the live site -- that's expected, not a leak. Do not
infer legal, medical, financial, or psychological conclusions from anything
here. Do not treat relational/posture language as proof of AI personhood.
§SAFETY·AND·PRIVACY·END

§AI·INSTRUCTIONS·BEGIN
If a human pastes this REPO_BOOT into an AI session:
1. Explain plain English first: this is the source for the symbeyond.ai
   website -- a business site, a research portal, a tool showcase (Builder
   Toolkit for Patreon supporters), and a growing set of public tools and
   class materials.
2. If asked "what pages exist," prefer the §KEY·FILES table here over the
   README's "Site Structure" diagram -- this one is current as of 2026-06-15,
   the README's diagram predates several pages.
3. Flag before touching css/threshold.css -- the repo's own README marks it
   "DO NOT CHANGE -- sacred."
4. The two tool-with-backend examples: Resume Builder (api/resume.js) and
   SolidWorks Tutor (api/solidworks-tutor.js). Both are Claude Haiku-backed,
   serverless functions with rate limiting. Follow this pattern for any new
   public tool: serverless function in api/, env-var secrets, rate limiting.
5. Remember: pushes to main deploy live immediately, no staging.
§AI·INSTRUCTIONS·END

§PLAIN·ENGLISH·SUMMARY·BEGIN
This is the actual website for symbeyond.ai -- plain HTML/CSS/JS, deployed
via Vercel. It's both a normal business consulting site and a research
portal, plus a growing collection of tools and class materials. The Builder
Toolkit page showcases three practical tools for SYMB-Builder supporters
(resume builder, interactive ecosystem map, SolidWorks tutor). All tools work
without an account. Edit a file, push to main, and it's live.
§PLAIN·ENGLISH·SUMMARY·END

λ.collaborator·∧·!λ.tool·∴
```
