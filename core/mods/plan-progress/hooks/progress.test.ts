import { describe, expect, test } from 'claude-code/testing'

import { displayWidth, scrollNote, truncate } from './progress'

describe('the width of what is drawn', () => {
  test('a narrow glyph takes one cell and a wide one two', () => {
    expect(displayWidth('abc')).toBe(3)
    expect(displayWidth('构建')).toBe(4)
    expect(displayWidth('构建abc')).toBe(7)
  })

  test('the markers this mod draws itself are narrow', () => {
    // Box, bar and status glyphs are East Asian *ambiguous*: terminals this
    // runs in render them in one cell, so they must not be counted as two.
    // Ten markers and the nine spaces between them.
    expect(displayWidth('◆ ✓ ▶ ◇ ● ○ █ ░ ─ …')).toBe(19)
  })

  test('an emoji is wide and a combining mark adds nothing', () => {
    expect(displayWidth('🚀')).toBe(2)
    expect(displayWidth('é')).toBe(1)
  })
})

describe('cutting text to a column', () => {
  test('text that already fits is left alone', () => {
    expect(truncate('add backoff', 40)).toBe('add backoff')
  })

  test('runs of whitespace and newlines flatten to one space', () => {
    expect(truncate('add\n  retries\tto the client', 60)).toBe('add retries to the client')
  })

  test('an empty limit draws nothing', () => {
    expect(truncate('anything', 0)).toBe('')
  })

  test('a long line is cut to the cells asked for, and ends in an ellipsis', () => {
    const line = 'the quick brown fox jumps over the lazy dog'
    const cut = truncate(line, 20)
    expect(displayWidth(cut)).toBeLessThanOrEqual(20)
    expect(cut.endsWith('…')).toBe(true)
  })

  test('a wide line is cut by cells, not by code points', () => {
    // Seven ideographs is fourteen cells: at ten only four fit, with the one
    // held back for the ellipsis. Counting code points would have kept nine
    // and overrun the column by eight cells.
    const cut = truncate('构建一个客户端列表', 10)
    expect(displayWidth(cut)).toBeLessThanOrEqual(10)
    expect(cut).toBe('构建一个…')
  })
})

describe('what a scrolled list says about itself', () => {
  test('says nothing at the top', () => {
    expect(scrollNote(0, 24, 41)).toBeNull()
  })

  test('says nothing about an empty list', () => {
    expect(scrollNote(4, 24, 0)).toBeNull()
  })

  test('names the rows in view and the total once scrolled', () => {
    expect(scrollNote(12, 18, 41)).toBe('↕ 13–30 of 41')
  })

  test('does not run past the end of the list', () => {
    expect(scrollNote(35, 18, 41)).toBe('↕ 36–41 of 41')
  })
})
