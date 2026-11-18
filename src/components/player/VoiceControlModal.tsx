import React from 'react';
import { Mic, MicOff, X } from 'lucide-react';
import { useVoiceControl } from '../../hooks/useVoiceControl';

interface VoiceControlModalProps {
  open: boolean;
  onClose: () => void;
}

export const VoiceControlModal: React.FC<VoiceControlModalProps> = ({ open, onClose }) => {
  const { supported, listening, transcript, statusMessage, startListening, stopListening } =
    useVoiceControl();

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-modal-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111216] p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Mic className="w-5 h-5 text-red-500" />
            <h3 id="voice-modal-title" className="font-display text-lg font-semibold text-white">
              Voice Music Control
            </h3>
          </div>
          <button
            type="button"
            onClick={() => {
              stopListening();
              onClose();
            }}
            aria-label="Close voice control"
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!supported ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
            Web Speech API (<code className="font-mono">SpeechRecognition</code>) is not supported in this browser. Voice commands work in Chromium browsers (Chrome, Edge, Android Chrome) over HTTPS/localhost.
          </div>
        ) : (
          <div className="flex flex-col items-center py-4 space-y-4">
            <button
              type="button"
              onClick={() => (listening ? stopListening() : startListening())}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-xl ${
                listening
                  ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-500/30'
                  : 'bg-white/[0.08] text-gray-200 hover:bg-red-600 hover:text-white'
              }`}
              aria-label={listening ? 'Stop listening' : 'Start voice command'}
            >
              {listening ? <Mic className="w-8 h-8" /> : <MicOff className="w-8 h-8" />}
            </button>

            <div className="text-center space-y-1 min-h-[44px]">
              <p className="text-sm font-medium text-white">
                {transcript ? `“${transcript}”` : listening ? 'Speak a command...' : 'Tap mic to speak'}
              </p>
              {statusMessage && <p className="text-xs text-red-400">{statusMessage}</p>}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-white/[0.07] bg-[#0B0C10] p-3.5 text-xs text-gray-400 space-y-1">
          <p className="font-semibold text-gray-200">Supported Commands:</p>
          <p>
            <span className="text-white font-mono">Play</span> ·{' '}
            <span className="text-white font-mono">Pause</span> ·{' '}
            <span className="text-white font-mono">Next song</span> ·{' '}
            <span className="text-white font-mono">Previous song</span> ·{' '}
            <span className="text-white font-mono">Shuffle</span>
          </p>
          <p>
            <span className="text-white font-mono">Play &lt;song or artist&gt;</span> ·{' '}
            <span className="text-white font-mono">Play playlist &lt;name&gt;</span> ·{' '}
            <span className="text-white font-mono">Volume up / down</span>
          </p>
        </div>
      </div>
    </div>
  );
};
