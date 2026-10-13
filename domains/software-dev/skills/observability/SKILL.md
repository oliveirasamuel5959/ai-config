---
name: observability
description: Make a system answer "what is it doing and why is it slow or broken" in production. Use when adding logging, metrics or tracing, defining SLIs and alerts, or debugging an incident without a debugger.
license: MIT
---

# Observability

Three signals, three jobs. Use each for what it is good at and keep the cost honest.

| Signal | Answers | Cost driver | Keep it |
| --- | --- | --- | --- |
| **Logs** | What happened, in detail, for one request | volume | structured, sampled at high volume |
| **Metrics** | How much, how fast, how often — aggregated and cheap | cardinality | low-cardinality, always on |
| **Traces** | Where the time went across services | sampling | sampled, with slow-trace capture |

## Structured logging

Emit **structured records, not prose**. One JSON object per event, with stable keys:

```json
{"ts":"2026-01-05T12:00:00Z","level":"error","event":"payment_failed","order_id":"o_123",
 "provider":"stripe","error_code":"card_declined","duration_ms":412,"trace_id":"abc123"}
```

Rules:

- **Never log secrets, tokens, passwords, full card numbers or personal data.** Redact at the
  logging boundary, not at each call site.
- **Log at boundaries**: incoming request, outgoing dependency call, state transition, error.
- **Levels mean something.** `error` = a human must act. `warn` = degraded but handled.
  `info` = a state change worth recording. `debug` = off in production.
- **Include a correlation id** (`trace_id`/`request_id`) on every line so one request can be
  reconstructed across services.
- **Do not log in a loop** over a large collection; log the aggregate.

## Metrics

- **The four golden signals**: latency, traffic, errors, saturation — per endpoint and per
  dependency.
- **Watch cardinality.** Never put a user id, order id or raw URL path into a metric label. It
  destroys the time-series database and the bill. Bucket paths (`/orders/{id}`) instead.
- **Histograms, not averages.** An average latency hides the p99 that users actually feel.
- Measurement names state the unit: `http_request_duration_seconds`.

## Tracing

- Propagate context across every service boundary — HTTP headers, message attributes, job
  payloads.
- Span the units that can be slow: the database query, the external call, the queue publish.
- Record errors and the status on the span, not only in logs.

## SLIs, SLOs and alerts

- Pick a **few SLIs** that map to the user's experience: availability, latency, correctness,
  freshness.
- Set an **SLO** with an error budget (e.g. 99.9% of requests under 300 ms over 30 days).
- **Alert on symptoms, not causes**: burn rate on the error budget, not CPU percentage. A page
  must mean "a user is affected now". Everything else is a ticket or a dashboard.
- Every alert names its **runbook** and its **owner**.

## Before shipping

- [ ] Can you answer "how do I know this works in production?" from a dashboard?
- [ ] Does every error path log with enough context to reproduce it?
- [ ] Is a correlation id propagated end to end?
- [ ] Are the alerts symptom-based, owned, and linked to a runbook?
- [ ] Is PII redacted at the boundary, verified by a test?
