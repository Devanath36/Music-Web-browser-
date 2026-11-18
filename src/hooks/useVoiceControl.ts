import { useCallback, useEffect, useRef, useState } from 'react';
import { useLibraryStore } from '../store/useLibraryStore';
import { usePlayerStore } from '../store/usePlayerStore';
import { parseVoiceMusicCommand, type ParsedVoiceCommand } from '../utils/voiceCommandParser';

export { parseVoiceMusicCommand, type ParsedVoiceCommand };

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionInstanceLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export function isVoiceRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function useVoiceControl() {
  const [supported] = useState(() => isVoiceRecognitionSupported());
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);

  const executeVoiceTranscript = useCallback(async (raw: string) => {
    const cmd = parseVoiceMusicCommand(raw);
    const player = usePlayerStore.getState();
    const lib = useLibraryStore.getState();

    switch (cmd.type) {
      case 'play':
        if (!player.isPlaying) await player.togglePlayPause();
        setStatusMessage('Resumed playback');
        break;
      case 'pause':
        if (player.isPlaying) await player.togglePlayPause();
        setStatusMessage('Paused playback');
        break;
      case 'next':
        await player.playNext(true);
        setStatusMessage('Skipped to next track');
        break;
      case 'previous':
        await player.playPrevious();
        setStatusMessage('Went to previous track');
        break;
      case 'shuffle':
        player.toggleSmartShuffle();
        setStatusMessage('Toggled Smart Shuffle');
        break;
      case 'mute':
        player.toggleMute();
        setStatusMessage(player.muted ? 'Unmuted audio' : 'Muted audio');
        break;
      case 'volume_up':
        player.setVolume(Math.min(1, player.volume + 0.1));
        setStatusMessage('Increased volume');
        break;
      case 'volume_down':
        player.setVolume(Math.max(0, player.volume - 0.1));
        setStatusMessage('Decreased volume');
        break;
      case 'play_playlist': {
        const pl = lib.playlists.find((p) =>
          p.name.toLowerCase().includes(cmd.query)
        );
        if (!pl) {
          setStatusMessage(`No playlist found matching "${cmd.query}"`);
          return;
        }
        const ids = lib.playlistTracks
          .filter((pt) => pt.playlistId === pl.id)
          .sort((a, b) => a.position - b.position)
          .map((pt) => pt.trackId);
        if (ids.length > 0) {
          await player.playTrackList(ids, 0);
          setStatusMessage(`Playing playlist "${pl.name}"`);
        } else {
          setStatusMessage(`Playlist "${pl.name}" is empty`);
        }
        break;
      }
      case 'play_query': {
        const matches = lib.tracks.filter(
          (t) =>
            t.title.toLowerCase().includes(cmd.query) ||
            t.artist.toLowerCase().includes(cmd.query) ||
            t.album.toLowerCase().includes(cmd.query)
        );
        if (matches.length > 0) {
          await player.playTrackList(
            matches.map((m) => m.id),
            0
          );
          setStatusMessage(`Playing "${matches[0].title}" by ${matches[0].artist}`);
        } else {
          setStatusMessage(`No song or artist found matching "${cmd.query}"`);
        }
        break;
      }
      default:
        setStatusMessage(`Did not recognize command: "${cmd.raw}"`);
    }
  }, []);

  const startListening = useCallback(() => {
    if (!supported || listening) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstanceLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstanceLike;
    };
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) return;

    try {
      const rec = new Ctor();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = false;

      rec.onresult = (ev) => {
        const latest = ev.results[ev.results.length - 1];
        if (!latest) return;
        const text = latest[0]?.transcript || '';
        setTranscript(text);
        if (latest.isFinal) {
          void executeVoiceTranscript(text);
        }
      };

      rec.onerror = (ev) => {
        setListening(false);
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setStatusMessage('Microphone permission denied. Allow mic access in browser settings.');
        } else if (ev.error === 'no-speech') {
          setStatusMessage('No speech detected. Try speaking closer to the microphone.');
        } else {
          setStatusMessage(`Voice recognition error: ${ev.error}`);
        }
      };

      rec.onend = () => {
        setListening(false);
      };

      recognitionRef.current = rec;
      setTranscript('');
      setStatusMessage('Listening...');
      setListening(true);
      rec.start();
    } catch {
      setListening(false);
      setStatusMessage('Could not start browser speech recognition.');
    }
  }, [executeVoiceTranscript, listening, supported]);

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore
    }
    setListening(false);
  }, []);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore
      }
    };
  }, []);

  return {
    supported,
    listening,
    transcript,
    statusMessage,
    startListening,
    stopListening,
    executeVoiceTranscript,
  };
}
