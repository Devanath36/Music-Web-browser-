import type { ShortcutActionId } from '../types/music';

export type KeyboardShortcutAction = ShortcutActionId;

export interface KeyboardShortcutInput {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
  targetTagName: string;
  targetType?: string;
  isContentEditable?: boolean;
  targetRole?: string;
  isFocusVisible?: boolean;
}

export interface ShortcutDefinition {
  id: ShortcutActionId;
  label: string;
  description: string;
  defaultBinding: string;
}

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: 'toggle_play_pause',
    label: 'Play / Pause',
    description: 'Toggle playback of current track',
    defaultBinding: 'Space',
  },
  {
    id: 'next_track',
    label: 'Next Track',
    description: 'Skip to next track in queue',
    defaultBinding: 'ArrowRight',
  },
  {
    id: 'prev_track',
    label: 'Previous Track',
    description: 'Restart or return to previous track',
    defaultBinding: 'ArrowLeft',
  },
  {
    id: 'seek_forward',
    label: 'Seek Forward (+5s)',
    description: 'Jump forward 5 seconds',
    defaultBinding: 'Shift+ArrowRight',
  },
  {
    id: 'seek_backward',
    label: 'Seek Backward (-5s)',
    description: 'Jump backward 5 seconds',
    defaultBinding: 'Shift+ArrowLeft',
  },
  {
    id: 'volume_up',
    label: 'Volume Up',
    description: 'Increase volume by 5%',
    defaultBinding: 'ArrowUp',
  },
  {
    id: 'volume_down',
    label: 'Volume Down',
    description: 'Decrease volume by 5%',
    defaultBinding: 'ArrowDown',
  },
  {
    id: 'toggle_mute',
    label: 'Mute / Unmute',
    description: 'Toggle audio mute',
    defaultBinding: 'M',
  },
  {
    id: 'toggle_shuffle',
    label: 'Toggle Shuffle',
    description: 'Enable or disable queue shuffle',
    defaultBinding: 'S',
  },
  {
    id: 'toggle_repeat',
    label: 'Cycle Repeat',
    description: 'Cycle Off -> Repeat All -> Repeat One',
    defaultBinding: 'R',
  },
  {
    id: 'toggle_favorite',
    label: 'Favorite Track',
    description: 'Toggle favorite on active song',
    defaultBinding: 'F',
  },
  {
    id: 'toggle_queue',
    label: 'Toggle Queue Drawer',
    description: 'Open or close the playback queue',
    defaultBinding: 'Q',
  },
];

const DEFAULT_BINDING_MAP: Record<ShortcutActionId, string> = SHORTCUT_DEFINITIONS.reduce(
  (acc, item) => {
    acc[item.id] = item.defaultBinding;
    return acc;
  },
  {} as Record<ShortcutActionId, string>
);

const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'OPTION']);
const TEXT_ENTRY_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider']);
const INTERACTIVE_ACTIVATION_TAGS = new Set(['BUTTON', 'A', 'SUMMARY']);

export function normalizeShortcutKey(input: {
  key: string;
  code: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): string {
  const parts: string[] = [];
  if (input.ctrlKey) parts.push('Ctrl');
  if (input.altKey) parts.push('Alt');

  let base = input.key;
  if (input.code === 'Space' || input.key === ' ') {
    base = 'Space';
  } else if (base.length === 1) {
    base = base.toUpperCase();
  }

  // Only include Shift when paired with non-single-letter keys or explicitly requested
  if (input.shiftKey && base.length > 1) {
    parts.push('Shift');
  }
  parts.push(base);
  return parts.join('+');
}

export function getEffectiveShortcutBindings(
  customShortcuts?: Partial<Record<ShortcutActionId, string>>
): Record<ShortcutActionId, string> {
  return {
    ...DEFAULT_BINDING_MAP,
    ...(customShortcuts || {}),
  };
}

export function detectShortcutConflicts(
  bindings: Record<ShortcutActionId, string>
): Array<{ binding: string; actions: ShortcutActionId[] }> {
  const map = new Map<string, ShortcutActionId[]>();
  for (const def of SHORTCUT_DEFINITIONS) {
    const b = (bindings[def.id] || '').trim();
    if (!b) continue;
    const norm = b.toLowerCase();
    const list = map.get(norm) || [];
    list.push(def.id);
    map.set(norm, list);
  }
  const conflicts: Array<{ binding: string; actions: ShortcutActionId[] }> = [];
  for (const [norm, actions] of map.entries()) {
    if (actions.length > 1) {
      conflicts.push({ binding: bindings[actions[0]] || norm, actions });
    }
  }
  return conflicts;
}

export function resolveKeyboardShortcut(
  input: KeyboardShortcutInput,
  customShortcuts?: Partial<Record<ShortcutActionId, string>>
): KeyboardShortcutAction | null {
  if (input.metaKey || input.altKey) {
    return null;
  }

  const tag = (input.targetTagName || '').toUpperCase();
  const role = (input.targetRole || '').toLowerCase();

  if (input.isContentEditable || TEXT_ENTRY_TAGS.has(tag) || TEXT_ENTRY_ROLES.has(role)) {
    return null;
  }

  // Always preserve Ctrl+ArrowRight / Ctrl+ArrowLeft fallback unless overridden
  if (input.ctrlKey) {
    if (input.key === 'ArrowRight') return 'next_track';
    if (input.key === 'ArrowLeft') return 'prev_track';
    if (!customShortcuts || Object.keys(customShortcuts).length === 0) {
      return null;
    }
  }

  if (input.code === 'Space' || input.key === ' ') {
    if (input.repeat) return null;
    if (
      input.isFocusVisible &&
      (INTERACTIVE_ACTIVATION_TAGS.has(tag) || role === 'button' || role === 'menuitem')
    ) {
      return null;
    }
  }

  const normalized = normalizeShortcutKey({
    key: input.key,
    code: input.code,
    ctrlKey: input.ctrlKey,
    altKey: input.altKey,
    shiftKey: input.shiftKey,
  });

  const bindings = getEffectiveShortcutBindings(customShortcuts);

  // Match custom or default bindings
  for (const def of SHORTCUT_DEFINITIONS) {
    const assigned = bindings[def.id];
    if (!assigned) continue;
    if (assigned.toLowerCase() === normalized.toLowerCase()) {
      const repeatable =
        def.id === 'seek_forward' ||
        def.id === 'seek_backward' ||
        def.id === 'volume_up' ||
        def.id === 'volume_down' ||
        def.id === 'next_track' ||
        def.id === 'prev_track';
      if (input.repeat && !repeatable) return null;
      return def.id;
    }
  }

  return null;
}
