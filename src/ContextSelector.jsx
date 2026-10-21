import { useEffect, useState } from 'react'

import {
  contextTokenBudgetOptions,
  createContextPlan,
  defaultContextTokenBudget,
  rankContextCandidates,
  suggestContextCandidateIds,
} from './contextSelection.js'

export function useContextPlan(candidates, question) {
  const candidateSignature = candidates.map((candidate) => candidate.id).join('|')
  const [tokenBudget, setTokenBudget] = useState(defaultContextTokenBudget)
  const [manualSelectedIds, setManualSelectedIds] = useState(null)
  const rankedCandidates = rankContextCandidates(candidates, question)
  const automaticSelectedIds = suggestContextCandidateIds(
    candidates,
    question,
    tokenBudget,
  )
  const selectedIds = manualSelectedIds ?? automaticSelectedIds
  const selectionMode = manualSelectedIds ? 'manual' : 'automatic'
  const plan = createContextPlan({
    candidates,
    selectedIds,
    selectionMode,
    tokenBudget,
  })

  useEffect(() => {
    setManualSelectedIds(null)
    setTokenBudget(defaultContextTokenBudget)
  }, [candidateSignature])

  function toggleCandidate(candidateId) {
    const nextSelectedIds = new Set(selectedIds)

    if (nextSelectedIds.has(candidateId)) {
      nextSelectedIds.delete(candidateId)
    } else {
      nextSelectedIds.add(candidateId)
    }

    setManualSelectedIds(nextSelectedIds)
  }

  return {
    automaticSelectedIds,
    isOverBudget: plan.estimatedTokens > tokenBudget,
    plan,
    rankedCandidates,
    resetSuggestions: () => setManualSelectedIds(null),
    selectedIds,
    selectionMode,
    setTokenBudget,
    toggleCandidate,
    tokenBudget,
  }
}

export function ContextSelector({ controller }) {
  const {
    automaticSelectedIds,
    isOverBudget,
    plan,
    rankedCandidates,
    resetSuggestions,
    selectedIds,
    selectionMode,
    setTokenBudget,
    toggleCandidate,
    tokenBudget,
  } = controller

  if (!rankedCandidates.length) {
    return null
  }

  return (
    <section className="context-selector" aria-label="AI context preview">
      <div className="context-selector__header">
        <div>
          <strong>AI context</strong>
          <span>Preview and control what the model receives.</span>
        </div>
        <label>
          <span>Budget</span>
          <select
            value={tokenBudget}
            onChange={(event) => setTokenBudget(Number(event.target.value))}
            aria-label="Context token budget"
          >
            {contextTokenBudgetOptions.map((option) => (
              <option key={option} value={option}>
                {option.toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="context-selector__explanation">
        Parent context is included by default. Relevant ancestors and semantic
        connections are suggested from your question; sibling branches stay out
        unless they have an explicit semantic connection.
      </p>

      <div className="context-selector__list">
        {rankedCandidates.map((candidate) => {
          const isSelected = selectedIds.has(candidate.id)
          const isSuggested =
            !candidate.defaultSelected && automaticSelectedIds.has(candidate.id)

          return (
            <div
              className={`context-option ${isSelected ? 'context-option--selected' : ''}`}
              key={candidate.id}
            >
              <label className="context-option__main">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleCandidate(candidate.id)}
                />
                <span className="context-option__copy">
                  <span className="context-option__title-row">
                    <strong>{candidate.title}</strong>
                    {candidate.sourceType === 'selected-text' && <em>Explicit</em>}
                    {candidate.sourceType === 'parent' && <em>Default</em>}
                    {isSuggested && <em>Suggested</em>}
                  </span>
                  <small>{candidate.relationship}</small>
                </span>
                <span className="context-option__tokens">
                  ~{candidate.estimatedTokens.toLocaleString()}
                </span>
              </label>
              <details>
                <summary>View text sent</summary>
                <pre>{candidate.text}</pre>
              </details>
            </div>
          )
        })}
      </div>

      <div className="context-selector__footer">
        <span
          className={
            isOverBudget
              ? 'context-budget context-budget--over'
              : 'context-budget'
          }
        >
          ~{plan.estimatedTokens.toLocaleString()} / {tokenBudget.toLocaleString()}{' '}
          tokens
        </span>
        {selectionMode === 'manual' && (
          <button type="button" onClick={resetSuggestions}>
            Use suggestions
          </button>
        )}
      </div>

      {isOverBudget && (
        <p className="context-selector__warning" role="alert">
          Remove context or increase the budget before creating this node.
        </p>
      )}
    </section>
  )
}

export function ContextReceipt({ plan }) {
  if (!Array.isArray(plan?.blocks)) {
    return null
  }

  const estimatedTokens = Number.isFinite(plan.estimatedTokens)
    ? plan.estimatedTokens
    : plan.blocks.reduce(
        (total, block) => total + (Number(block.estimatedTokens) || 0),
        0,
      )

  return (
    <section className="details-section context-receipt">
      <div className="context-receipt__heading">
        <h3>AI context used</h3>
        <span>~{estimatedTokens.toLocaleString()} tokens</span>
      </div>
      {plan.blocks.length ? (
        <ul>
          {plan.blocks.map((block) => (
            <li key={block.id}>
              <div className="context-receipt__item-heading">
                <span>
                  <strong>{block.title}</strong>
                  <small>{block.relationship}</small>
                </span>
                <em>{block.selectedBy?.replace('-', ' ') ?? 'selected'}</em>
              </div>
              <details>
                <summary>View saved context</summary>
                <pre>{block.text}</pre>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="context-receipt__empty">
          No graph context was sent with this question.
        </p>
      )}
    </section>
  )
}
