import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ROUNDS = Array.from({ length: 25 }, (_, i) => i) // 0-24

export default function LeaderboardPage() {
  const [board, setBoard] = useState([])
  const [loading, setLoading] = useState(true)
  const [showRounds, setShowRounds] = useState(false)

  async function fetchBoard() {
    const { data } = await supabase
      .from('leaderboard_cache')
      .select('*')
      .order('total_score', { ascending: false })
    if (data) {
      // Sort: total desc, then by name for ties
      const sorted = [...data].sort((a, b) => {
        if (b.total_score !== a.total_score) return b.total_score - a.total_score
        return a.participant.localeCompare(b.participant)
      })
      setBoard(sorted)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchBoard()

    // Realtime subscription
    const channel = supabase
      .channel('leaderboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard_cache' }, fetchBoard)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // Compute rank with ties
  const ranked = board.map((p, i, arr) => ({
    ...p,
    rank: i === 0 ? 1 : (p.total_score === arr[i - 1].total_score ? arr[i - 1]._rank : i + 1),
    _rank: i === 0 ? 1 : (p.total_score === arr[i - 1].total_score ? arr[i - 1]._rank : i + 1),
  }))

  const medalEmoji = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`

  // Find completed rounds (non-zero scores exist)
  const completedRounds = ROUNDS.filter(r => board.some(p => p[`r${r}`] > 0))

  if (loading) return <div className="text-center py-20 text-gray-400 animate-pulse">Loading ladder…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">🏆 Ladder</h1>
          <p className="text-gray-400 text-sm mt-0.5">Updates live · 2026 Season</p>
        </div>
        <button
          onClick={() => setShowRounds(r => !r)}
          className="btn-secondary text-xs px-3 py-2"
        >
          {showRounds ? 'Hide rounds' : 'Show rounds'}
        </button>
      </div>

      {/* Leader banner */}
      {ranked[0] && (
        <div className="card p-5 mb-6 border-afl-gold/50 bg-gradient-to-r from-yellow-900/20 to-gray-900">
          <div className="flex items-center gap-3">
            <span className="text-4xl">🥇</span>
            <div>
              <p className="text-xs text-afl-gold font-semibold uppercase tracking-wide">Leading the pack</p>
              <p className="text-2xl font-extrabold text-white">{ranked[0].participant}</p>
              <p className="text-afl-gold font-bold">{ranked[0].total_score} points</p>
            </div>
          </div>
        </div>
      )}

      {/* Main table */}
      <div className="card overflow-hidden">
        {/* Header */}
        <div className={`grid text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3 border-b border-gray-800 bg-gray-900/50 ${showRounds ? 'overflow-x-auto' : ''}`}>
          <div className={`grid gap-2 items-center ${showRounds ? 'min-w-max' : ''}`}
            style={{ gridTemplateColumns: showRounds ? `2rem 8rem 3.5rem ${completedRounds.map(() => '2.5rem').join(' ')}` : '2rem 1fr 4rem' }}
          >
            <span>#</span>
            <span>Tipper</span>
            <span className="text-right">Total</span>
            {showRounds && completedRounds.map(r => (
              <span key={r} className="text-center">{r === 0 ? 'OR' : `R${r}`}</span>
            ))}
          </div>
        </div>

        {ranked.map((p, i) => (
          <div
            key={p.participant}
            className={`border-b border-gray-800 last:border-0 px-4 py-3.5 transition-colors hover:bg-gray-800/50 ${i === 0 ? 'bg-yellow-900/10' : ''}`}
          >
            <div className={`grid gap-2 items-center ${showRounds ? 'overflow-x-auto' : ''}`}>
              <div
                className={`grid gap-2 items-center ${showRounds ? 'min-w-max' : ''}`}
                style={{ gridTemplateColumns: showRounds ? `2rem 8rem 3.5rem ${completedRounds.map(() => '2.5rem').join(' ')}` : '2rem 1fr 4rem' }}
              >
                <span className="font-bold text-gray-400 text-sm">{medalEmoji(p._rank)}</span>
                <span className="font-semibold text-white">{p.participant}</span>
                <span className={`font-extrabold text-right ${i === 0 ? 'text-afl-gold' : 'text-white'}`}>{p.total_score}</span>
                {showRounds && completedRounds.map(r => {
                  const score = p[`r${r}`] || 0
                  const maxScore = Math.max(...board.map(b => b[`r${r}`] || 0))
                  return (
                    <span
                      key={r}
                      className={`text-center text-xs font-semibold rounded px-1 py-0.5 ${
                        score === maxScore && score > 0 ? 'bg-afl-green/30 text-green-300' : 'text-gray-400'
                      }`}
                    >
                      {score}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-600 mt-4">🔄 Leaderboard updates in real time</p>
    </div>
  )
}
