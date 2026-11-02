import { useEffect, useId, useRef, useState } from 'react'
import { cloudConfigured, supabase } from './cloudClient.js'
import './cloud.css'

function accountError(error) {
  if (error?.code === 'invalid_credentials') {
    return 'The email or password is incorrect. Please try again.'
  }

  if (error?.code === 'email_not_confirmed') {
    return 'Confirm your email before signing in.'
  }

  if (error?.code === 'weak_password') {
    return 'Choose a stronger password with at least 8 characters.'
  }

  if (error?.status === 429) {
    return 'There have been too many attempts. Please wait a moment and try again.'
  }

  return 'We couldn’t complete that request. Please try again.'
}

export function AccountPanel({ user, onClose }) {
  const titleId = useId()
  const descriptionId = useId()
  const emailId = useId()
  const passwordId = useId()
  const dialogRef = useRef(null)
  const mountedRef = useRef(false)
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const dialog = dialogRef.current
    mountedRef.current = true

    if (dialog && !dialog.open) {
      dialog.showModal()
      dialog.querySelector('[data-initial-focus]')?.focus()
    }

    return () => {
      mountedRef.current = false
      dialog?.close()

      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus()
      }
    }
  }, [])

  function changeMode() {
    setMode((currentMode) => currentMode === 'signin' ? 'signup' : 'signin')
    setPassword('')
    setError('')
    setMessage('')
  }

  async function submit(event) {
    event.preventDefault()

    if (busy || !supabase) {
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const credentials = { email: email.trim(), password }
      const result = mode === 'signup'
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials)

      if (result.error) {
        throw result.error
      }

      if (mountedRef.current) {
        setPassword('')
        setMessage(mode === 'signup' && !result.data?.session
          ? 'Check your email to confirm your account, then sign in.'
          : 'You’re signed in.')
      }
    } catch (authError) {
      if (mountedRef.current) {
        setError(accountError(authError))
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false)
      }
    }
  }

  async function signOut() {
    if (busy || !supabase) {
      return
    }

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const result = await supabase.auth.signOut({ scope: 'local' })

      if (result.error) {
        throw result.error
      }

      if (mountedRef.current) {
        setPassword('')
        setMessage('You’re signed out.')
      }
    } catch (authError) {
      if (mountedRef.current) {
        setError(accountError(authError))
      }
    } finally {
      if (mountedRef.current) {
        setBusy(false)
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="account-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        if (event.target !== event.currentTarget) {
          return
        }

        const bounds = event.currentTarget.getBoundingClientRect()

        if (
          event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom
        ) {
          onClose()
        }
      }}
    >
      <div className="account-panel">
        <div className="account-panel__header">
          <h2 id={titleId}>
            {user ? 'Your account' : mode === 'signup' ? 'Create an account' : 'Sign in'}
          </h2>
          <button
            type="button"
            className="account-panel__close"
            aria-label="Close account panel"
            onClick={onClose}
            data-initial-focus={!cloudConfigured || user ? '' : undefined}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {!cloudConfigured ? (
          <p id={descriptionId} className="account-panel__description">
            Cloud sign-in is not available for this workspace yet.
          </p>
        ) : user ? (
          <div className="account-panel__signed-in">
            <p id={descriptionId} className="account-panel__description">
              You’re signed in as <strong>{user.email || 'a KnowFlow member'}</strong>.
            </p>
            <button
              type="button"
              className="account-panel__button account-panel__button--secondary"
              disabled={busy}
              onClick={signOut}
            >
              {busy ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        ) : (
          <>
            <p id={descriptionId} className="account-panel__description">
              Save your knowledge graphs to your account.
            </p>
            <form className="account-panel__form" onSubmit={submit} aria-busy={busy}>
              <div className="account-panel__field">
                <label htmlFor={emailId}>Email</label>
                <input
                  id={emailId}
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                  data-initial-focus=""
                />
              </div>
              <div className="account-panel__field">
                <label htmlFor={passwordId}>Password</label>
                <input
                  id={passwordId}
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  minLength={mode === 'signup' ? 8 : undefined}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={busy}
                />
                {mode === 'signup' && <small>Use at least 8 characters.</small>}
              </div>
              <button type="submit" className="account-panel__button" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
              </button>
            </form>
            <p className="account-panel__switch">
              {mode === 'signin' ? 'New to KnowFlow?' : 'Already have an account?'}{' '}
              <button type="button" onClick={changeMode} disabled={busy}>
                {mode === 'signin' ? 'Create an account' : 'Sign in'}
              </button>
            </p>
          </>
        )}

        {error && <p className="account-panel__feedback account-panel__feedback--error" role="alert">{error}</p>}
        {message && <p className="account-panel__feedback" role="status">{message}</p>}
      </div>
    </dialog>
  )
}
