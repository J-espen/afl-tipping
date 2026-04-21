import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

const CURRENT_ROUND = 5

export default function TippingPage() {
  const user = useAuth()
  const [round, setRound] = useState(CURRENT_ROUND)
  const [fixtures, setFixtures] = useState([])
  const [lines, setLines] = useState([])
  const [myTips, setMyTips] = useState({}) // { "match_num": "team" }
  const [locked, setLocked] = useState(false)
  const [allTips, setAllTips] = useState([]) // all tips for this round (post-lock)
  const [saving, setSaving] = useState(null) // match_num being saved
  const [loading, setLoading] = useState(true)
  const [maxRound, setMaxRound] = useState(CURRENT_ROUND)

  const load = useCallback(async () => {
    setLoading(true)

    // Fetch fixtures for this round
    const { data: fix } = await supabase
      .from('fixtures')
      .select('*')
      .eq('round', round)
      .order('match_num')

    // Fetch approved lines
    const { data: lns } = await supabase
      .from('lines')
      .select('*')
      .eq('round', round)
      .eq('status', 'approved')

    // Fetch lock status
    const { data: lock } = await supabase
      .from('round_locks')
      .select('locked')
      .eq('round', round)
      .maybeSingle()

    const isLocked = lock?.locked ?? false
    setLocked(isLocked)
    setFixtures(fix || [])
    setLines(lns || [])

    // My tips
    if (!user.isAdmin) {
      const { data: tips } = await supabase
        .from('tips')
        .select('match_num, tip_team, is_correct')
        .eq('round', round)
        .eq('participant', user.name)

      const tipMap = {}
      for (const t of (tips || [])) {
        tipMap[t.match_num] = { team: t.tip_team, correct: t.is_correct }
      }
      setMyTips(tipMap)
    }

    // If locked, load ALL tips for % display
    if (isLocked) {
      const { data: all } = await supabase
        .from('tips')
        .select('match_num, tip_team, participant, is_correct')
        .eq('round', round)
      setAllTips(all || [])
    }

    setLoading(false)
  }, [round, user.name, user.isAdmin])

  useEffect(() => { load() }, [load])

  // Find max round that has fixtures
  useEffect(() => {
    supabase.from('fixtures').select('round').order('round', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.[0]) setMaxRound(data[0].round) })
  }, [])

  async function saveTip(matchNum, team) {
    if (locked) return
    setSaving(matchNum)
    await supabase.from('tips').upsert({
      round,
      match_num: matchNum,
      participant: user.name,
      tip_team: team,
      is_correct: null,
    }, { onConflict: 'round,match_num,participant' })
    setMyTips(prev => ({ ...prev, [matchNum]: { team, correct: null } }))
    setSaving(null)
  }

  function getLine(matchNum) {
    return lines.find(l => l.match_num === matchNum)
  }

  function getPickPct(matchNum, team) {
    const matchTips = allTips.filter(t => t.match_num === matchNum)
    if (!matchTips.length) return 0
    const picked = matchTips.filter(t => t.tip_team === team).length
    return Math.round((picked / matchTips.length) * 100)
  }

  function getPickCount(matchNum, team) {
    return allTips.filter(t => t.match_num === matchNum && t.tip_team === team).length
  }

  const hasLines = lines.length > 0

  if (loading) return <div className="text-center py-20 text-gray-400 animate-pulse">Loading Round {round}…</div>

  return (
    <div>
      {/* Round selector */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">
            {round === 0 ? 'Opening Round' : `Round ${round}`}
          </h1>
          <p className="text-gray-400 text-sm mt-0.5">
            {locked ? '🔒 Round locked — tips are visible' : hasLines ? '✏️ Tips open — pick your winners' : '⏳ Lines not yet set for this round'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRound(r => Math.max(0, r - 1))} disabled={round === 0} className="btn-secondary px-3 py-2 disabled:opacity-30">◀</button>
          <span className="text-sm font-bold text-gray-300 w-8 text-center">{round}</span>
          <button onClick={() => setRound(r => Math.min(maxRound, r + 1))} disabled={round === maxRound} className="btn-secondary px-3 py-2 disabled:opacity-30">▶</button>
        </div>
      </div>

      {/* No lines warning */}
      {!hasLines && !locked && (
        <div className="card p-5 text-center text-gray-400 border-dashed mb-4">
          <p className="text-lg">📋 Lines haven't been set for Round {round} yet.</p>
          <p className="text-sm mt-1">Check back closer to the round — the admin will publish them.</p>
        </div>
      )}

      {/* Games */}
      <div className="space-y-3">
        {fixtures.map(fix => {
          const line = getLine(fix.match_num)
          const myTip = myTips[fix.match_num]
          const isSaving = saving === fix.match_num
          const canTip = !locked && hasLines && !user.isAdmin

          // Format line display: e.g. "Sydney -23.5" means Sydney needs to win by 24+
          let homeLineDisplay = ''
          let awayLineDisplay = ''
          if (line) {
            const l = line.line
            homeLineDisplay = l < 0 ? `${l}` : `+${l}`
            awayLineDisplay = l < 0 ? `+${Math.abs(l)}` : `-${l}`
          }

          return (
            <div key={fix.match_num} className={`card p-4 ${myTip ? 'border-afl-green/40' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-gray-500">Game {fix.match_num} · {fix.game_date}</span>
                {locked && line?.ats_winner && (
                  <span className="text-xs bg-afl-green/20 text-afl-green px-2 py-0.5 rounded-full font-semibold">
                    ✓ {line.ats_winner} covered
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  { team: fix.home_team, lineStr: homeLineDisplay },
                  { team: fix.away_team, lineStr: awayLineDisplay },
                ].map(({ team, lineStr }) => {
                  const isMyPick = myTip?.team === team
                  const wasCorrect = isMyPick && myTip?.correct === true
                  const wasWrong = isMyPick && myTip?.correct === false
                  const pct = locked ? getPickPct(fix.match_num, team) : 0
                  const cnt = locked ? getPickCount(fix.match_num, team) : 0

                  return (
                    <button
                      key={team}
                      onClick={() => canTip && saveTip(fix.match_num, team)}
                      disabled={!canTip || isSaving}
                      className={`
                        relative rounded-xl p-3 text-left border-2 transition-all duration-150
                        ${isMyPick
                          ? wasCorrect ? 'border-afl-green bg-green-900/40'
                          : wasWrong ? 'border-red-500 bg-red-900/30'
                          : 'border-afl-green bg-green-900/20'
                          : 'border-gray-700 bg-gray-800/50 hover:border-gray-500'}
                        ${canTip ? 'cursor-pointer' : 'cursor-default'}
                      `}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm text-white leading-tight">{team}</p>
                          {line && <p className={`text-xs mt-0.5 font-mono font-bold ${lineStr.startsWith('-') ? 'text-red-400' : 'text-green-400'}`}>{lineStr}</p>}
                        </div>
                        {isMyPick && (
                          <span className="text-lg">
                            {wasCorrect ? '✅' : wasWrong ? '❌' : isSaving ? '⏳' : '✓'}
                          </span>
                        )}
                      </div>

                      {/* Post-lock pick % bar */}
                      {locked && (
                        <div className="mt-2">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>{cnt} tip{cnt !== 1 ? 's' : ''}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-afl-green rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Post-lock: show who picked what */}
              {locked && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <div className="flex flex-wrap gap-1.5">
                    {allTips.filter(t => t.match_num === fix.match_num).map(t => (
                      <span
                        key={t.participant}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          t.is_correct === true ? 'bg-green-900/60 text-green-300'
                          : t.is_correct === false ? 'bg-red-900/60 text-red-300'
                          : 'bg-gray-800 text-gray-400'
                        }`}
                        title={`${t.participant}: ${t.tip_team}`}
                      >
                        {t.participant}: {t.tip_team.split(' ').slice(-1)[0]}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Tip progress for current user */}
      {!locked && hasLines && !user.isAdmin && (
        <div className="mt-6 card p-4 flex items-center justify-between">
          <span className="text-gray-300 text-sm">Your tips this round</span>
          <span className="font-bold text-afl-gold">
            {Object.keys(myTips).length} / {fixtures.length}
          </span>
        </div>
      )}
    </div>
  )
}
