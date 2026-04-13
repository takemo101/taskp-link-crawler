# MarkItDown Default Converter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make MarkItDown the default HTML→Markdown converter while keeping the existing Turndown converter as an automatic fallback.

**Architecture:** Refactor the parser converter into two layers: a default MarkItDown path that shells out to the Python `markitdown` CLI via `uvx`, and a preserved Turndown path used as a fallback when MarkItDown is unavailable or conversion fails. Keep the public `htmlToMarkdown()` API stable so the crawler does not need broader changes.

**Tech Stack:** TypeScript, Bun/Node, Vitest, Python MarkItDown via `uvx`

---

### Task 1: Add failing tests for MarkItDown-first behavior

**Files:**
- Modify: `tests/unit/converter.test.ts`
- Test: `tests/unit/converter.test.ts`

- [ ] **Step 1: Write failing tests** for:
  - using MarkItDown output when the CLI succeeds
  - falling back to Turndown when the CLI throws or returns a non-zero status
- [ ] **Step 2: Run targeted tests to verify failure**
  - `bun x vitest run tests/unit/converter.test.ts`
- [ ] **Step 3: Confirm failure is due to missing MarkItDown-first behavior**

### Task 2: Implement MarkItDown-first converter with fallback

**Files:**
- Modify: `src/parser/converter.ts`

- [ ] **Step 1: Extract current Turndown logic into a dedicated fallback function**
- [ ] **Step 2: Add MarkItDown CLI execution using `uvx --from markitdown markitdown -x html`**
- [ ] **Step 3: Preserve `htmlToMarkdown()` as the public API**
- [ ] **Step 4: Normalize output consistently for both converters**

### Task 3: Document runtime behavior

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document that MarkItDown is the default converter**
- [ ] **Step 2: Document `uvx`/Python recommendation and automatic fallback behavior**

### Task 4: Verify

**Files:**
- Modify: none
- Test: `tests/unit/converter.test.ts`

- [ ] **Step 1: Run targeted converter tests**
  - `bun x vitest run tests/unit/converter.test.ts`
- [ ] **Step 2: Run broader validation**
  - `bun run test`
  - `bun run typecheck`
