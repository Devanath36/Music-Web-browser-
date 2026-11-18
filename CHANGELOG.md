# SONORA Changelog

All notable changes to SONORA are documented in this file.

## [3.1.0] - 2026-11-18

### Added
- **Custom Spatial Profiles (`SpatialAudioView.tsx`, `spatialAudioPresets.ts`, `useLibraryStore.ts`)**: Added a dedicated Custom Spatial Profiles section allowing users to name, save, apply, and delete personalized Spatial Audio + EQ presets (capturing Stereo Width, Room Reverb, 3D positioning, Spatial Tone Shaping, and optional 10-Band Graphic EQ snapshot) persisted in IndexedDB.
- **SONORA Advanced Crossfade System (`crossfadeEngine.ts`, `audioEngine.ts`, `usePlayerStore.ts`, `SettingsView.tsx`)**:
  - Added independent **Gapless Mode** vs **Crossfade Mode** switcher, explicit **Crossfade ON/OFF toggle**, **0–20 second duration slider** (default **5 seconds**), and **Live Crossfade Preview** Web Audio audition button.
  - Upgraded `PersistentAudioEngine` with scheduled Web Audio `GainNode.setValueCurveAtTime` equal-power fade curves (`cos`/`sin`), short-song duration clamping, mid-crossfade pause/seek/rapid-skip cancellation, and playback decoding error rollback.
  - Enabled Shuffle and Smart Shuffle standby preloading in `usePlayerStore.ts` so Crossfade works cleanly across Sequential, Shuffle, Smart Shuffle, Repeat All, Playlists, Recently Played, and Smart Playlists while excluding Repeat One.
  - Coordinated DJ Studio Auto Mix (`djAudioEngine.ts`, `DjAutoMixRecorderPanel.tsx`) with 0–20s transition range, 5s default, immediate manual crossfader override, independent deck volume preservation, and automatic main-player pause on deck playback.

### Verified
- `tsc --noEmit`: 0 errors.
- `vite build`: succeeded cleanly.
- `npx --yes tsx --test src/utils/sonoraCore.test.ts`: **30 / 30 tests passed**.

## [3.0.0] - 2026-11-18

### Added
- **Gapless Playback & Equal-Power Crossfade**: Replaced single HTML5 `<audio>` element in `src/audio/audioEngine.ts` with a dual-slot Web Audio architecture (`elements[0 | 1]` + per-slot `GainNode`s), automatic standby track preloading, and configurable 0–12s crossfade transitions in Settings.
- **Smart Playlists (`SmartPlaylistsView.tsx` & `src/utils/smartPlaylists.ts`)**: Dynamic AND/OR rule builder across play count, days since played, days since added, artist, genre, album, favorite status, star rating, and release year with starter templates.
- **Recently Deleted Soft-Delete Trash (`RecentlyDeletedView.tsx`)**: Soft-deletes tracks with configurable retention (`7 / 14 / 30 / 60 days`), displays recoverable byte space, supports batch restore, and requires explicit confirmation for permanent erasure.
- **Metadata Editor Enhancements (`EditMetadataModal.tsx` & `BulkMetadataModal.tsx`)**: Added composer, disc number, 1–5 star ratings, custom key/value tags, artwork replacement, one-click Undo Last Edit, and multi-track Bulk Metadata Editor.
- **Playlist Export & Import (`src/db/exportBackup.ts` & `PlaylistsView.tsx`)**: Added M3U, M3U8 (UTF-8 relative folder paths), and SONORA JSON single/all playlist exports plus JSON playlist importer with missing-track detection.
- **Full Archive & Previewed Restore (`exportBackup.ts` & `SettingsView.tsx`)**: Added optional full JSON archive export with embedded audio blobs (180 MB safety cap) and a pre-restore validation preview modal.
- **Floating Mini Player (`FloatingMiniPlayer.tsx`)**: Draggable compact desktop player sharing the single persistent `audioEngine` state, accessible from the player bar.
- **Customizable Keyboard Shortcuts (`KeyboardShortcutsModal.tsx` & `keyboardShortcuts.ts`)**: 12 configurable actions (`Space`, `ArrowRight/Left`, `Shift+ArrowRight/Left`, `Ctrl+ArrowRight/Left`, `ArrowUp/Down`, `M`, `S`, `R`, `F`, `Q`) with live key capture and conflict detection.
- **Audio Output Device Selector (`audioDeviceManager.ts` & `SettingsView.tsx`)**: Enumerates available audio outputs via `MediaDevices.enumerateDevices()`, listens to hardware `devicechange`, switches output via `HTMLMediaElement.setSinkId()`, and provides clear OS fallback messaging where unsupported.
- **Intelligent Recommendations (`RecommendationsView.tsx` & `recommendationEngine.ts`)**: Offline affinity scorer factoring artist/genre weights, play frequency, skip penalties, mood filters (`Workout`, `Chill`, `Focus`, `Party`, `Sleep`, `Night Drive`), explanations, like/dislike feedback, and one-click playlist saving.
- **Synchronized LRC Lyrics & Karaoke (`LyricsView.tsx` & `lrcParser.ts`)**: Supports `.lrc` timestamped karaoke highlighting, manual plain/LRC lyrics editor, live "Stamp Current Playback Time" builder, seek-on-click lines, full-screen karaoke stage mode, and offline lyric text search.
- **Listening Analytics Dashboard (`AnalyticsView.tsx` & `analyticsEngine.ts`)**: Tracks real non-paused listening durations in IndexedDB `listeningEvents`, displaying total/daily/weekly/monthly time, listening streaks, 14-day & 6-month charts, top songs/artists/albums/genres, and history clearing with confirmation.
- **Listening Room (`ListeningRoomView.tsx`)**: 8 interactive visual atmospheres (`Minimal`, `Rain`, `Night Drive`, `Space`, `Ocean`, `Concert Hall`, `Sunset`, `Forest`) with music-reactive ambient lighting, particle intensity controls, reduced-motion respect, and optional Spatial Audio preset sync.
- **Vocal Isolation (`VocalIsolationView.tsx` & `vocalIsolation.ts`)**: Non-destructive offline Mid-Side matrix DSP isolator creating separate Vocal-Focus and Instrumental-Only WAV renders stored in IndexedDB `processedStems` with A/B auditioning and clear DSP limitation disclosure.
- **Voice Music Control (`VoiceControlModal.tsx`, `useVoiceControl.ts`, `voiceCommandParser.ts`)**: Optional Web Speech API voice trigger supporting playback, playlist launch, search playback, shuffle, and volume commands with microphone permission handling.
- **Library Category Browsers (`LibraryCategoryView.tsx`)**: Added `Genres`, `Folders`, `Most Played`, and `Saved DJ Mixes` views, plus direct **Save Mix** persistence from DJ Studio into IndexedDB (`djMixes`) and **Audio Quality Inspector** inside `TrackList.tsx`.

### Changed
- Upgraded IndexedDB schema cleanly via Dexie `.version(3)` adding `deletedAt` index and `lyrics`, `listeningEvents`, `smartPlaylists`, `djMixes`, `processedStems`, and `recommendationFeedback` tables without modifying or deleting existing imported user data.
- Expanded `Sidebar.tsx`, `MobileNav.tsx`, `TopBar.tsx`, `PlayerBar.tsx`, and `App.tsx` to expose all new views and tools cleanly.

### Verified
- `tsc --noEmit`: 0 errors.
- `vite build`: succeeded cleanly.
- `npx --yes tsx --test src/utils/sonoraCore.test.ts`: 28 / 28 unit and WebSocket integration tests passed.
