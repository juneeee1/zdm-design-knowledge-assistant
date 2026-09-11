---
name: zdm-card-knowledge
description: Query and apply the SMZDM card design knowledge base. Use when a request mentions a ZDM card ID such as 20040 or 22001, asks which pages use a card, which cards appear on a page, compares similar card IDs, selects a card type, checks card states or variants, or audits a card/page relationship. Also use before proposing or implementing an SMZDM card so existing IDs and known variants are checked first.
---

# ZDM Card Knowledge

Use the bundled catalog as the factual source. Do not infer a card's purpose, status meaning, or difference from appearance alone.

## Workflow

1. Read `references/governance.md` before making lifecycle, confirmation, conflict, or deletion claims.
2. Run `node scripts/query-card.mjs ...` from this skill directory to retrieve the smallest relevant slice of `references/catalog.json`.
3. Cite the card ID, knowledge version, evidence level, and unresolved questions in the answer.
4. Distinguish Figma traceability from human confirmation. Never call a traceable relationship “人工已确认” unless `humanReview.status` is `approved`.
5. When the catalog lacks a business meaning or two similar IDs have no recorded difference, say it is unresolved and formulate a short question for a design owner.

## Query commands

```bash
node scripts/query-card.mjs info 20040
node scripts/query-card.mjs usages 20040
node scripts/query-card.mjs page "首页"
node scripts/query-card.mjs compare 20040 20041
node scripts/query-card.mjs search "暗色"
node scripts/query-card.mjs health
```

## Answer rules

- Treat one ID as one card type; list its states and configurable properties beneath that ID.
- Treat design and engineering IDs as a strict 1:1 mapping.
- Treat the large card-number heading on the Figma library page as the authoritative ID even when a Frame or component still has an old or base-card name.
- Treat notes beside examples as searchable knowledge, never as part of the card visual boundary or preview.
- Treat a business page, its scenes, its states, and raw Figma Frames as four different layers. Page-level answers must use `pageTaxonomy`; raw Frames are evidence, not independent top-level pages.
- Treat annotation-derived page locations as intended-use clues. Only a page design containing a traceable card node counts as verified usage.
- Treat cards as active unless explicitly deprecated or greyed in the source.
- Keep experiment, history, and A/B fields blank when the catalog has no approved value.
- Assume the ID/spec is shared across platforms unless an exception is recorded.
- Retain unconfirmed records. Never recommend deletion solely because nobody has confirmed them for a long time.
- For design-versus-implementation differences, report two facts: intended design and observed implementation. Design owns the intended visual specification; engineering owns implementation evidence; product participates when behavior or business logic changes.

## Updating the bundled data

This skill is a published snapshot. After the workspace catalog changes, rebuild `references/catalog.json` with the project script `scripts/build-skill-snapshot.mjs`, validate the skill, and publish a new knowledge version.
