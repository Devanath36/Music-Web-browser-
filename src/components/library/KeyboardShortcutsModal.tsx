import React, { useMemo, useState } from 'react';
import { AlertTriangle, Keyboard, RotateCcw, X } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import type { ShortcutActionId } from '../../types/music';
import {
  SHORTCUT_DEFINITIONS,
  detectShortcutConflicts,
  getEffectiveShortcutBindings,
  normalizeShortcutKey,
} from '../../utils/keyboardShortcuts';

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  open,
  onClose,
}) => {
  const settings = useLibraryStore((s) => s.settings);
  const updateAppSettings = useLibraryStore((s) => s.updateAppSettings);
  const [capturingAction, setCapturingAction] = useState<ShortcutActionId | null>(null);

  const effectiveBindings = useMemo(
    () => getEffectiveShortcutBindings(settings.customShortcuts),
    [settings.customShortcuts]
  );

  const conflicts = useMemo(
    () => detectShortcutConflicts(effectiveBindings),
    [effectiveBindings]
  );

  if (!open) return null;

  const handleCaptureKey = async (
    actionId: ShortcutActionId,
    e: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      setCapturingAction(null);
      return;
    }
    if (e.key === 'Control' || e.key === 'Shift' || e.key === 'Alt' || e.key === 'Meta') {
      return;
    }
    const combo = normalizeShortcutKey({
      key: e.key,
      code: e.code,
      ctrlKey: e.ctrlKey,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
    });
    const nextCustom = {
      ...(settings.customShortcuts || {}),
      [actionId]: combo,
    };
    setCapturingAction(null);
    await updateAppSettings({ customShortcuts: nextCustom });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl border border-white/10 bg-[#111216] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <Keyboard className="w-5 h-5 text-red-500" />
            <div>
              <h3 id="shortcuts-modal-title" className="font-display text-lg font-semibold text-white">
                Keyboard Shortcuts
              </h3>
              <p className="text-xs text-gray-400">
                Click any key button and press a new key combination (Esc cancels).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => updateAppSettings({ customShortcuts: {} })}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-gray-300 hover:bg-white/5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close keyboard shortcuts"
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {conflicts.length > 0 && (
          <div className="mx-6 mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold">Shortcut conflict detected:</p>
              <p className="mt-0.5 text-amber-200/80">
                {conflicts
                  .map((c) => `"${c.binding}" assigned to ${c.actions.join(' & ')}`)
                  .join('; ')}
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
          {SHORTCUT_DEFINITIONS.map((def) => {
            const currentKey = effectiveBindings[def.id];
            const isCapturing = capturingAction === def.id;
            const hasConflict = conflicts.some((c) => c.actions.includes(def.id));

            return (
              <div
                key={def.id}
                className="flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-[#0B0C10] px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{def.label}</p>
                  <p className="text-xs text-gray-500">{def.description}</p>
                </div>

                <button
                  type="button"
                  onClick={() => setCapturingAction(isCapturing ? null : def.id)}
                  onKeyDown={(e) => {
                    if (isCapturing) {
                      void handleCaptureKey(def.id, e);
                    }
                  }}
                  className={`min-w-[130px] px-3 py-1.5 rounded-lg border font-mono text-xs font-semibold transition-colors ${
                    isCapturing
                      ? 'border-red-500 bg-red-600/20 text-red-200 animate-pulse'
                      : hasConflict
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
                        : 'border-white/15 bg-white/[0.05] text-gray-100 hover:border-red-500/40'
                  }`}
                >
                  {isCapturing ? 'Press Key...' : currentKey}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
