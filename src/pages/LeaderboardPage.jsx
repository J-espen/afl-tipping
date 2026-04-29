import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ROUNDS = Array.from({ length: 25 }, (_, i) => i) // 0-24

export default function LeaderboardPage() {
  const [board, setBoard] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchBoard() {
    const { data } = await supabase
      .from('leaderboard_cache')
      .select('*')
      .order('total_score', { ascending: false })
    if (data) {
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
    const channel = supabase
      .channel('leaderboard-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard_cache' }, fetchBoard)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  const ranked = board.map((p, i, arr) => {
    let rank = 1
    for (let j = 0; j < i; j++) {
      if (arr[j].total_score > p.total_score) rank++
    }
    return { ...p, rank }
  })

  const completedRounds = ROUNDS.filter(r => board.some(p => (p[`r${r}`] || 0) > 0))
  const maxRoundScore = Math.max(1, ...completedRounds.flatMap(r => board.map(p => p[`r${r}`] || 0)))
  const roundAvg = (r) => {
    if (!board.length) return 0
    const scores = board.map(p => p[`r${r}`] || 0)
    return scores.reduce((a, b) => a + b, 0) / scores.length
  }

  const medalEmoji = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null

  if (loading) return <div className="text-center py-20 text-gray-400 animate-pulse">Loading ladder…</div>

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white">🏆 Ladder</h1>
        <p className="text-gray-400 text-sm mt-0.5">2026 Season · Updates live</p>
      </div>

      {completedRounds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {completedRounds.map(r => {
            const maxScore = Math.max(...board.map(p => p[`r${r}`] || 0))
            return (
              <div key={r} className="bg-gray-800 rounded-lg px-3 py-1.5 text-center border border-gray-700">
                <p className="text-xs text-gray-500">{r === 0 ? 'OR' : `Rd ${r}`}</p>
                <p className="text-sm font-bold text-afl-gold">{maxScore}/9</p>
              </div>
            )
          })}
        </div>
      )}

      {ranked[0] && (
        <div className="card p-5 mb-4 border-afl-gold/40 bg-gradient-to-r from-yellow-900/20 to-gray-900">
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

      <div className="card overflow-hidden">
        {ranked.map((p, i) => (
          <div
            key={p.participant}
            className={`border-b border-gray-800 last:border-0 px-4 py-4 ${i === 0 ? 'bg-yellow-900/10' : 'hover:bg-gray-800/30'} transition-colors`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 text-center">
                  {medalEmoji(p.rank)
                    ? <span className="text-xl">{medalEmoji(p.rank)}</span>
                    : <span className="text-gray-500 font-bold text-sm">{p.rank}</span>
                  }
                </div>
                <span className="font-bold text-white text-lg">{p.participant}</span>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-extrabold ${i === 0 ? 'text-afl-gold' : 'text-white'}`}>
                  {p.total_score}
                </span>
                <span className="text-gray-500 text-sm ml-1">pts</span>
              </div>
            </div>

            {completedRounds.length > 0 && (
              <div className="flex items-end gap-1 pl-11" style={{ height: '52px' }}>
                {completedRounds.map(r => {
                  const score = p[`r${r}`] || 0
                  const avg = roundAvg(r)
                  const aboveAvg = score >= avg
                  const isZero = score === 0
                  const barHeight = isZero ? 4 : Math.max(14, (score / maxRoundScore) * 32)

                  return (
                    <div key={r} className="flex flex-col items-center justify-end flex-1 min-w-0 h-full gap-0.5">
                      <span className={`font-bold leading-none ${
                        isZero ? 'text-gray-700' : aboveAvg ? 'text-green-400' : 'text-red-400'
                      }`} style={{ fontSize: '10px' }}>
                        {isZero ? '–' : score}
                      </span>
                      <div
                        className={`w-full rounded-t ${
                          isZero ? 'bg-gray-800' : aboveAvg ? 'bg-afl-green' : 'bg-red-500/80'
                        }`}
                        style={{ height: `${barHeight}px` }}
                      />
                      <span className="text-gray-600 leading-none" style={{ fontSize: '9px' }}>
                        {r === 0 ? 'OR' : `R${r}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-gray-600 mt-4">🔄 Real time · 🟢 Above avg · 🔴 Below avg</p>
    </div>
  )
}
