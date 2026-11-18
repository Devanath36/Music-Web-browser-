export type ParsedVoiceCommand =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'shuffle' }
  | { type: 'mute' }
  | { type: 'volume_up' }
  | { type: 'volume_down' }
  | { type: 'play_playlist'; query: string }
  | { type: 'play_query'; query: string }
  | { type: 'unknown'; raw: string };

export function parseVoiceMusicCommand(rawTranscript: string): ParsedVoiceCommand {
  const clean = (rawTranscript || '').trim().toLowerCase().replace(/[.,!?]+$/g, '');
  if (!clean) return { type: 'unknown', raw: rawTranscript };

  if (clean === 'play' || clean === 'resume' || clean === 'play music' || clean === 'start music') {
    return { type: 'play' };
  }
  if (clean === 'pause' || clean === 'stop' || clean === 'pause music') {
    return { type: 'pause' };
  }
  if (clean === 'next' || clean === 'next song' || clean === 'next track' || clean === 'skip') {
    return { type: 'next' };
  }
  if (
    clean === 'previous' ||
    clean === 'previous song' ||
    clean === 'previous track' ||
    clean === 'go back'
  ) {
    return { type: 'previous' };
  }
  if (clean === 'shuffle' || clean === 'shuffle music' || clean === 'smart shuffle') {
    return { type: 'shuffle' };
  }
  if (clean === 'mute' || clean === 'unmute') {
    return { type: 'mute' };
  }
  if (clean.includes('volume up') || clean.includes('louder')) {
    return { type: 'volume_up' };
  }
  if (clean.includes('volume down') || clean.includes('quieter')) {
    return { type: 'volume_down' };
  }

  const playlistMatch = clean.match(/^play playlist\s+(.+)$/i);
  if (playlistMatch && playlistMatch[1]?.trim()) {
    return { type: 'play_playlist', query: playlistMatch[1].trim() };
  }

  const playQueryMatch = clean.match(/^play\s+(.+)$/i);
  if (playQueryMatch && playQueryMatch[1]?.trim()) {
    return { type: 'play_query', query: playQueryMatch[1].trim() };
  }

  return { type: 'unknown', raw: rawTranscript };
}
