import { mkdirSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

export function loadBenchmarkConfig() {
  const online = process.argv.includes('--online')
  if (!online) return JSON.parse(readFileSync('/tmp/knowflow-bench/config.json', 'utf8'))

  const credentials = parseEnv(readFileSync('.env.benchmark.local', 'utf8'))
  const deployment = parseEnv(readFileSync('.env.local', 'utf8'))
  for (const key of ['EMAIL_A', 'PASSWORD_A', 'EMAIL_B', 'PASSWORD_B']) {
    if (!credentials[key]) throw new Error(`Set ${key} in .env.benchmark.local`)
  }
  if (credentials.EMAIL_A.toLowerCase() === credentials.EMAIL_B.toLowerCase()) {
    throw new Error('Use two distinct test accounts')
  }
  const supabaseUrl = deployment.VITE_SUPABASE_URL
  const anonKey = deployment.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!supabaseUrl || !anonKey || !new URL(supabaseUrl).hostname.endsWith('.supabase.co')) {
    throw new Error('Expected the deployed Supabase URL and publishable key in .env.local')
  }
  const outputDir = '/tmp/knowflow-online-benchmark'
  mkdirSync(outputDir, { recursive: true, mode: 0o700 })
  return {
    online,
    frontendUrl: 'https://cocowen9.github.io/KnowFlow/',
    apiUrl: 'https://knowflow-ai.knowflow.workers.dev',
    supabaseUrl,
    anonKey,
    emailA: credentials.EMAIL_A,
    passwordA: credentials.PASSWORD_A,
    emailB: credentials.EMAIL_B,
    passwordB: credentials.PASSWORD_B,
    outputDir,
  }
}
