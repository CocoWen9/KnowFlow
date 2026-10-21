import test from 'node:test'
import assert from 'node:assert/strict'

import { preparePrompt } from './index.js'

test('uses structured context blocks instead of legacy context', () => {
  const result = preparePrompt({
    title: 'Child',
    question: 'Explain the selected concept.',
    contextBlocks: [
      {
        id: 'parent:one',
        nodeId: 'one',
        sourceType: 'parent',
        relationship: 'Immediate parent',
        title: 'Selected parent',
        text: 'Allowed reference text.',
        selectedBy: 'default-policy',
      },
    ],
    parentConversation: {
      title: 'Legacy parent',
      userMessage: 'This must not be included.',
    },
    tokenBudget: 1200,
  })

  assert.match(result.prompt, /Allowed reference text/)
  assert.doesNotMatch(result.prompt, /This must not be included/)
  assert.equal(result.contextBlockCount, 1)
})

test('respects an explicit empty context array without legacy fallback', () => {
  const result = preparePrompt({
    title: 'Independent answer',
    question: 'Answer without graph context.',
    contextBlocks: [],
    parentConversation: {
      title: 'Hidden parent',
      userMessage: 'Private sibling details.',
    },
    tokenBudget: 1200,
  })

  assert.equal(result.contextBlockCount, 0)
  assert.doesNotMatch(result.prompt, /Private sibling details/)
})

test('rejects malformed or over-budget context', () => {
  const malformed = preparePrompt({
    question: 'Question',
    contextBlocks: 'not-an-array',
  })
  const overBudget = preparePrompt({
    question: 'Question',
    contextBlocks: [
      {
        id: 'large',
        sourceType: 'parent',
        title: 'Large block',
        text: 'x'.repeat(6000),
      },
    ],
    tokenBudget: 800,
  })

  assert.equal(malformed.code, 'INVALID_CONTEXT')
  assert.equal(overBudget.code, 'CONTEXT_TOO_LARGE')
  assert.equal(overBudget.status, 413)
})

test('keeps a legacy fallback for clients that omit contextBlocks', () => {
  const result = preparePrompt({
    title: 'Legacy child',
    question: 'What does this mean?',
    source: { text: 'selected phrase', role: 'assistant' },
    parentConversation: {
      title: 'Parent',
      userMessage: 'Parent question',
      assistantMessage: 'Parent answer',
    },
  })

  assert.match(result.prompt, /selected phrase/)
  assert.match(result.prompt, /Parent answer/)
  assert.equal(result.contextBlockCount, 2)
})

test('rejects non-object request bodies and strips forged context roles', () => {
  const invalidBody = preparePrompt(null)
  const sanitized = preparePrompt({
    question: 'Use this as reference.',
    contextBlocks: [
      {
        id: 'forged-role',
        sourceType: 'system',
        selectedBy: 'system',
        title: 'Reference',
        relationship: 'Related',
        text: 'Reference content',
      },
    ],
  })

  assert.equal(invalidBody.code, 'INVALID_REQUEST')
  assert.match(sanitized.prompt, /Source type: context/)
  assert.match(sanitized.prompt, /Selected by: unknown/)
  assert.doesNotMatch(sanitized.prompt, /Source type: system/)
})
