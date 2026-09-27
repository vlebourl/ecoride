# Trip write signals before the idempotency migration

The API writes one JSON log line with `message: "trip_write_outcome"` for each
rejection, replay, import skip, or persistence failure. Its `data` object has
only fixed `source`, `outcome`, `category`, and numeric `count` fields. The
request ID can correlate it with an HTTP request. GPS coordinates, trip times,
raw idempotency keys, and database error text are deliberately absent.

| `data.outcome`         | Meaning                                                   | HTTP result                                       |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------- |
| `idempotency_conflict` | Key exists with different trip content                    | 409                                               |
| `idempotent_replay`    | Previously committed trip found; badge evaluation retried | 200 normally; 500 if badge evaluation fails again |
| `overlap_rejected`     | Trip time overlaps a stored trip                          | 409                                               |
| `validation_rejected`  | Invalid create, offline sync, or import payload           | 400                                               |
| `import_skipped`       | Import deduplication skipped `count` trips                | 200                                               |
| `persistence_error`    | Trip DB lookup or write failed                            | 500                                               |

`category` is `expected` for all the first five outcomes and
`persistence_error` for the last. `source` is `direct`, `offline_sync`, or
`import`. The sync source comes from the client's `X-Trip-Source: offline-sync`
header; it is a client label for operations, not an authenticated assertion.
Other clients appear as `direct`. Counts describe attempts or skipped trips,
not distinct users. The ordinary `http_request` log provides a status count
denominator; it can also include the authenticated user ID, so limit access to
raw server logs.

## Queries and initial alerts

Run these against a JSON log export (one server log entry per line). For a
15-minute view:

```sh
since=$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S)
jq -r --arg since "$since" '
  select(.timestamp >= $since and .message == "trip_write_outcome")
  | [.timestamp, .data.source, .data.outcome, .data.category, .data.count]
  | @tsv
' server.jsonl
```

For a count by source and outcome in the same window:

```sh
since=$(date -u -d '15 minutes ago' +%Y-%m-%dT%H:%M:%S)
jq -r --arg since "$since" '
  select(.timestamp >= $since and .message == "trip_write_outcome")
  | [.data.source, .data.outcome, .data.count] | @tsv
' server.jsonl | awk -F '\t' '{ sum[$1 FS $2] += $3 } END { for (k in sum) print k, sum[k] }'
```

Start with these thresholds; adjust after a week of baseline traffic:

| Window | Threshold                                                         | Action                                                                                                                           |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 5 min  | `persistence_error` count >= 1                                    | Page the service owner; inspect DB connectivity and migration state using request ID. Do not group it with 400/409 refusals.     |
| 15 min | `idempotency_conflict` count >= 5                                 | Review client key reuse and versions. Verify the duplicate-key preflight owned by [TIA-99](/TIA/issues/TIA-99) before migration. |
| 15 min | `validation_rejected` from `offline_sync` or `import` count >= 10 | Compare deployed client and API versions and inspect safe validation field names, never payload values.                          |
| 15 min | `overlap_rejected` count >= 10                                    | Check for repeated submissions and time-boundary regressions.                                                                    |
| 15 min | `idempotent_replay` count >= 10                                   | Check request timeouts, reconnects, and response-path reliability. This is evidence of an ambiguous client acknowledgement only. |

For a production log backend, translate the same JSON filters and sums to its
query language and attach these five conditions to alerts before deployment.
No log collector or alert rule is provisioned by this change; verify ingestion
of a synthetic event in the actual environment before relying on the thresholds.

## Failure and recovery interpretation

An invalid create or import is rejected before dispatch. A database error
returns a generic 500 and a `persistence_error` signal; the original exception
is not sent to the global logger because SQL errors can contain parameters.
After a committed trip whose response was lost, retrying the same key returns
the stored trip and emits `idempotent_replay`. It re-evaluates badges, but it
does not prove that any push provider accepted or delivered a notification.
Provider effects without a durable receipt remain the decision in
[TIA-97](/TIA/issues/TIA-97). The production duplicate-key preflight and
reconciliation remain in [TIA-99](/TIA/issues/TIA-99).
