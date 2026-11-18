import React, { useMemo, useState } from 'react';
import { BarChart3, Clock, Flame, Shield, Trash2 } from 'lucide-react';
import { useLibraryStore } from '../../store/useLibraryStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { computeListeningAnalytics } from '../../utils/analyticsEngine';
import { ConfirmDialog } from '../library/ConfirmDialog';

function formatListeningDuration(totalSec: number): string {
  const mins = Math.round(totalSec / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

export const AnalyticsView: React.FC = () => {
  const tracks = useLibraryStore((s) => s.tracks);
  const listeningEvents = useLibraryStore((s) => s.listeningEvents);
  const settings = useLibraryStore((s) => s.settings);
  const updateAppSettings = useLibraryStore((s) => s.updateAppSettings);
  const clearAnalyticsData = useLibraryStore((s) => s.clearAnalyticsData);
  const playTrackById = usePlayerStore((s) => s.playTrackById);

  const [confirmClear, setConfirmClear] = useState(false);

  const analyticsEnabled = settings.analyticsEnabled ?? true;

  const summary = useMemo(
    () => computeListeningAnalytics({ tracks, events: listeningEvents }),
    [tracks, listeningEvents]
  );

  const maxDailyMin = useMemo(
    () => Math.max(1, ...summary.dailyBars.map((b) => b.minutes)),
    [summary.dailyBars]
  );

  const maxMonthlyMin = useMemo(
    () => Math.max(1, ...summary.monthlyBars.map((b) => b.minutes)),
    [summary.monthlyBars]
  );

  return (
    <section className="flex flex-col flex-1 min-h-0 overflow-y-auto space-y-5 pb-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.07]">
        <div>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">
            Listening Analytics
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            100% local IndexedDB listening telemetry stored only in this browser
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-[#0B0C10] text-xs text-gray-200 cursor-pointer">
            <Shield className="w-3.5 h-3.5 text-red-400" />
            <span>Track Sessions</span>
            <input
              type="checkbox"
              checked={analyticsEnabled}
              onChange={(e) => void updateAppSettings({ analyticsEnabled: e.target.checked })}
              className="accent-red-600"
            />
          </label>

          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 rounded-xl border border-red-500/30 text-xs font-medium text-red-300 hover:bg-red-500/10"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Statistics</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-4">
          <span className="text-xs text-gray-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-red-400" /> Total Listening
          </span>
          <p className="font-display text-2xl font-bold text-white mt-2 tabular-nums">
            {formatListeningDuration(summary.totalSeconds)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-4">
          <span className="text-xs text-gray-400">Today</span>
          <p className="font-display text-2xl font-bold text-white mt-2 tabular-nums">
            {formatListeningDuration(summary.todaySeconds)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-4">
          <span className="text-xs text-gray-400">Last 7 Days</span>
          <p className="font-display text-2xl font-bold text-white mt-2 tabular-nums">
            {formatListeningDuration(summary.weekSeconds)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-4">
          <span className="text-xs text-gray-400">This Month</span>
          <p className="font-display text-2xl font-bold text-white mt-2 tabular-nums">
            {formatListeningDuration(summary.monthSeconds)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.07] bg-[#111216] p-4 col-span-2 lg:col-span-1">
          <span className="text-xs text-gray-400 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5 text-amber-400" /> Listening Streak
          </span>
          <p className="font-display text-2xl font-bold text-white mt-2 tabular-nums">
            {summary.streakDays} {summary.streakDays === 1 ? 'day' : 'days'}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-red-400" />
              <span>Daily Activity (Last 14 Days)</span>
            </h2>
            <span className="text-[11px] font-mono text-gray-500">minutes/day</span>
          </div>
          <div className="h-36 flex items-end gap-1.5 pt-4">
            {summary.dailyBars.map((bar) => {
              const pct = Math.max(4, Math.round((bar.minutes / maxDailyMin) * 100));
              return (
                <div key={bar.dayKey} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <div className="w-full h-24 flex items-end">
                    <div
                      title={`${bar.label}: ${bar.minutes}m`}
                      className="w-full rounded-t bg-red-600/80 hover:bg-red-500 transition-all"
                      style={{ height: `${bar.minutes > 0 ? pct : 3}%`, opacity: bar.minutes > 0 ? 1 : 0.25 }}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-gray-500 truncate w-full text-center">
                    {bar.label.split(' ')[1] || bar.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Monthly Summary (6 Months)</h2>
            <span className="text-[11px] font-mono text-gray-500">minutes/month</span>
          </div>
          <div className="h-36 flex items-end gap-3 pt-4">
            {summary.monthlyBars.map((bar) => {
              const pct = Math.max(5, Math.round((bar.minutes / maxMonthlyMin) * 100));
              return (
                <div key={bar.monthKey} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                  <span className="text-[10px] font-mono text-gray-400 tabular-nums">
                    {Math.round(bar.minutes)}m
                  </span>
                  <div className="w-full h-20 flex items-end">
                    <div
                      className="w-full rounded-t bg-red-500/80"
                      style={{ height: `${bar.minutes > 0 ? pct : 4}%`, opacity: bar.minutes > 0 ? 1 : 0.25 }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 truncate w-full text-center">
                    {bar.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Leaderboards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 space-y-3">
          <h2 className="text-sm font-semibold text-white">Top Songs</h2>
          {summary.topSongs.length === 0 ? (
            <p className="text-xs text-gray-500 py-6 text-center">No plays recorded yet.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
              {summary.topSongs.map((item, idx) => (
                <button
                  key={item.track.id}
                  type="button"
                  onClick={() => void playTrackById(item.track.id)}
                  className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-[#0B0C10] hover:bg-white/[0.05] text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono text-xs text-gray-500 w-5">{idx + 1}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{item.track.title}</p>
                      <p className="text-[11px] text-gray-400 truncate">{item.track.artist}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono tabular-nums text-red-400 shrink-0">
                    {item.plays} plays
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[#111216] p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-white mb-2">Top Artists</h2>
            {summary.topArtists.length === 0 ? (
              <p className="text-xs text-gray-500 py-3">No artist data yet.</p>
            ) : (
              <div className="space-y-1.5">
                {summary.topArtists.slice(0, 5).map((a) => (
                  <div key={a.artist} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-[#0B0C10]">
                    <span className="text-white truncate">{a.artist}</span>
                    <span className="font-mono text-gray-400 tabular-nums shrink-0">
                      {a.plays} plays · {formatListeningDuration(a.seconds)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-sm font-semibold text-white mb-2">Top Genres</h2>
            {summary.topGenres.length === 0 ? (
              <p className="text-xs text-gray-500 py-3">No genre data yet.</p>
            ) : (
              <div className="space-y-1.5">
                {summary.topGenres.slice(0, 5).map((g) => (
                  <div key={g.genre} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-[#0B0C10]">
                    <span className="text-white truncate">{g.genre}</span>
                    <span className="font-mono text-gray-400 tabular-nums shrink-0">
                      {g.plays} plays
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear Listening Analytics"
        message="Erase all recorded listening session history and daily statistics? Your music tracks and playlists will remain untouched."
        confirmLabel="Clear Stats"
        onCancel={() => setConfirmClear(false)}
        onConfirm={async () => {
          setConfirmClear(false);
          await clearAnalyticsData();
        }}
      />
    </section>
  );
};
