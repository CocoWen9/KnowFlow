# KnowFlow local save benchmark — 2026-11-04

This directory contains synthetic-data tests only. No production requests or credentials were used. Application source was not modified.

## Environment and commands

macOS 27.2 arm64; Node 22.23.3; PostgreSQL 18.6 (embedded-postgres npm binary package 18.6.0-beta.19); Supabase Auth 2.197.0; PostgREST 16.5; Chrome headless via bundled Playwright. Plain HTTP loopback, no WAN, TLS, Cloudflare edge, or production load. The actual Worker `fetch` export runs through a Node HTTP adapter; this is not a workerd benchmark. Auth and SQL/RPC are real services, not mocks. Local Auth is configured to auto-confirm synthetic accounts; the reverse proxy does not implement production API-key validation. Ordinary user JWTs still pass Auth verification and PostgREST role checks.

Run from repository root with Node 22 on PATH (dependencies already installed):

```sh
sh tests/cloud-benchmark/setup.sh
node tests/cloud-benchmark/server.mjs > /tmp/knowflow-bench/services.log 2>&1
# In another terminal, after BENCH_READY:
node tests/cloud-benchmark/run.mjs        # first run: creates ordinary test accounts
node tests/cloud-benchmark/current.mjs    # final current sample, existing accounts
node tests/cloud-benchmark/baseline.mjs   # final baseline sample, sequentially
node tests/cloud-benchmark/browser.mjs
npm test
```

The server resets only its dedicated temporary benchmark database at localhost:55439 on startup. setup.sh needs outbound downloads and PostgreSQL needs shared-memory permission. Runtime files, synthetic passwords and database live under /tmp/knowflow-bench. Tests hardcode this machine's bundled Playwright and Chrome paths; adjust imports/executablePath on other machines. Default endpoints: UI5193, Worker8789, proxy54321, Auth55440, PostgREST55441. Do not expose these local services externally.

Latency starts immediately before actual fetch dispatch and stops after the repository has fully parsed and validated the successful response. It excludes auth token retrieval, JSON request serialization, the 600ms UI debounce, and subsequent GET verification. Each iteration changes an edge note, uses a new mutation UUID, checks version increment, then GETs the saved graph and asserts the note. Each graph is created before the measured samples; these are sequential warm-process updates, not cold-start timings. Large graph shape: balanced parent tree, 500 nodes and 1000 valid semantic edges; small: 10 nodes and 12 edges. Synthetic answers are fixed-size repeated text. Actual graph generation is in current.mjs. Deadline is the app's existing 20 seconds. Zero observed timeouts does not establish timeout recovery correctness or a long-term SLA.

Final raw records: results/api-results.json and .csv; baseline-results.json and .csv; summary.json. Initial exploratory samples were replaced with final sequential samples after closing concurrent browser activity. Each final set contains exactly 20 requests per graph size. Existing tests: results/unit-tests.txt (43/43).

Historical scope: baseline-client.mjs is extracted with `git show 5340404:src/cloudClient.js`. Client, sync, Worker and migration are byte-identical to HEAD 2c9c48b (results/history-equivalence.txt). The comparison replays the historical client against the shared identical backend, under the same local configuration, and is not a full historical UI deployment. Pre-5340404 has no cloud saves. The measured differences do not support a performance-improvement claim. Tests run current then baseline, without randomization, identical database reset, or multiple independent batches.

Browser evidence: results/browser-results.json and PNGs. Authentication uses the application's Supabase SDK signInWithPassword, not the account-dialog UI. Separate incognito contexts have isolated session/localStorage. Browser time is controlled to prevent the initial 600ms autosave from changing the starting version before edits; actual HTTP, Auth, RPC, SQL and network-offline behavior remain real. Clock-controlled runs are not edit-to-confirm latency measurements. A saves an edge note, B sends a different note with the same expectedVersion and receives 409; A's note is reread, B uses the existing Save my edits as a new graph button. Offline test submits an edit, disconnects before debounce, observes failure/localStorage draft, reconnects and clicks Retry save, then reads the note in a fresh context and via GET. Reconnection alone is not an automatic retry.

Exploratory finding: initialization can itself issue a save and make another already-open session stale. results/initialization-conflict.json records this version mismatch. It is a product observation, separate from the deliberately controlled conflict scenario.

Isolation: ordinary A and B tokens attempt GET and PUT on each other's known graph UUIDs through the actual application API. Both directions return 404 GRAPH_NOT_FOUND; no direct service-role or database-superuser token is used for these requests. This is a bounded functional isolation check, not a comprehensive security audit.

Stop the server with Ctrl-C (or terminate its exact PID); stop only this database with:

```sh
/tmp/knowflow-bench/bin/package/native/bin/pg_ctl -D /tmp/knowflow-bench/data stop
```
