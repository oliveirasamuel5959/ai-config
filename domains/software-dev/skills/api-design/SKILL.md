---
name: api-design
description: Design HTTP/REST and RPC interfaces that stay stable and are pleasant to call. Use when adding or changing endpoints, shaping request and response bodies, versioning an API, or defining error formats.
license: MIT
---

# API design

An API is a **contract with callers you cannot see**. Design for the caller's problem, and keep the
surface smaller than you are tempted to.

## Resources and routes

- Model **nouns, not verbs**: `POST /invoices`, not `POST /createInvoice`.
- Use plural nouns for collections; nest only one level deep (`/customers/{id}/invoices`). Deeper
  nesting is a sign the sub-resource deserves a top-level route.
- Verbs are acceptable for actions that are genuinely not CRUD: `POST /invoices/{id}/send`.
- Let the HTTP method carry the meaning — `GET` reads, `POST` creates, `PUT` replaces,
  `PATCH` updates partially, `DELETE` removes.
- Return the **created resource** (and its id) from `POST`, with `201` and a `Location` header.

## Idempotency and safety

- `GET`, `PUT`, `DELETE` must be idempotent. Retrying must not double-charge or double-create.
- For non-idempotent `POST`s that clients retry, accept an **idempotency key** and return the
  original result on replay.

## Status codes

Use the code that is true, not the one that is convenient:

- `200` / `201` / `204` — success, created, no content.
- `400` — malformed request. `422` — well-formed but semantically invalid.
- `401` — not authenticated. `403` — authenticated but not permitted.
- `404` — absent (also use it instead of `403` when revealing existence would leak information).
- `409` — conflict with current state. `429` — rate limited, with `Retry-After`.

## Response shape

- **Consistent envelope.** Pick camelCase or snake_case and never mix it within one API.
- **Return stable identifiers**, and never leak internal database keys if they are sensitive.
- **Paginate every collection** — cursor-based for large or mutating sets, offset for small static
  ones. Cap the page size and document the default.
- **Never return a bare array** at the top level; wrap it so you can add fields later.
- **Timestamps in UTC, ISO 8601**, always with a timezone.

## Errors

One error format, everywhere:

```json
{
  "error": {
    "code": "invoice_already_paid",
    "message": "Invoice 1234 was already paid on 2026-01-05.",
    "details": [{ "field": "amount", "issue": "must be positive" }]
  }
}
```

- `code` is a **stable machine-readable string** clients may branch on; `message` is for humans
  and may change freely.
- Validation errors name the offending field.
- Never put a stack trace or internal hostname in a response.

## Versioning and evolution

- **Additive changes are safe**: a new optional field, a new endpoint, a new enum value only if
  clients are told to tolerate unknown values.
- **Breaking changes need a new version**: removing or renaming a field, changing a type, making
  an optional field required, changing an error code's meaning.
- Prefer **versioning the media type or a path prefix** (`/v2/`), and keep at most two versions
  live. Publish a deprecation date and honor it.

## Documentation and validation

- Every endpoint documented with: method, path, auth, parameters, request example, response
  example, and each error code it can return.
- Validate input at the edge, before it reaches business logic, and reject unknown fields where
  silent tolerance would hide a client bug.

## Checklist before shipping an endpoint

- [ ] Idempotent where it must be; safe to retry.
- [ ] Paginated if it returns a collection.
- [ ] Errors follow the standard envelope with a stable code.
- [ ] Auth and authorization checked, not just authentication.
- [ ] New field optional, or the change is versioned.
- [ ] Rate limiting and payload size limits considered.
