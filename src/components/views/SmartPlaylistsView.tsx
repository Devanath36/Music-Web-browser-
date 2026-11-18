import React, { useMemo, useState } from 'react';
import { ArrowLeft, Play, Plus, SlidersHorizontal, Sparkles, Trash2 } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import type {
  SmartPlaylistRecord,
  SmartPlaylistRule,
  SmartRuleField,
  SmartRuleOperator,
} from '../../types/music';
import { BUILTIN_SMART_TEMPLATES, evaluateSmartPlaylist } from '../../utils/smartPlaylists';
import { TrackList } from '../library/TrackList';

const FIELD_OPTIONS: Array<{ value: SmartRuleField; label: string }> = [
  { value: 'playCount', label: 'Play Count' },
  { value: 'daysSincePlayed', label: 'Days Since Played' },
  { value: 'daysSinceAdded', label: 'Days Since Added' },
  { value: 'artist', label: 'Artist' },
  { value: 'genre', label: 'Genre' },
  { value: 'album', label: 'Album' },
  { value: 'isFavorite', label: 'Is Favorite' },
  { value: 'rating', label: 'Star Rating (1-5)' },
  { value: 'year', label: 'Release Year' },
];

const OP_OPTIONS: Array<{ value: SmartRuleOperator; label: string }> = [
  { value: 'gt', label: 'Greater than (>)' },
  { value: 'lt', label: 'Less than (<)' },
  { value: 'eq', label: 'Equals (=)' },
  { value: 'contains', label: 'Contains' },
  { value: 'is', label: 'Is exact' },
  { value: 'is_not', label: 'Is not' },
];

export const SmartPlaylistsView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const favoriteIds = useLibraryStore((s) => s.favoriteIds);
  const smartPlaylists = useLibraryStore((s) => s.smartPlaylists);
  const createSmartPlaylist = useLibraryStore((s) => s.createSmartPlaylist);
  const deleteSmartPlaylist = useLibraryStore((s) => s.deleteSmartPlaylist);
  const playTrackList = usePlayerStore((s) => s.playTrackList);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');
  const [rules, setRules] = useState<SmartPlaylistRule[]>([
    { id: 'r1', field: 'playCount', operator: 'gt', value: '3' },
  ]);

  const activePlaylist: SmartPlaylistRecord | null = useMemo(
    () => smartPlaylists.find((sp) => sp.id === selectedId) || null,
    [smartPlaylists, selectedId]
  );

  const activeTracks = useMemo(() => {
    if (!activePlaylist) return [];
    return evaluateSmartPlaylist(activePlaylist, tracks, favoriteIds);
  }, [activePlaylist, tracks, favoriteIds]);

  const previewTracks = useMemo(
    () => evaluateSmartPlaylist({ matchMode, rules }, tracks, favoriteIds),
    [matchMode, rules, tracks, favoriteIds]
  );

  const handleSaveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await createSmartPlaylist({
      name,
      description,
      matchMode,
      rules,
    });
    setShowBuilder(false);
    setName('');
    setDescription('');
    setSelectedId(created.id);
  };

  if (activePlaylist) {
    return (
      <section className="flex flex-col flex-1 min-h-0">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-white/10 text-gray-300 hover:text-white hover:bg-white/5"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold text-white truncate">
                {activePlaylist.name}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                {activeTracks.length} matching {activeTracks.length === 1 ? 'track' : 'tracks'} · Auto-updated
              </p>
            </div>
          </div>

          {activeTracks.length > 0 && (
            <button
              type="button"
              onClick={() => playTrackList(activeTracks.map((t) => t.id), 0)}
              className="inline-flex items-center gap-2 min-h-[38px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Play Smart Mix</span>
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 pt-2 flex flex-col">
          <TrackList
            tracks={activeTracks}
            emptyTitle="No matching tracks right now"
            emptySubtitle="This smart playlist updates automatically as you import, favorite, rate, or listen to tracks."
          />
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Smart Playlists
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Dynamic rule-driven playlists that update automatically across your offline library
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowBuilder((v) => !v)}
          className="inline-flex items-center gap-2 min-h-[40px] px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
        >
          <Plus className="w-4 h-4" />
          <span>{showBuilder ? 'Close Builder' : 'New Smart Rule'}</span>
        </button>
      </div>

      {/* Rule Builder */}
      {showBuilder && (
        <form
          onSubmit={handleSaveNew}
          className="rounded-2xl border border-red-500/30 bg-[#111216] p-5 space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Smart Playlist Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Late Night Favorites"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Match Condition
              </label>
              <select
                value={matchMode}
                onChange={(e) => setMatchMode(e.target.value as 'all' | 'any')}
                className="w-full rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
              >
                <option value="all">Match ALL rules (AND)</option>
                <option value="any">Match ANY rule (OR)</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            {rules.map((rule, idx) => (
              <div key={rule.id} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                <select
                  value={rule.field}
                  onChange={(e) => {
                    const f = e.target.value as SmartRuleField;
                    setRules((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, field: f } : r))
                    );
                  }}
                  className="rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-xs text-white"
                >
                  {FIELD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <select
                  value={rule.operator}
                  onChange={(e) => {
                    const op = e.target.value as SmartRuleOperator;
                    setRules((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, operator: op } : r))
                    );
                  }}
                  className="rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-xs text-white"
                >
                  {OP_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  placeholder={rule.field === 'isFavorite' ? 'true / false' : 'Value...'}
                  value={rule.value}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRules((prev) =>
                      prev.map((r, i) => (i === idx ? { ...r, value: val } : r))
                    );
                  }}
                  className="flex-1 min-w-[120px] rounded-xl border border-white/10 bg-[#050507] px-3 py-2 text-xs text-white focus:outline-none focus:border-red-500"
                />

                {rules.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setRules((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-2 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/[0.06]">
            <button
              type="button"
              onClick={() =>
                setRules((prev) => [
                  ...prev,
                  { id: `r${Date.now()}`, field: 'genre', operator: 'contains', value: '' },
                ])
              }
              className="inline-flex items-center gap-1.5 text-xs font-medium text-red-400 hover:text-red-300"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Condition</span>
            </button>

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-gray-400 tabular-nums">
                Live match: {previewTracks.length} track(s)
              </span>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-red-600 text-xs font-semibold text-white hover:bg-red-500"
              >
                Save Smart Playlist
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Quick Starter Templates */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          One-Click Starter Rules
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BUILTIN_SMART_TEMPLATES.map((tpl) => {
            const matches = evaluateSmartPlaylist(tpl, tracks, favoriteIds);
            return (
              <button
                key={tpl.name}
                type="button"
                onClick={async () => {
                  const created = await createSmartPlaylist(tpl);
                  setSelectedId(created.id);
                }}
                className="rounded-2xl border border-white/[0.07] bg-[#0B0C10] p-3.5 text-left hover:border-red-500/40 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <Sparkles className="w-4 h-4 text-red-400" />
                  <span className="text-[11px] font-mono text-gray-400 tabular-nums">
                    {matches.length} tracks
                  </span>
                </div>
                <p className="text-sm font-semibold text-white mt-2">{tpl.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{tpl.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Saved Smart Playlists */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Your Dynamic Smart Playlists ({smartPlaylists.length})
        </p>
        {smartPlaylists.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/[0.08] bg-[#0B0C10]/80 p-10 text-center">
            <SlidersHorizontal className="w-8 h-8 text-gray-600 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              Create a custom rule or click any starter template above.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {smartPlaylists.map((sp) => {
              const items = evaluateSmartPlaylist(sp, tracks, favoriteIds);
              return (
                <div
                  key={sp.id}
                  className="rounded-2xl border border-white/[0.07] bg-[#111216] p-4 flex flex-col justify-between gap-3 hover:border-red-500/35"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(sp.id)}
                    className="text-left space-y-1"
                  >
                    <h3 className="font-display text-base font-semibold text-white truncate">
                      {sp.name}
                    </h3>
                    <p className="text-xs text-gray-400 tabular-nums">
                      {items.length} matching {items.length === 1 ? 'track' : 'tracks'} · {sp.rules.length}{' '}
                      {sp.rules.length === 1 ? 'rule' : 'rules'} ({sp.matchMode.toUpperCase()})
                    </p>
                  </button>

                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
                    <button
                      type="button"
                      disabled={items.length === 0}
                      onClick={() => playTrackList(items.map((t) => t.id), 0)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-400 hover:text-red-300 disabled:opacity-30"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Play Mix</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSmartPlaylist(sp.id)}
                      aria-label={`Delete smart playlist ${sp.name}`}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-white/5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
