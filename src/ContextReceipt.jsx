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
                <em>{block.selectedBy?.replace('-', ' ') ?? 'automatic'}</em>
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
          No graph context was needed for this question.
        </p>
      )}
    </section>
  )
}
