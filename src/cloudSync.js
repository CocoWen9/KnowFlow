// One write at a time per graph. A failed write retains its mutation ID so a
// retry is safe even when the server committed but the response was lost.
export function graphFingerprint(graph) {
  return JSON.stringify({ pinned: Boolean(graph.pinned), nodes: graph.nodes, edges: graph.edges })
}

export class CloudSync {
  constructor(repository, { onStatus = () => {}, onSaved = () => {}, onDraft = () => {}, uuid = () => crypto.randomUUID() } = {}) {
    this.repository = repository
    this.onStatus = onStatus
    this.onSaved = onSaved
    this.onDraft = onDraft
    this.uuid = uuid
    this.entries = new Map()
    this.stopped = false
  }

  seed(graph) {
    this.entries.set(graph.id, {
      version: graph.version ?? 0,
      fingerprint: graph.version ? graphFingerprint(graph) : null,
      pending: null, failed: null, error: null, task: null, deleted: false,
    })
  }

  queue(graph) {
    if (this.stopped) return
    if (!this.entries.has(graph.id)) this.seed(graph)
    const entry = this.entries.get(graph.id)
    if (entry.deleted) return
    const fingerprint = graphFingerprint(graph)
    if (fingerprint === (entry.pending?.fingerprint ?? entry.inFlight?.fingerprint ?? entry.failed?.fingerprint ?? entry.fingerprint)) return
    // Back up before sending. A storage failure must not be reported as saved.
    this.onDraft(graph.id, graph)
    entry.pending = { graph: structuredClone(graph), fingerprint }
    this.start(graph.id, entry)
  }

  start(id, entry) {
    if (entry.task || entry.error || this.stopped || entry.deleted) return
    entry.task = Promise.resolve().then(async () => {
      while ((entry.failed || entry.pending) && !this.stopped && !entry.deleted) {
        const job = entry.failed ?? { ...entry.pending, expectedVersion: entry.version, mutationId: this.uuid() }
        if (!entry.failed) entry.pending = null
        entry.failed = null
        entry.inFlight = job
        this.onStatus(id, { state: 'saving' })
        try {
          const saved = await this.repository.saveGraph(job.graph, {
            expectedVersion: job.expectedVersion, mutationId: job.mutationId,
          })
          entry.version = saved.version
          entry.fingerprint = job.fingerprint
          entry.inFlight = null
          if (entry.pending?.fingerprint === entry.fingerprint) entry.pending = null
          if (!this.stopped) {
            this.onSaved(id, saved)
            if (!entry.pending) this.onDraft(id, null)
            this.onStatus(id, { state: entry.pending ? 'saving' : 'saved' })
          }
        } catch (error) {
          entry.inFlight = null
          entry.failed = job
          entry.error = error
          if (!this.stopped) this.onStatus(id, {
            state: error.status === 409 ? 'conflict' : 'error', message: error.message,
          })
          break
        }
      }
    }).finally(() => {
      entry.task = null
      if (entry.pending || entry.failed) this.start(id, entry)
    })
  }

  async flush(id) {
    const entry = this.entries.get(id)
    if (!entry) return
    while (entry.task) await entry.task
    if (entry.error) throw entry.error
    return entry.version
  }

  retry(id) {
    const entry = this.entries.get(id)
    if (!entry || entry.error?.status === 409) return
    entry.error = null
    this.start(id, entry)
  }

  async remove(id) {
    const version = await this.flush(id)
    const entry = this.entries.get(id)
    if (version) await this.repository.deleteGraph(id, { expectedVersion: version })
    if (entry) entry.deleted = true
    this.onDraft(id, null)
  }

  async replace(graph) {
    const entry = this.entries.get(graph.id)
    if (entry?.task) await entry.task
    this.seed(graph)
    this.onStatus(graph.id, { state: 'saved' })
  }

  stop() { this.stopped = true }
}

export function draftStorageKey(userId) {
  return `knowflow.cloud-drafts.v1.${userId}`
}

export function readDrafts(storage, userId) {
  try {
    const drafts = {}
    const prefix = `${draftStorageKey(userId)}.`
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (!key?.startsWith(prefix)) continue
      try {
        const graph = JSON.parse(storage.getItem(key))
        if (graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges)) drafts[key.slice(prefix.length)] = graph
      } catch { /* One damaged draft must not hide the other backups. */ }
    }
    return drafts
  } catch { return {} }
}

export function writeDraft(storage, userId, id, graph) {
  // Independent keys prevent read/modify/write races between browser tabs.
  const key = `${draftStorageKey(userId)}.${id}`
  if (graph) storage.setItem(key, JSON.stringify(graph))
  else storage.removeItem(key)
}
