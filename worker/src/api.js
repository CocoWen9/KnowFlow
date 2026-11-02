const maximumBodyBytes = 1024 * 1024
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function cloudConfigured(env) {
  // Partial configuration must fail closed, including for the AI endpoint.
  return Boolean(env.SUPABASE_URL || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY)
}

function configuration(env) {
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY
  let url
  try {
    url = new URL(env.SUPABASE_URL)
  } catch {
    throw new ApiError(503, 'CLOUD_NOT_CONFIGURED', 'Cloud storage is not configured.')
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  let elevatedKey = typeof key === 'string' && key.startsWith('sb_secret_')
  try {
    const payload = key?.split('.')[1]
    if (payload) elevatedKey ||= JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))).role === 'service_role'
  } catch { /* Publishable keys are not JWTs. */ }
  if (!key || elevatedKey || (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new ApiError(503, 'CLOUD_NOT_CONFIGURED', 'Cloud storage is not configured.')
  }
  return { baseUrl: url.origin, key }
}

async function upstream(url, options, fetchImpl) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  try {
    const response = await fetchImpl(url, { ...options, signal: controller.signal })
    const body = await response.json().catch(() => null)
    return { response, body }
  } catch {
    throw new ApiError(503, 'CLOUD_UNAVAILABLE', 'Cloud storage is temporarily unavailable. Please retry.')
  } finally {
    clearTimeout(timeout)
  }
}

export async function authenticate(request, env, fetchImpl = fetch) {
  const config = configuration(env)
  const authorization = request.headers.get('Authorization') || ''
  if (!/^Bearer\s+\S+$/i.test(authorization) || authorization.length > 8192) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Sign in to continue.')
  }
  const headers = { apikey: config.key, Authorization: authorization }
  const { response, body } = await upstream(`${config.baseUrl}/auth/v1/user`, { headers }, fetchImpl)
  if (response.status >= 500 || response.status === 429) {
    throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Sign-in verification is temporarily unavailable. Please retry.')
  }
  if (!response.ok || !uuidPattern.test(body?.id || '')) {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Your session expired. Please sign in again.')
  }
  return { ...config, headers, userId: body.id }
}

export async function readJson(request) {
  const declaredSize = Number(request.headers.get('Content-Length'))
  if (declaredSize > maximumBodyBytes) {
    throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'This graph is too large to save.')
  }
  const reader = request.body?.getReader()
  const chunks = []
  let total = 0
  try {
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maximumBodyBytes) {
          await reader.cancel()
          throw new ApiError(413, 'PAYLOAD_TOO_LARGE', 'This graph is too large to save.')
        }
        chunks.push(value)
      }
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
    const body = JSON.parse(new TextDecoder().decode(bytes))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid object')
    return body
  } catch (error) {
    if (error instanceof ApiError) throw error
    throw new ApiError(400, 'INVALID_REQUEST', 'Request body must be a valid JSON object.')
  } finally {
    reader?.releaseLock()
  }
}

async function rpc(auth, name, args, fetchImpl) {
  const { response, body } = await upstream(`${auth.baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...auth.headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  }, fetchImpl)
  if (response.ok && body !== null) return body
  if (body?.code === '40001') {
    throw new ApiError(409, 'VERSION_CONFLICT', 'This graph changed elsewhere. Reload the cloud version before saving.')
  }
  if (body?.code === 'P0002') throw new ApiError(404, 'GRAPH_NOT_FOUND', 'This graph is no longer available.')
  if (response.status === 401 || body?.code === 'PGRST301' || body?.code === 'PGRST303') {
    throw new ApiError(401, 'AUTH_REQUIRED', 'Your session expired. Please sign in again.')
  }
  if (response.status === 403 || body?.code === '42501') {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have access to this graph.')
  }
  if (/^(22|23)/.test(body?.code || '') || body?.code === 'P0001') {
    throw new ApiError(400, 'INVALID_GRAPH', 'The graph contains invalid data or relationships.')
  }
  throw new ApiError(503, 'CLOUD_UNAVAILABLE', 'Cloud storage is temporarily unavailable. Please retry.')
}

function validateVersion(value, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum || value > 2147483646) {
    throw new ApiError(400, 'INVALID_VERSION', 'A valid graph version is required.')
  }
}

export async function handleGraphs(request, env, fetchImpl = fetch) {
  const pathname = new URL(request.url).pathname
  const match = pathname.match(/^\/api\/graphs(?:\/([^/]+))?\/?$/)
  if (!match) throw new ApiError(404, 'NOT_FOUND', 'Not found.')
  const graphId = match[1]
  if (graphId && !uuidPattern.test(graphId)) throw new ApiError(400, 'INVALID_GRAPH_ID', 'A valid graph ID is required.')
  if ((!graphId && request.method !== 'GET') || (graphId && !['GET', 'PUT', 'DELETE'].includes(request.method))) {
    throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed.')
  }
  const auth = await authenticate(request, env, fetchImpl)
  if (request.method === 'GET') {
    return graphId
      ? { graph: await rpc(auth, 'get_graph', { p_graph_id: graphId }, fetchImpl) }
      : { graphs: await rpc(auth, 'list_graphs', {}, fetchImpl) }
  }
  const body = await readJson(request)
  validateVersion(body.expectedVersion, request.method === 'DELETE' ? 1 : 0)
  if (request.method === 'DELETE') {
    return rpc(auth, 'delete_graph', { p_graph_id: graphId, p_expected_version: body.expectedVersion }, fetchImpl)
  }
  if (!uuidPattern.test(body.mutationId || '')) throw new ApiError(400, 'INVALID_MUTATION_ID', 'A valid save request ID is required.')
  const graph = body.graph
  if (!graph || typeof graph !== 'object' || Array.isArray(graph) || graph.id !== graphId || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || graph.nodes.length > 1000 || graph.edges.length > 3000) {
    throw new ApiError(400, 'INVALID_GRAPH', 'A valid graph with nodes and edges is required.')
  }
  return { graph: await rpc(auth, 'save_graph', {
    p_graph_id: graphId,
    p_expected_version: body.expectedVersion,
    p_graph: graph,
    p_mutation_id: body.mutationId,
  }, fetchImpl) }
}
