import { createClient } from '@supabase/supabase-js'

const environment = import.meta.env ?? {}
const supabaseUrl = (environment.VITE_SUPABASE_URL ?? '').trim()
const supabaseKey = (environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()

export const apiBaseUrl = (
  environment.VITE_API_URL || environment.VITE_AI_API_URL || ''
).trim().replace(/\/+$/, '')

export const cloudConfigured = Boolean(supabaseUrl && supabaseKey && apiBaseUrl)

export const supabase = cloudConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

const requestTimeoutMs = 20_000
const maximumRequestBytes = 1024 * 1024
const maximumResponseBytes = 10 * 1024 * 1024

export class CloudError extends Error {
  constructor(message, { status = 0, code = 'cloud_error' } = {}) {
    super(message)
    this.name = 'CloudError'
    this.status = status
    this.code = code
  }
}

function signInRequired() {
  return new CloudError('Please sign in again to access your graphs.', {
    status: 401,
    code: 'session_expired',
  })
}

export async function getAccessToken(client = supabase, expectedUserId = null) {
  if (!client) {
    throw new CloudError('Cloud sign-in is not available for this workspace yet.', {
      code: 'cloud_unavailable',
    })
  }

  let session

  try {
    const result = await client.auth.getSession()

    if (result.error) {
      throw signInRequired()
    }

    session = result.data?.session

    if (!session?.access_token || !Number.isFinite(session.expires_at)) {
      throw signInRequired()
    }

    if (session.expires_at <= Date.now() / 1000 + 30) {
      const refreshed = await client.auth.refreshSession()

      if (refreshed.error) {
        throw signInRequired()
      }

      session = refreshed.data?.session
    }
  } catch (error) {
    if (error instanceof CloudError) {
      throw error
    }

    throw signInRequired()
  }

  if (
    typeof session?.access_token !== 'string' ||
    (expectedUserId && session.user?.id !== expectedUserId) ||
    !session.access_token ||
    !Number.isFinite(session.expires_at) ||
    session.expires_at <= Date.now() / 1000
  ) {
    throw signInRequired()
  }

  return session.access_token
}

async function readResponse(response) {
  if (Number(response.headers.get('content-length')) > maximumResponseBytes) {
    await response.body?.cancel()
    throw new CloudError('This workspace is too large to load in one request.', {
      status: response.status,
      code: 'response_too_large',
    })
  }

  if (!response.body) {
    return null
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''

  try {
    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        break
      }

      bytesRead += value.byteLength

      if (bytesRead > maximumResponseBytes) {
        await reader.cancel()
        throw new CloudError('This workspace is too large to load in one request.', {
          status: response.status,
          code: 'response_too_large',
        })
      }

      text += decoder.decode(value, { stream: true })
    }

    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }

  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new CloudError('The server returned an unreadable response. Please try again.', {
      status: response.status,
      code: 'invalid_response',
    })
  }
}

function graphPath(id) {
  if (typeof id !== 'string' || !id.trim()) {
    throw new CloudError('Choose a graph before continuing.', {
      code: 'invalid_graph_id',
    })
  }

  return `/api/graphs/${encodeURIComponent(id)}`
}

function invalidResponse() {
  return new CloudError('The server returned an incomplete response. Please try again.', {
    code: 'invalid_response',
  })
}

export function createCloudRepository({
  getToken = getAccessToken,
  baseUrl = apiBaseUrl,
  fetchImpl = globalThis.fetch,
} = {}) {
  const endpoint = baseUrl.trim().replace(/\/+$/, '')

  async function request(path, { method = 'GET', body } = {}) {
    if (!endpoint) {
      throw new CloudError('Cloud storage is not available for this workspace yet.', {
        code: 'cloud_unavailable',
      })
    }

    let serializedBody

    if (body !== undefined) {
      try {
        serializedBody = JSON.stringify(body)
      } catch {
        throw new CloudError('This graph could not be saved. Please reload and try again.', {
          code: 'invalid_graph',
        })
      }

      if (new TextEncoder().encode(serializedBody).byteLength > maximumRequestBytes) {
        throw new CloudError('This graph is too large to save. Try splitting it into smaller graphs.', {
          status: 413,
          code: 'request_too_large',
        })
      }
    }

    const token = await getToken()

    if (typeof token !== 'string' || !token.trim()) {
      throw signInRequired()
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs)
    const isWrite = method !== 'GET'

    try {
      const response = await fetchImpl(`${endpoint}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
          ...(serializedBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: serializedBody,
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      })
      const data = await readResponse(response)

      if (!response.ok) {
        const message = typeof data?.error === 'string'
          ? data.error.slice(0, 300)
          : 'Your request could not be completed. Please try again.'

        throw new CloudError(message, {
          status: response.status,
          code: typeof data?.code === 'string' ? data.code.slice(0, 80) : 'request_failed',
        })
      }

      return data
    } catch (error) {
      if (error instanceof CloudError) {
        throw error
      }

      if (controller.signal.aborted) {
        throw new CloudError(
          isWrite
            ? 'The request timed out. Your changes may already be saved. Reload before trying again.'
            : 'The request timed out. Please try again.',
          { code: 'request_timeout' },
        )
      }

      throw new CloudError(
        isWrite
          ? 'The connection was interrupted. Your changes may already be saved. Reload before trying again.'
          : 'Could not connect. Check your connection and try again.',
        { code: 'network_error' },
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    async listGraphs() {
      const data = await request('/api/graphs')

      if (!Array.isArray(data?.graphs)) {
        throw invalidResponse()
      }

      return data.graphs
    },
    async getGraph(id) {
      const data = await request(graphPath(id))

      if (!data?.graph || typeof data.graph !== 'object' || Array.isArray(data.graph)) {
        throw invalidResponse()
      }

      return data.graph
    },
    async saveGraph(graph, { expectedVersion, mutationId } = {}) {
      const data = await request(graphPath(graph?.id), {
        method: 'PUT',
        body: { graph, expectedVersion, mutationId },
      })

      if (!data?.graph || typeof data.graph !== 'object' || Array.isArray(data.graph)) {
        throw invalidResponse()
      }

      return data.graph
    },
    async deleteGraph(id, { expectedVersion } = {}) {
      const data = await request(graphPath(id), {
        method: 'DELETE',
        body: { expectedVersion },
      })

      if (data?.deleted !== true) {
        throw invalidResponse()
      }

      return data
    },
  }
}
