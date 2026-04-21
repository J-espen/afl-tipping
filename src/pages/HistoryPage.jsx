import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function HistoryPage() {
  const [round, setRound] = useState(4)
  const [fixtures, setFixtures] = useState([])
  const [lines, setLines] = useState([])
  const [tips, setTips] = useState([])
  const [loading, setLoading] = useState(true)

  const PARTICIPANTS = ['Swan', 'Mignon', 'Mr K', 'Uncle', 'Rave', 'Guido', 'Jurgen', 'Stickman']

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: fix }, { data: lns }, { data: tps }] = await Promise.all([
        supabase.from('fixtures').select('*').eq('round', round).order('match_num'),
        supabase.from('lines').select('*').eq('round', round),
        supabase.from('tips').select('*').eq('round', round),
      ])
      setFixtures(fix || [])
      setLines(lns || [])
      setTips(tps || [])
      setLoading(false)
    }
    load()
  }, [round])

  function getLine(matchNum) {
    return lines.find(l => l.match_num === matchNum)
  }

  function getTip(matchNum, participant) {
    return tips.find(t => t.match_num === matchNum && t.participant === participant)
  }

  // Per-round score per participant
  function roundScore(participant) {
    return tips.filter(t => t.participant === participant && t.is_correct).length
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">📚 Round History</h1>
          <p className="text-gray-400 text-sm mt-0.5">View completed rounds</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRound(r => Math.max(0, r - 1))} disabled={round === 0} className="btn-secondary px-3 py-2 disabled:opacity-30">◀</button>
          <span className="text-sm font-bold text-gray-300 w-8 text-center">{round === 0 ? 'OR' : round}</span>
          <button onClick={() => setRound(r => Math.min(24, r + 1))} className="btn-secondary px-3 py-2">▶</button>
        </div>
      </div>

      {/* Round score summary */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 mb-6">
        {PARTICIPANTS.map(p => (
          <div key={p} className="card p-3 text-center">
            <p className="text-xs text-gray-400 truncate">{p}</p>
            <p className="text-xl font-extrabold text-afl-gold mt-1">{roundScore(p)}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-20 text-gray-400 animate-pulse">Loading…</div>
      ) : fixtures.length === 0 ? (
        <div className="card p-8 text-center text-gray-400">No data for this round yet.</div>
      ) : (
        <div className="space-y-4">
          {fixtures.map(fix => {
            const line = getLine(fix.match_num)
            const hasResult = line?.ats_winner

            return (
              <div key={fix.match_num} className="card overflow-hidden">
                {/* Game header */}
                <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-gray-500">Game {fix.match_num} · {fix.game_date}</span>
                    <div className="flex gap-2 mt-0.5">
                      <span className="text-sm font-semibold text-white">{fix.home_team}</span>
                      <span className="text-gray-500">vs</span>
                      <span className="text-sm font-semibold text-white">{fix.away_team}</span>
                    </div>
                    {line?.line != null && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Line: {fix.home_team} {line.line > 0 ? '+' : ''}{line.line}
                        {line.final_margin != null && ` · Margin: ${line.final_margin > 0 ? '+' : ''}${line.final_margin}`}
                      </p>
                    )}
                  </div>
                  {hasResult && (
                    <div className="text-right">
                      <p className="text-xs text-gray-500">ATS Winner</p>
                      <p className="text-sm font-bold text-afl-green">{line.ats_winner}</p>
                    </div>
                  )}
                </div>

                {/* Tips grid */}
                <div className="px-4 py-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {PARTICIPANTS.map(p => {
                      const tip = getTip(fix.match_num, p)
                      if (!tip) return (
                        <div key={p} className="rounded-lg bg-gray-800/30 p-2">
                          <p className="text-xs text-gray-500">{p}</p>
                          <p className="text-xs text-gray-600 italic mt-0.5">No tip</p>
                        </div>
                      )
                      return (
                        <div
                          key={p}
                          className={`rounded-lg p-2 border ${
                            tip.is_correct === true ? 'bg-green-900/30 border-green-700'
                            : tip.is_correct === false ? 'bg-red-900/30 border-red-800'
                            : 'bg-gray-800/50 border-gray-700'
                          }`}
                        >
                          <p className="text-xs text-gray-400">{p}</p>
                          <p className="text-xs font-semibold text-white mt-0.5 leading-tight">{tip.tip_team}</p>
                          {tip.is_correct !== null && (
                            <span className="text-sm">{tip.is_correct ? '✅' : '❌'}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
