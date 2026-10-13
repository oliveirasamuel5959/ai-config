---
name: doc
description: Write and update technical documentation grounded in the real code — ADRs, endpoint/model/component tables, Mermaid diagrams and a docs/ tree. Use when the user asks for documentation, ADRs, API or model references, component maps or architecture diagrams.
license: MIT
---

# Technical documentation

Document **what the code actually does**, never what you assume it does. Every claim must trace to
a file you read.

## Ground rules

- **Read before writing.** Inspect the source before producing a single line: entry points,
  routes, models, configuration and dependencies.
- **Never invent.** Do not describe a field, endpoint or parameter that is not in the code.
- **Preserve what you are not changing.** When updating an existing document, leave untouched
  sections intact and edit only the affected parts.
- **Show the plan first.** List the files you will create or modify and let the user confirm
  before writing.
- **Prefer diagrams where a picture is clearer.** Use Mermaid for flows, sequences, states and
  entity relationships.

## Workflow

1. **Explore** — read the code: stack, layout, entry points, data models, external dependencies.
2. **Inventory** — list existing `.md` files under `docs/`. Update what exists; create only what is
   missing.
3. **Propose** — present the create/modify list for confirmation.
4. **Write** — one document per concern, each with a short purpose line at the top.
5. **Report** — list the files written, with full paths.

## What to produce, and when

| Document | Use when | Lives at |
| --- | --- | --- |
| **ADR** | A decision had real alternatives and consequences | `docs/adr/NNNN-title.md` |
| **API reference** | The project exposes endpoints | `docs/api.md` |
| **Data model** | There are entities, tables or schemas | `docs/data-model.md` |
| **Component map** | Multiple services, modules or packages | `docs/architecture.md` |
| **Runbook** | Operators need to deploy, monitor or recover | `docs/runbook.md` |
| **README** | Someone must install and run it | `README.md` |

Skip what does not apply. Do not manufacture artifacts to fill a template.

## ADR shape

Title, status (proposed / accepted / superseded), context, decision, consequences, alternatives
considered. One page. The **alternatives** section is the point of the document — record why the
rejected options lost.

## Mermaid guidance

- Use the diagram type that matches the subject: `flowchart` for processes, `sequenceDiagram` for
  request lifecycles, `erDiagram` for schemas, `stateDiagram-v2` for state machines.
- Keep each diagram to one idea. A diagram that needs a legend has outgrown itself.
- Put node descriptions on one line; use `<br/>` for a line break inside a label — never a literal
  `\n`.
- Verify syntax by rendering before you commit the file.

## Quality bar

- **Concrete over generic.** `POST /invoices` with its request body, not "the API handles
  invoices".
- **Dates and owners** on ADRs and runbooks so stale documents are identifiable.
- **No stale copies.** Link to the code path (`src/billing/invoice.py`) instead of pasting code
  that will drift.
