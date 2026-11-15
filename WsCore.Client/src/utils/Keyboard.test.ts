import { describe, it, expect } from 'vitest';
import { isEditableTarget } from './Keyboard';

// Duck-typed targets: the Vitest env has no DOM, and isEditableTarget only reads
// tagName / isContentEditable.
const el = (tagName: string, isContentEditable = false) =>
  ({ tagName, isContentEditable }) as unknown as EventTarget;

describe('isEditableTarget', () => {
  it('is true for text-entry elements', () => {
    expect(isEditableTarget(el('INPUT'))).toBe(true);
    expect(isEditableTarget(el('TEXTAREA'))).toBe(true);
    expect(isEditableTarget(el('SELECT'))).toBe(true);
    expect(isEditableTarget(el('input'))).toBe(true);
  });

  it('is true for contenteditable elements', () => {
    expect(isEditableTarget(el('DIV', true))).toBe(true);
  });

  it('is false for game surfaces and non-elements', () => {
    expect(isEditableTarget(el('CANVAS'))).toBe(false);
    expect(isEditableTarget(el('BODY'))).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget(undefined)).toBe(false);
  });
});
