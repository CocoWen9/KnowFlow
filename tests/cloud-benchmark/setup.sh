#!/bin/sh
set -eu
BENCH_ROOT=/tmp/knowflow-bench
mkdir -p "$BENCH_ROOT/bin"
curl -fL https://github.com/supabase/auth/releases/download/v2.197.0/auth-v2.197.0-darwin-arm64.tar.gz -o "$BENCH_ROOT/auth.tgz"
curl -fL https://github.com/PostgREST/postgrest/releases/download/v16.5/postgrest-v16.5-macos-aarch64.tar.xz -o "$BENCH_ROOT/rest.tar.xz"
curl -fL https://registry.npmjs.org/@embedded-postgres/darwin-arm64/-/darwin-arm64-18.6.0-beta.19.tgz -o "$BENCH_ROOT/pg.tgz"
tar -xzf "$BENCH_ROOT/auth.tgz" -C "$BENCH_ROOT/bin"
tar -xf "$BENCH_ROOT/rest.tar.xz" -C "$BENCH_ROOT/bin"
tar -xzf "$BENCH_ROOT/pg.tgz" -C "$BENCH_ROOT/bin"
npm install --prefix "$BENCH_ROOT" pg --ignore-scripts --no-audit --no-fund
if [ ! -d "$BENCH_ROOT/data" ]; then
 "$BENCH_ROOT/bin/package/native/bin/initdb" -D "$BENCH_ROOT/data" -U postgres -A trust --no-locale --encoding=UTF8
fi
"$BENCH_ROOT/bin/package/native/bin/pg_ctl" -D "$BENCH_ROOT/data" -l "$BENCH_ROOT/postgres.log" -o '-h 127.0.0.1 -p 55439 -k /tmp' start
