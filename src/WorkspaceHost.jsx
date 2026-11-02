import { useEffect, useMemo, useRef, useState } from 'react'
import Workspace from './App.jsx'
import { AccountPanel } from './AccountPanel.jsx'
import { createCloudRepository, getAccessToken, supabase } from './cloudClient.js'
import { createGraphId, normalizeLibraryGraph } from './storage.js'

function emptyGraph() {
  const now = new Date().toISOString()
  return { id: createGraphId(), pinned: false, version: 0, createdAt: now, updatedAt: now, nodes: [], edges: [] }
}

export default function WorkspaceHost() {
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(!supabase)
  const [mode, setMode] = useState('cloud')
  const [showAccount, setShowAccount] = useState(false)
  const [cloudLibrary, setCloudLibrary] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [reload, setReload] = useState(0)
  const userId = session?.user?.id
  const previousUser = useRef(null)
  const repository = useMemo(() => createCloudRepository({
    getToken: () => getAccessToken(supabase, userId),
  }), [userId])

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    let authEventReceived = false
    supabase.auth.getSession().then(({ data, error }) => {
      if (!cancelled && !authEventReceived) {
        setSession(error ? null : data.session)
        setReady(true)
      }
    }).catch(() => { if (!cancelled) setReady(true) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      authEventReceived = true
      if (cancelled) return
      setSession(nextSession)
      setReady(true)
      if (nextSession?.user.id && previousUser.current !== nextSession.user.id) setMode('cloud')
      previousUser.current = nextSession?.user.id ?? null
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!userId || mode !== 'cloud') return
    let cancelled = false
    setCloudLibrary(null)
    setLoadError('')
    repository.listGraphs().then((stored) => {
      if (cancelled) return
      const graphs = stored.map(normalizeLibraryGraph).filter(Boolean)
      if (!graphs.length) graphs.push(emptyGraph())
      setCloudLibrary({ owner: userId, graphs, activeGraphId: graphs[0].id })
    }).catch((error) => { if (!cancelled) setLoadError(error.message) })
    return () => { cancelled = true }
  }, [userId, mode, reload, repository])

  const cloud = Boolean(userId && mode === 'cloud')
  const waiting = !ready || (cloud && cloudLibrary?.owner !== userId)

  return <>
    {waiting ? (
      <main className="workspace-loading">
        <h1>KnowFlow</h1>
        <p role={loadError ? 'alert' : 'status'}>{loadError || 'Opening your workspace…'}</p>
        {loadError && <button type="button" className="workspace-action" onClick={() => setReload((value) => value + 1)}>Try again</button>}
        <button type="button" className="workspace-action" onClick={() => { setMode('local'); setReady(true) }}>Open local workspace</button>
        <button type="button" className="workspace-action" onClick={() => setShowAccount(true)}>Account</button>
      </main>
    ) : (
      <Workspace
        key={cloud ? `cloud:${userId}:${reload}` : 'local'}
        initialLibrary={cloud ? cloudLibrary : undefined}
        repository={cloud ? repository : null}
        session={session}
        onAccount={() => setShowAccount(true)}
        onGoLocal={() => setMode('local')}
        onGoCloud={() => setMode('cloud')}
      />
    )}
    {showAccount && <AccountPanel user={session?.user} onClose={() => setShowAccount(false)} />}
  </>
}
