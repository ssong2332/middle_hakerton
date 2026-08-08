// ADR-0010/F4-a — integration-level regression test.
//
// The reviewer flagged (T29 review, MJ-1 follow-up item 2) that `github.test.ts`'s unit
// tests call `findInput()` directly, bypassing the caller (`MediationPanel.handleInsert`),
// so they cannot catch a regression in the wiring that threads the selection origin from
// layer1 (selection capture) down to the layer2 adapter. This file mounts the real
// selection overlay + the real `MediationPanel` + the real `github` adapter (only the
// network/token layers are mocked) with two distinct textareas in the fixture DOM, and
// confirms Insert targets the textarea the user actually selected in — not the other one,
// and not the document-wide first-match candidate-selector fallback (`#new_comment_field`).
//
// This file lives outside `layer1/` and `layer2/` (like `content.ts`) because it composes
// both — `apps/extension/src/layer1` must not import `layer2/**`
// (`docs/CodingRules.md` Directory Rules), so this composition can only happen here.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import type { MediationResult } from '@cross-border/core';

vi.mock('./shared/token-storage', () => ({
  getStoredToken: vi.fn(),
}));
vi.mock('./shared/api', () => ({
  callMediationApi: vi.fn(),
}));

import { getStoredToken } from './shared/token-storage';
import { callMediationApi } from './shared/api';
import { initSelectionOverlay, type SelectionPayload } from './layer1/selection';
import { MediationPanel } from './layer1/MediationPanel';
import { github } from './layer2/github';

const mockedGetStoredToken = vi.mocked(getStoredToken);
const mockedCallMediationApi = vi.mocked(callMediationApi);

function successResult(): MediationResult {
  return {
    urgency: 'NORMAL',
    urgencyReason: '근거',
    transformed: 'approved text',
    reason: '이유',
    preserved: [],
    backTranslation: 'back translated',
    warnings: [],
    misreadRisks: [],
    holidayConflicts: [],
    personalizationApplied: false,
    source: 'live',
    stepSources: { c1: 'live', c2: 'live', c4: 'live' },
    ticketOption: { offered: false, basis: 'signal_absent' },
  };
}

describe('origin targeting — layer1 → layer2 integration (ADR-0010/F4-a)', () => {
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    document.body.innerHTML = `
      <textarea id="new_comment_field"></textarea>
      <textarea name="comment[body]" id="inline-reply"></textarea>
    `;
    mockedGetStoredToken.mockResolvedValue('tok');
    mockedCallMediationApi.mockResolvedValue({ ok: true, data: successResult() });
  });

  afterEach(() => {
    cleanup?.();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('inserts into the textarea the user actually selected in, not the other composer or the document-wide first match', async () => {
    const mainBox = document.getElementById('new_comment_field') as HTMLTextAreaElement;
    const inlineReply = document.getElementById('inline-reply') as HTMLTextAreaElement;
    mainBox.value = 'main box text';
    inlineReply.value = 'inline reply text';

    let capturedPayload: SelectionPayload | null = null;
    cleanup = initSelectionOverlay({
      onSelect: (payload) => {
        capturedPayload = payload;
      },
    });

    // Selection happens in the SECOND textarea (inline reply) — deliberately not the
    // main box, and not the one `CANDIDATE_SELECTORS`' document-wide first match
    // (`#new_comment_field`) would silently pick if origin threading were broken.
    inlineReply.focus();
    inlineReply.setSelectionRange(0, 6); // "inline"
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    const button = document.getElementById('cbm-layer1-selection-button');
    expect(button).not.toBeNull();
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload!.origin).toBe(inlineReply);

    const insertSpy = vi.spyOn(github, 'insert');

    render(
      <MediationPanel
        initialText={capturedPayload!.text}
        onClose={vi.fn()}
        adapter={github}
        origin={capturedPayload!.origin}
      />,
    );

    await waitFor(() => screen.getByLabelText('선택한 텍스트'));
    fireEvent.click(screen.getByRole('button', { name: '중재 실행' }));
    await waitFor(() => screen.getByRole('button', { name: '입력창에 삽입' }));

    fireEvent.click(screen.getByRole('button', { name: '입력창에 삽입' }));

    await waitFor(() => {
      expect(insertSpy).toHaveBeenCalledTimes(1);
    });
    expect(insertSpy.mock.calls[0][0]).toBe(inlineReply);
    expect(insertSpy.mock.calls[0][0]).not.toBe(mainBox);

    insertSpy.mockRestore();
  });
});
