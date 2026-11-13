/** The parts of a `KeyboardEvent` a shortcut depends on. */
export interface ShortcutKeyPress {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Single-key shortcuts and two-key sequences ("G then D"), each mapped to an
 * action. Letter keys are written in lower case; a sequence is its first key
 * mapped to the keys that may follow it.
 */
export interface ShortcutMap<Action> {
  keys: Readonly<Record<string, Action>>;
  sequences: Readonly<Record<string, Readonly<Record<string, Action>>>>;
}

export interface ShortcutResult<Action> {
  action: Action | null;
  /** The first key of a sequence still waiting for its second, else null. */
  pending: string | null;
}

/**
 * What a key press does (A-A11y 01 keyboard shortcuts): nothing while the
 * person types in a field or holds Ctrl, Cmd or Alt (so the browser's and the
 * system's shortcuts keep working); the second key of a sequence completes or
 * cancels it; otherwise a sequence starts or a single key acts. Shift is
 * allowed, so "?" works, and a letter matches either case.
 */
export function resolveShortcut<Action>(
  press: ShortcutKeyPress,
  pending: string | null,
  map: ShortcutMap<Action>,
  typing: boolean,
): ShortcutResult<Action> {
  if (typing || press.ctrlKey || press.metaKey || press.altKey) {
    return { action: null, pending: null };
  }
  const key = press.key.length === 1 ? press.key.toLowerCase() : press.key;
  if (pending !== null) {
    return { action: map.sequences[pending]?.[key] ?? null, pending: null };
  }
  if (map.sequences[key]) {
    return { action: null, pending: key };
  }
  return { action: map.keys[key] ?? null, pending: null };
}

/** Input types that take typed text; a key press there is never a shortcut. */
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * Whether a key press on this element is typing: a text input, a text area, a
 * select (letters jump between options) or editable content.
 */
export function isTypingTarget(
  element: {
    tagName: string;
    type?: string;
    isContentEditable?: boolean;
  } | null,
): boolean {
  if (!element) {
    return false;
  }
  if (element.isContentEditable) {
    return true;
  }
  switch (element.tagName) {
    case 'TEXTAREA':
    case 'SELECT':
      return true;
    case 'INPUT':
      return !NON_TEXT_INPUTS.has((element.type ?? 'text').toLowerCase());
    default:
      return false;
  }
}
