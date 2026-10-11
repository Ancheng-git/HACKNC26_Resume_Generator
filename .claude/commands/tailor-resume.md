---
description: Generate an ATS-optimized tailored resume, plus visual Professional resume + cover letter versions, from a pasted job description
---

# Tailor Resume & Cover Letter

You are producing three tailored documents for the user (a plain ATS-safe resume, a visual "Professional" resume, and a matching Professional cover letter) for the job description provided in `$ARGUMENTS`. If no argument was given, check `jobs/` for `.txt`/`.md` files first:

- **No files in `jobs/`** → ask the user to paste the JD directly.
- **One or more files in `jobs/`** → this is a batch run. For EACH file found, execute steps 1 through 9 below yourself, in this same session, one JD at a time, in a loop. Do NOT invoke `/tailor-resume` again to process the next file — slash commands can only be typed by the user, not called by you as a sub-routine. You already have the full pipeline instructions below; just repeat them inline for each file until all are processed, then give one consolidated report at the end covering every JD.

## Local output policy — exactly one page per final document

Each of the three outputs must be exactly one US Letter page: ATS resume, Professional resume, and Professional cover letter. This overrides the upstream automatic two-page behavior. The core resume and background notes remain comprehensive and have no page limit.

Select relevant evidence rather than copying the whole master resume. For this early-career candidate, start with a 35-50 word profile, 3-4 relevant experience/project entries and 6-8 concise bullets total. Aim for roughly 350-450 words including sidebar content; these are drafting budgets, not proof of page count. Keep all retained dates, titles, and metrics faithful. Preserve training/competition/project labels. Omit less relevant entries and certificates rather than implying they never existed. Use 10.5-11 pt or larger for ATS body text; do not shrink professional body text below its current 9.5 pt. Keep margins and spacing readable. Never clip, hide, crop, or delete pages to pass.

For both Professional sidebars, use the same compact, source-grounded selection: about 4 contact lines, 4-6 brief expertise items, concise education with expected graduation, and at most 2 relevant course certificates. Do not silently turn an in-progress degree into an earned credential. Spell certificate names accurately; issuers may be shortened without changing their identity. The Professional resume photo is smaller to leave room for education. A full certificate inventory belongs in the reference files.

Draft the letter in 3-4 paragraphs, about 250-320 words. Avoid repeating the resume's entire chronology. The final ATS and Professional resumes must use the same selected profile and accomplishment bullets verbatim; the letter is independently drafted. If shortening is needed, revise the shared content and rebuild both resumes.

**Required validation:** LibreOffice and pymupdf (or pypdf) must be available. `scripts/check_pages.py` discovers the bundled Codex renderer when present, otherwise LibreOffice on PATH; `RESUME_SOFFICE` can select an explicit executable. Never substitute DOCX page metadata or an estimated page count. The Python Professional builders reject output before publishing if it has more than one rendered page or missing body/sidebar text. The ATS file must pass the same check in step 8c. Render and visually inspect all final pages as well: a page count alone does not prove readable or non-overlapping layout. If validation cannot run, stop and report that output is unverified; do not label it final.

## 0. Inputs you must read first

- `reference/core-resume.docx` — primary source of truth for all facts, dates, titles, metrics. **This file does not ship with this project — the user must supply their own.** If it's missing, stop and tell the user to add it before proceeding.
- `reference/background-notes.md` — secondary source of truth, an optional extended fact bank (e.g. pulled from a LinkedIn export) that the user can supply. Contains real facts (named tools, compliance frameworks, certifications, board/leadership roles, role-level detail) that don't appear in the core resume but are still real and usable for adjacent-skill matching in step 3. Never invent experience, skills, tools, or numbers that aren't grounded in EITHER of these two files. If this file doesn't exist, proceed using `reference/core-resume.docx` alone and note in your final report that no extended background notes were supplied.
- `reference/style-examples/` — the user's own APPROVED STYLE PATTERN resumes (up to two files, any format the `docx` skill can read). These are examples of tone, structure, and framing the user wants matched — not sources of new facts. If this folder is empty, tell the user in your final report that no style examples were supplied and that you defaulted to a straightforward professional format. When style examples exist, match their approach:
  - Headline/title line rewritten to match the target role
  - Executive profile paragraph rewritten in the target role's language
  - Competencies/Core Expertise section swapped to foreground JD-relevant terms
  - Per-employer bullets reworded to emphasize the metric/angle most relevant to this JD (same underlying facts, different framing — e.g., a throughput improvement can be framed as "scaling" for a growth-focused JD or "platform reliability" for an operations-focused JD)
  - Certifications and Technology sections reordered so the most JD-relevant items lead
- `reference/photo.jpg` — the user's headshot, used by the two Professional outputs in step 8b. **Required; does not ship with this project.** If it's missing, stop and tell the user to add it (see `reference/PUT_YOUR_PHOTO_HERE.md`) before proceeding.
- Node.js + `npm install` — the Professional cover letter renders via `scripts/build_cover_letter.js` (docx-js). If `node_modules/` doesn't exist in the project root, run `npm install` once before step 8b.

**Dollar-figure / metric phrasing convention:** If the user's `background-notes.md` or `core-resume.docx` defines an authoritative phrasing convention for budget/spend figures (e.g., always phrase as "$XMM in spend", not "annual business value"), follow it consistently across the resume and cover letter. Do not alter the underlying numbers when tailoring — only the phrasing may be adapted to fit sentence flow. If the user has flagged specific figures as corrected/authoritative (superseding older phrasings), always use the corrected version, even if an older phrasing resurfaces from a prior draft or output file.

**Employment status and tense:** Use past tense for any role the user's source documents mark as ended, and present tense only for a role explicitly marked current/ongoing. Check `reference/core-resume.docx` (and `background-notes.md`, if supplied) for the authoritative employment dates and status before drafting any bullet.

## 1. Classify the role bucket

Choose the framing that matches the JD: Data Science / Analytics (statistics, data quality, metrics, visualization, interpretation) or ML / AI Engineering (model evaluation, implementation, retrieval and agent workflows). For mixed roles, choose the dominant emphasis and explain it. Do not frame this student as a senior product executive or claim a past job title merely because it is the target role.

## 2. Extract keywords from the JD

Read the JD closely and produce a `keywords_<Company>.json` (must_have / nice_to_have) — see `reference/keywords_schema.json` for the format. Name it per-company (not a shared `keywords.json`) so a batch run never has one JD's file overwritten by the next before it's used. Must-have = explicitly required qualifications/skills stated in the JD ("required," "must have," or listed under a core requirements section). Nice-to-have = "preferred," "bonus," or implied-but-not-required skills.

## 3. Match keywords against the user's real background

For each keyword, check BOTH `reference/core-resume.docx` and `reference/background-notes.md` (if supplied). Matching rules:

- **Direct match**: term or a clear synonym appears in either source → use as-is.
- **Reasonable adjacent match**: the JD term is a plausible near-neighbor of something the user has actually done, in either source (e.g., JD says "stakeholder management," core resume says "cross-functional leadership"; or JD says "regulatory compliance," background-notes.md has named compliance frameworks) → this is allowed and should be reflected using the JD's terminology, since the underlying capability is real.
- **No match in either file**: do not fabricate. Note it in the gap summary instead of stretching the resume to claim it.

## 4. Domain framing (Executive Profile / summary)

This is separate from step 3 — step 3 matches individual skills/tools/keywords; this step governs how the **Executive Profile / summary section** handles industry/domain language specifically. It is a stricter version of the no-fabrication rule, applied to industry/domain claims:

- Identify the JD's specific industry/domain (e.g., EdTech, FinTech, PropTech, AdTech, healthcare).
- Check the user's real background (`reference/core-resume.docx` + `reference/background-notes.md`) for direct experience in that exact domain.
- **Direct domain experience exists** → name it normally in the Executive Profile, as usual.
- **Direct domain experience does NOT exist** → do not state or imply direct experience in that domain, in the Executive Profile or anywhere else. Instead, bridge via the closest genuinely-true adjacent domain or business model from the user's real background (e.g., consumer mobile products, subscription/freemium business models, data-driven engagement products, B2B SaaS at scale) — using only domains/models the user has actually worked in. Never state or imply industry expertise the user doesn't have, even loosely or in passing.

Carry the result of this step into step 9 (Report back) as the "Domain fit" line — required for every JD, every run.

## 5. Draft the tailored resume

Using `reference/core-resume.docx` as the base and any supplied `reference/style-examples/` docs as the tone/framing pattern, draft one shared `professional_<Company>.json` in the existing Professional content shape. This is the single selected content source for both resumes. Build the ATS file with `python3 scripts/build_ats_resume.py professional_<Company>.json output/Resume_<Company>_<Date>.docx`; do not invent a per-task ATS layout or rewrite the generator. Existing Professional JSON remains valid. Optional ATS-only fields are `technical_skills` and `additional` (arrays of source-grounded strings), education `dates` and `details` (string and string array), and experience `kind` (`employment`, `training`, `project`, `competition`; omitted means employment). Preserve training/competition/project labels in titles so the Professional layout is equally clear. These optional fields are ignored by the existing Professional layouts. Use US Letter page size, no tables/text boxes/multi-column layouts, no header/footer content, standard fonts only (Calibri, Arial, Georgia, or Cambria). This is a hard requirement — the ATS format check in step 7 will fail the resume otherwise.

**Avoid cross-section repetition:** Several JD-relevant points — comfort with ambiguity/fast-moving environments is a common recurring one, but the same risk applies to any other point (e.g., cross-functional influence, data-driven decision-making) that naturally fits the Executive Profile, a Key Results bullet, and a per-role bullet — legitimately belong in more than one section. When a point needs to appear more than once in the same document, vary the phrasing each time; never reuse the same sentence or near-identical wording twice within a single document. Before finalizing, scan the full draft for repeated multi-word phrases across the Executive Profile, Key Results, Core Competencies, and per-role bullets, and reword every repeat so each instance reads distinctly.

## 6. Draft the cover letter

Generate a fresh, professional cover letter (not reused from any fixed template) — proper business letter heading (the user's contact info, date, hiring company/manager if named in the JD, salutation), 3-4 paragraphs: opening hook tied to the specific role, 1-2 paragraphs connecting the user's real background to the JD's top priorities, closing with a call to action. This step drafts the letter **content** only (recipient, salutation, paragraphs, closing). It is not saved as its own plain `.docx` and is not ATS-checked. Step 8b renders it as the Professional cover letter. The domain-framing decision from step 4 applies here too — never claim or imply direct domain experience the Executive Profile doesn't claim.

**Strengths-forward only — never write gap language into the letter.** The letter must not contain any gap or limitation sentence: no "I don't have experience in X," "while I lack…," "I have not owned…," "to be candid about fit," "my experience is shorter than the N years listed," or a closing like "if that trade-off works for your team." When step 3 found a genuine gap:
- Say nothing about the gap itself. Do not name the missing skill, tool, domain, or years requirement in a negative or hedged way.
- Use that paragraph for the closest real, transferable experience from the user's source files, stated positively and confidently (e.g., for a missing domain, the adjacent domain or business model from step 4; for a missing tool, the real capability the tool serves).
- Never overcorrect into claiming the gap. The no-fabrication rule still applies, so the transferable strength must be true as written.
- The honest gap analysis goes into the step 9 report ONLY.

Before moving on, reread the drafted letter and remove any sentence that admits a gap or limitation.

## 7. Run the ATS check

```bash
python3 scripts/ats_check.py output/Resume_<Company>_<Date>.docx keywords_<Company>.json
```

An empty keyword inventory is invalid. Record the JD source phrases for keywords in the final report and keep the inventory stable during content revisions. Format violations must be fixed regardless of the composite score; the three-pass gap exception never permits forbidden layouts. If the composite score is below 80, or must-have keyword coverage is below 90%, revise the shared JSON (reweave missing must-have terms into existing bullets/competencies where truthfully supportable), rebuild both resumes from it and re-run the check. Do not loop more than 3 times — if you can't close the gap without fabricating, stop and report the genuine gaps to the user instead.

**Local API publication rule (when `completion.json` is required):** Both thresholds must pass: composite >= 80 AND must-have coverage >= 90%. A composite of 93 with must-have coverage of 83% is still below threshold. To publish below either threshold, complete three actual source-grounded review/revision-and-recheck passes and report the remaining gaps. In each pass, review the missing requirements against the reference files, revise only when evidence supports it, rebuild both resumes if content changes, and rerun the ATS check. If no truthful change is possible, keep the content unchanged and document that finding and the recheck score; never add an unsupported tool or remove a required keyword to raise coverage. Record each completed pass and its scores in `report.md`, and record only the actual count in `completion.json`. A first check plus an early gap report with `revision_passes: 0` does not qualify for publication. Never set the count to 3 without doing the three passes. If this process cannot be completed, report failure rather than claiming the application is ready.

## 8. Save outputs

Save to the flat `output/` folder using this naming convention (all three are required, every JD):

- `output/Resume_<Company>_<YYYY-MM-DD>.docx`
- `output/Professional_<Company>_<YYYY-MM-DD>.docx`
- `output/Professional_CoverLetter_<Company>_<YYYY-MM-DD>.docx`

Use today's date and the company name extracted from the JD (sanitize for filesystem: no spaces → underscores, no special characters).

## 8b. Build the Professional (visual) versions

After the ATS resume has passed (or exhausted) the step 7 loop, build the two visual "Professional" documents: a two-column layout with a navy photo sidebar. **Do not redraft anything.** Both reuse the final, already-tailored content from steps 5–7:

- **Identity/sidebar fields** (`name`, `credentials`, `contact`, `education`, `certifications`): pull these from `reference/core-resume.docx` and explicitly confirmed additions/corrections in `reference/background-notes.md`. Use exactly what the user's source files say. Never invent or embellish. Omit `credentials`/`certifications` if the user has none; the scripts drop those sidebar sections when they're empty.
- **Professional resume content** (`headline`, `tagline`, `profile`, `core_expertise`, `experience`): copy the final headline, Executive Profile, Core Competencies, and per-role bullets from the ATS resume as finalized in step 7. Keep only 4-6 brief, JD-relevant competencies for the sidebar. `**bold**` markup may highlight metrics.
- **Professional cover letter content** (`date`, `recipient`, `salutation`, `paragraphs`, `closing`): copy verbatim from the step 6 cover letter draft. Use the same `core_expertise` list as the Professional resume.

Reuse the final shared `professional_<Company>.json` from steps 5–7 without redrafting it. Write the independently drafted letter to `cover_professional_<Company>.json` in the project root (format: `reference/professional_schema.json`), then run:

```bash
python3 scripts/build_professional.py professional_<Company>.json output/Professional_<Company>_<Date>.docx
python3 scripts/build_cover_letter_professional.py cover_professional_<Company>.json output/Professional_CoverLetter_<Company>_<Date>.docx
```

**These two files are NOT ATS-checked. Never run them through `ats_check.py`.** They intentionally use images, positioned frames, header-anchored background bands, and a table layout, all of which break ATS parsers. They are for human readers: networking, direct email to a hiring manager, in-person handoffs, and any portal cover-letter upload field. The ATS resume remains the resume to upload to application portals. The no-fabrication, domain-framing, and repetition rules already applied to the source content carry over unchanged.

If either script fails, fix the content JSON (a missing required field is the usual cause) and re-run. Don't skip the output.

## 8c. Verify all three final documents are one page

Run the final files through the strict checker after every content/layout change:

```bash
python3 scripts/check_pages.py output/Resume_<Company>_<Date>.docx output/Professional_<Company>_<Date>.docx output/Professional_CoverLetter_<Company>_<Date>.docx
```

Also run `python3 scripts/build_ats_resume.py professional_<Company>.json --verify output/Resume_<Company>_<Date>.docx output/Professional_<Company>_<Date>.docx`. This checks that selected profile, bullets and role fields survive both layouts. It does not establish source truth: separately compare titles, dates, metrics and units against the reference documents. If the ATS is below the suggested drafting budget or the rendered page has substantial blank space, review the sources for relevant omitted projects, skills or education detail. Restore useful evidence when it fits; do not pad, duplicate or invent content. In report.md, explain major omitted entries, source-grounded selection and any unresolved short-content or visual concerns. Qualifications such as graduation dates and experience years are fit checks, not keyword matches.

If any file fails, shorten lower-priority content or the sidebar, rebuild the affected outputs, and re-run. If shared resume content changes, update both resume versions and re-run the ATS check. Use at most 3 content revision passes; if it still fails, report the failure instead of delivering a two-page file as final. Inspect the rendered pages for overlap and readability, especially the sidebar bottom, then report the actual rendered page count for all three.

## 9. Report back

For each JD processed, summarize:
- Role bucket classification (and why)
- **Domain fit** — always include this line, every JD, every run: either "Direct domain match" (name the domain) or the adjacent domain/business model used to bridge the gap (per step 4). Never omit this line, even when the gap is small.
- Final ATS composite score + must-have/nice-to-have coverage
- Any genuine gaps (JD requirements with no real match in the user's background) — surfaced honestly, not papered over. This report is the ONLY place gap language belongs; the cover letter never contains it. For each gap, name the transferable strength the cover letter used in its place.
- File paths of all three output documents (ATS resume, Professional resume, Professional cover letter), noting that the two Professional files are not ATS-checked

- Verification: exactly 1 rendered page per output, with no missing body/sidebar text; disclose any unresolved check failure.
