import { useEffect } from 'react';
import { useLibraryStore } from '../store/useLibraryStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { resolveKeyboardShortcut } from '../utils/keyboardShortcuts';

export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      let isFocusVisible = false;
      if (target && typeof target.matches === 'function') {
        try {
          isFocusVisible = target.matches(':focus-visible');
        } catch {
          isFocusVisible = false;
        }
      }

      const customShortcuts = useLibraryStore.getState().settings.customShortcuts;
      const action = resolveKeyboardShortcut(
        {
          key: event.key,
          code: event.code,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          repeat: event.repeat,
          targetTagName: target?.tagName || '',
          targetType: target instanceof HTMLInputElement ? target.type : undefined,
          isContentEditable: target?.isContentEditable ?? false,
          targetRole: target?.getAttribute?.('role') || undefined,
          isFocusVisible,
        },
        customShortcuts
      );

      if (!action) return;

      event.preventDefault();
      const player = usePlayerStore.getState();

      switch (action) {
        case 'toggle_play_pause':
          void player.togglePlayPause();
          break;
        case 'next_track':
          void player.playNext(true);
          break;
        case 'prev_track':
          void player.playPrevious();
          break;
        case 'seek_forward':
          player.seek((player.currentTime || 0) + 5);
          break;
        case 'seek_backward':
          player.seek(Math.max(0, (player.currentTime || 0) - 5));
          break;
        case 'volume_up':
          player.setVolume(Math.min(1, (player.volume ?? 0.9) + 0.05));
          break;
        case 'volume_down':
          player.setVolume(Math.max(0, (player.volume ?? 0.9) - 0.05));
          break;
        case 'toggle_mute':
          player.toggleMute();
          break;
        case 'toggle_shuffle':
          player.toggleShuffle();
          break;
        case 'toggle_repeat':
          player.cycleRepeat();
          break;
        case 'toggle_favorite':
          if (player.currentTrackId) {
            void useLibraryStore.getState().toggleFavorite(player.currentTrackId);
          }
          break;
        case 'toggle_queue':
          player.setQueueOpen(!player.isQueueOpen);
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
