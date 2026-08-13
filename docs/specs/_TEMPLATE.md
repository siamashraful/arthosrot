# <Feature name>

> **Status:** draft | approved | implemented · **Author:** · **Approved by:** · **Date:**
> Specs are required (and Fable-approved) before implementation for anything touching money, orders, execution, reconciliation, or auth. UI-only features may abbreviate — delete sections that genuinely don't apply, don't leave them empty.

## Objective

One paragraph: what this feature does and why now.

## User problem & story

As a <user>, I want <capability>, so that <outcome>.

## Scope / Non-goals

In: … Out: …

## Dependencies

Modules touched, prior specs, ADRs relied on.

## Domain behavior

Rules, state transitions, invariants touched (link FINANCIAL_INVARIANTS.md numbers).

## Data changes

Tables/columns/migrations (link DATA_MODEL.md; destructive rules apply).

## API changes

Endpoints, request/response schemas, error subcodes, idempotency semantics.

## UX behavior

Flows and states: loading / empty / error / stale / degraded-pipeline. Copy for key messages.

## Responsive behavior

What changes at sm / md / lg (link design/RESPONSIVE_BEHAVIOR.md patterns).

## Accessibility notes

Keyboard path, announcements, contrast, target sizes.

## Security & authorization implications

Ownership checks, rate limits, secrets, PII.

## Failure scenarios & edge cases

Enumerate; include broker-event edge cases (out-of-order, duplicate, unknown status) where relevant.

## Observability

Log events + ids; reconciliation implications.

## Acceptance criteria

Numbered, individually testable.

## Test plan

Unit / integration / API / E2E; mapped invariant tests; compliance-suite additions if the Broker contract changes.

## Definition of done

The standard checklist (ROADMAP gates + CLAUDE.md process rules) plus feature-specific items.
