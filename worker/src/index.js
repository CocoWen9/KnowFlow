const allowedWebOrigins = new Set([
  'https://cocowen9.github.io',
])

function isAllowedOrigin(origin) {
  return (
    !origin ||
    allowedWebOrigins.has(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  )
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Origin': origin || 'https://cocowen9.github.io',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(payload, status, origin) {
  return Response.json(payload, {
    status,
    headers: corsHeaders(origin),
  })
}

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function extractAnswer(result) {
  if (typeof result?.response === 'string') {
    return result.response.trim()
  }

  const content = result?.choices?.[0]?.message?.content

  if (typeof content === 'string') {
    return content.trim()
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim()
  }

  return ''
}

function buildPrompt(body) {
  const title = cleanText(body.title, 120)
  const question = cleanText(body.question, 4_000)
  const sourceText = cleanText(body.source?.text, 500)
  const sourceRole = body.source?.role === 'user' ? 'User' : 'AI'
  const parentTitle = cleanText(body.parentConversation?.title, 120)
  const parentUserMessage = cleanText(
    body.parentConversation?.userMessage,
    6_000,
  )
  const parentAssistantMessage = cleanText(
    body.parentConversation?.assistantMessage,
    10_000,
  )

  if (!question) {
    return null
  }

  const context = []

  if (parentTitle || parentUserMessage || parentAssistantMessage) {
    context.push(
      'Parent conversation:',
      `Title: ${parentTitle || 'Untitled'}`,
      `User: ${parentUserMessage || '(empty)'}`,
      `AI: ${parentAssistantMessage || '(empty)'}`,
    )
  }

  if (sourceText) {
    context.push(`Selected ${sourceRole} text: ${sourceText}`)
  }

  context.push(`New node title: ${title || 'Untitled'}`, `Question: ${question}`)

  return context.join('\n')
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''
    const url = new URL(request.url)

    if (!isAllowedOrigin(origin)) {
      return json({ error: 'Origin is not allowed.' }, 403, origin)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ status: 'ok' }, 200, origin)
    }

    if (url.pathname !== '/api/answer' || request.method !== 'POST') {
      return json({ error: 'Not found.' }, 404, origin)
    }

    let body

    try {
      body = await request.json()
    } catch {
      return json({ error: 'Request body must be valid JSON.' }, 400, origin)
    }

    const prompt = buildPrompt(body)

    if (!prompt) {
      return json({ error: 'Question is required.' }, 400, origin)
    }

    try {
      const result = await env.AI.run('@cf/google/gemma-4-26b-a4b-it', {
        messages: [
          {
            role: 'system',
            content:
              'You are the AI tutor inside KnowFlow, a learning knowledge graph. Answer the new question in the same language as the question. Use the parent conversation and selected text only when they are relevant. Do not invent sibling-node context. Give a clear, self-contained explanation in two to five short paragraphs. Return plain text without a preamble.',
          },
          { role: 'user', content: prompt },
        ],
        chat_template_kwargs: {
          enable_thinking: false,
        },
        max_tokens: 900,
        temperature: 0.45,
      })
      const answer = extractAnswer(result)

      if (!answer) {
        return json({ error: 'The model returned an empty answer.' }, 502, origin)
      }

      return json({ answer }, 200, origin)
    } catch (error) {
      console.error('Workers AI request failed', error)
      return json(
        { error: 'The AI service is temporarily unavailable. Please retry.' },
        503,
        origin,
      )
    }
  },
}
