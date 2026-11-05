# KnowFlow cloud-save benchmark (isolated local environment)

Test date: November 4, 2026 (America/Los_Angeles). Current revision: `2c9c48b`. See [environment and reproduction commands](../README.md).

| Scenario | Observed result | Outcome |
|---|---|---|
| Small graph: 10 nodes / 12 edges | 20/20 successful, 0 timeouts; median 14.83 ms | PASS |
| Large graph: 500 nodes / 1000 edges | 20/20 successful, 0 timeouts; median 190.42 ms | PASS |
| Historical client 5340404, small graph | 20/20 successful, 0 timeouts; median 17.83 ms | Comparison completed |
| Historical client 5340404, large graph | 20/20 successful, 0 timeouts; median 191.68 ms | Comparison completed |
| Same-account conflict in independent browser sessions | Same expectedVersion (7); A returned 200, B returned 409; A's content survived; B's edits were recovered as a new graph through the existing UI and verified by reading them back | PASS |
| Disconnect after editing | Not saved to cloud displayed; local draft retained; Retry save returned 200 after reconnection; a fresh session read the saved content | PASS |
| Ordinary-account isolation | Cross-account GET and PUT returned 404 GRAPH_NOT_FOUND in both directions | PASS |
| Existing automated tests | 43/43 passed on Node 22, none skipped | PASS |
| Production latency and reliability | No production project was accessed; no production measurements | NOT TESTED |

## Measurement scope

Timing starts at fetch dispatch and ends after the successful response is completely parsed and validated. It excludes the 600 ms autosave debounce. Edit-to-confirmation latency was not measured. All 40 successful samples checked version increments and verified the actual change with a separate GET. These are bounded synthetic observations, not a zero-data-loss guarantee or service SLA.

The pipeline uses the original application client, Worker fetch function through a Node HTTP adapter, real Supabase Auth, real PostgREST, and real PostgreSQL. It does not run on Cloudflare and includes no public-network RTT or TLS. The historical comparison replays the old client against backend code that is byte-identical to the current implementation; it is not a full historical UI deployment and supports no claim of an optimization-driven speedup.

## Browser observations

Exploratory runs found that opening a graph can itself trigger a save, making another session stale before its intended edit. The final test controls the browser debounce clock to ensure both sessions start at the same version; HTTP requests and database operations remain real. After an offline failure, the user must click Retry save. All identities, graphs, and local backups belong to synthetic test accounts.

## Evidence

Raw timings are in `api-results.csv/json` and `baseline-results.csv/json`. Additional evidence includes `browser-results.json`, `history-equivalence.txt`, `unit-tests.txt`, and the screenshots `conflict.png`, `offline.png`, and `fresh-session.png`. The initialization version mismatch is recorded in `initialization-conflict.json`.

## Resume bullets (local benchmark only)

- Benchmarked KnowFlow’s PostgreSQL-backed save pipeline in an isolated local environment, measuring median request-to-confirmation latency of 14.8 ms for 10-node graphs and 190.4 ms for 500-node graphs across 40 successful updates with read-back verification.
- Validated optimistic conflict handling, recovery-copy creation, offline retry persistence across fresh browser sessions, and cross-account read/write isolation using synthetic accounts and real Supabase Auth/PostgREST services.
