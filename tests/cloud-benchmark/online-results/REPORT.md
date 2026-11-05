# KnowFlow production save benchmark and conflict fix

Test date: November 4, 2026 (America/Los_Angeles). Requests went from the test machine over public HTTPS to the deployed Cloudflare Worker and hosted Supabase. Tests used ordinary accounts and synthetic graphs.

| API run | Graph | Successful saves | Timeouts | Median request to confirmation |
|---|---|---:|---:|---:|
| Initial | 10 nodes / 12 edges | 20/20 | 0 | 273.85 ms |
| Initial | 500 nodes / 1000 edges | 20/20 | 0 | 661.00 ms |
| Two accounts | 10 nodes / 12 edges | 20/20 | 0 | 136.63 ms |
| Two accounts | 500 nodes / 1000 edges | 20/20 | 0 | 727.18 ms |

Timing starts at request dispatch and ends after the successful response has been parsed. The 600 ms autosave debounce and separate GET read-back are excluded. Every successful save passed read-back verification. The corresponding local medians were 14.83 ms and 190.42 ms. The two online batches are separate runs, both measured before the conflict fix. In the two-account run, cross-account GET and PUT in both directions all returned HTTP 404 `GRAPH_NOT_FOUND`.

## Reproduction and diagnosis

1. Two authenticated sessions loaded the same synthetic graph at version 1. Session A successfully saved version 2. Session B submitted a different edit with `expectedVersion: 1`.
2. The Worker returned HTTP 503 `CLOUD_UNAVAILABLE` after 15.08 s, consistent with its 15 s upstream timeout. Bypassing the Worker and calling `/rest/v1/rpc/save_graph` directly with the stale version produced no response within the 35 s probe deadline. A subsequent GET confirmed version 2 and A's content remained intact.
3. Supabase Logs Explorer showed repeated PostgreSQL `SQLSTATE 40001` entries roughly once per second for `public.save_graph`, with the exact message `Graph changed. Reload before saving.` The version check detected the conflict, but the hosted database API treated `40001` (serialization_failure) as retryable. Retrying could not make `expectedVersion: 1` match version 2.

## Production fix

The production Supabase SQL Editor successfully applied [202611040001_conflict_http_response.sql](../../../supabase/migrations/202611040001_conflict_http_response.sql). The migration updates the stale-version branches of `public.save_graph` and `public.delete_graph`. The functions now raise `SQLSTATE PGRST`, which instructs PostgREST to return HTTP 409. The response JSON still carries `code: "40001"`, allowing the deployed Worker to map it to HTTP 409 `VERSION_CONFLICT`. The migration changes how conflicts are reported and preserves the version checks and transaction behavior.

## Post-fix verification

| Scenario | Observed result |
|---|---|
| Worker conflict probe | HTTP 409 `VERSION_CONFLICT` in 104.24 ms. Read-back confirmed A's version 2 and content. |
| Direct Supabase RPC conflict probe | HTTP 409 with JSON code `40001` in 50.07 ms. |
| Browser conflict recovery | Two independent browser contexts started at version 1. A returned 200 and B returned 409. B saw `This graph changed elsewhere. Your edits are kept on this device.` The `Save my edits as a new graph` action created a separate graph, and both versions were verified by GET. |
| Browser offline retry | An edit remained in a local draft after an offline save attempt. After reconnecting, `Retry save` returned HTTP 200. A fresh browser context displayed the saved relationship. |
| Automated tests | 43/43 passed. |

The API probe timings are individual conflict responses. The browser harness controls the autosave clock to arrange the order of edits, while the deployed HTTP requests and the browser's offline setting are real. After sign-in, the harness closes the account dialog before editing so that it can use the graph controls.

## Commands and evidence

- `node tests/cloud-benchmark/current.mjs --online --account-b` produced [initial raw timings](api-results.csv).
- `node tests/cloud-benchmark/current.mjs --online` produced [two-account timings and isolation results](two-account-api-results.json).
- `node tests/cloud-benchmark/conflict-probe.mjs --online` produced the [before](conflict-probe.json) and [after](conflict-probe-fixed.json) responses, including request IDs and timestamps.
- `node tests/cloud-benchmark/browser.mjs --online` produced [browser recovery and offline retry results](browser-results-fixed.json).
