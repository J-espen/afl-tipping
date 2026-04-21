import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const CURRENT_ROUND = 5
const PARTICIPANTS = ['Swan', 'Mignon', 'Mr K', 'Uncle', 'Rave', 'Guido', 'Jurgen', 'Stickman']

export default function AdminPage() {
  const [round, setRound] = useState(CURRENT_ROUND)
  const [fixtures, setFixtures] = useState([])
  const [lines, setLines] = useState([])
  const [locked, setLocked] = useState(false)
  const [pendingLines, setPendingLines] = useState([])
  const [editLines, setEditLines] = useState({}) // matchNum -> line value
  const [manualLines, setManualLines] = useState({}) // matchNum -> line value (for manual entry)
  const [results, setResults] = useState({}) // matchNum -> { margin, ats_winner }
  const [msg, setMsg] = useState(null) // { type, text }
  const [scraping, setScraping] = useState(false)
  const [fetchingResults, setFetchingResults] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('lines') // 'lines' | 'results' | 'tips'
  const [allTips, setAllTips] = useState([])

  async function load() {
    setLoading(true)
    const [{ data: fix }, { data: lns }, { data: lock }, { data: tps }] = await Promise.all([
      supabase.from('fixtures').select('*').eq('round', round).order('match_num'),
      supabase.from('lines').select('*').eq('round', round).order('match_num'),
      supabase.from('round_locks').select('locked').eq('round', round).maybeSingle(),
      supabase.from('tips').select('*').eq('round', round).order('participant'),
    ])
    setFixtures(fix || [])
    setLines(lns || [])
    setLocked(lock?.locked ?? false)
    setAllTips(tps || [])

    const pending = (lns || []).filter(l => l.status === 'pending_approval')
    setPendingLines(pending)

    // Initialise edit values for pending lines
    const ev = {}
    for (const l of pending) ev[l.match_num] = l.line ?? ''
    setEditLines(ev)

    // Init manual lines for games without lines
    const fixNums = (fix || []).map(f => f.match_num)
    const approvedNums = (lns || []).filter(l => l.status === 'approved').map(l => l.match_num)
    const ml = {}
    for (const n of fixNums) {
      if (!approvedNums.includes(n) && !pending.find(p => p.match_num === n)) ml[n] = ''
    }
    setManualLines(ml)

    setLoading(false)
  }

  useEffect(() => { load() }, [round])

  function showMsg(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg(null), 4000)
  }

  // ── Lock / Unlock ──────────────────────────────────────────────────────────
  async function toggleLock() {
    const newLocked = !locked
    await supabase.from('round_locks').upsert({ round, locked: newLocked, locked_at: newLocked ? new Date().toISOString() : null })
    setLocked(newLocked)
    showMsg('success', newLocked ? `Round ${round} locked 🔒` : `Round ${round} unlocked 🔓`)
  }

  // ── Approve scraped lines ──────────────────────────────────────────────────
  async function approveLines() {
    for (const l of pendingLines) {
      const lineVal = parseFloat(editLines[l.match_num])
      if (isNaN(lineVal)) { showMsg('error', `Invalid line for game ${l.match_num}`); return }
      await supabase.from('lines').update({ line: lineVal, status: 'approved' }).eq('round', round).eq('match_num', l.match_num)
    }
    showMsg('success', 'Lines approved and published!')
    load()
  }

  // ── Save manual lines ──────────────────────────────────────────────────────
  async function saveManualLines() {
    for (const [matchNumStr, val] of Object.entries(manualLines)) {
      const matchNum = parseInt(matchNumStr)
      if (val === '' || val === null) continue
      const lineVal = parseFloat(val)
      if (isNaN(lineVal)) { showMsg('error', `Invalid line for game ${matchNum}`); return }
      const fix = fixtures.find(f => f.match_num === matchNum)
      await supabase.from('lines').upsert({
        round,
        match_num: matchNum,
        home_team: fix.home_team,
        away_team: fix.away_team,
        line: lineVal,
        status: 'approved',
      }, { onConflict: 'round,match_num' })
    }
    showMsg('success', 'Lines saved and published!')
    load()
  }

  // ── Manual result entry ────────────────────────────────────────────────────
  async function saveResult(matchNum) {
    const r = results[matchNum]
    if (!r?.margin) { showMsg('error', 'Enter a margin'); return }
    const margin = parseFloat(r.margin)
    const line = lines.find(l => l.match_num === matchNum)
    if (!line) { showMsg('error', 'No line found for this game'); return }

    // ATS winner: if line is negative (home favoured), home covers if margin > abs(line)
    const atsWinner = (margin + line.line) > 0 ? line.home_team : line.away_team

    await supabase.from('lines').update({
      final_margin: margin,
      ats_winner: atsWinner,
    }).eq('round', round).eq('match_num', matchNum)

    // Mark tips correct/incorrect
    const gameTips = allTips.filter(t => t.match_num === matchNum)
    for (const tip of gameTips) {
      const correct = tip.tip_team === atsWinner
      await supabase.from('tips').update({ is_correct: correct }).eq('id', tip.id)
    }

    showMsg('success', `Result saved for Game ${matchNum}`)
    load()
    updateLeaderboard()
  }

  // ── Trigger scrape ─────────────────────────────────────────────────────────
  async function triggerScrape() {
    setScraping(true)
    try {
      const res = await fetch('/.netlify/functions/scrape-lines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round }),
      })
      const data = await res.json()
      if (data.success) {
        showMsg('success', `Scraped ${data.count} lines — review and approve below`)
        load()
      } else {
        showMsg('error', data.error || 'Scrape failed — use manual entry below')
      }
    } catch (e) {
      showMsg('error', 'Scrape failed — use manual entry below')
    }
    setScraping(false)
  }

  // ── Trigger results fetch ──────────────────────────────────────────────────
  async function triggerFetchResults() {
    setFetchingResults(true)
    try {
      const res = await fetch('/.netlify/functions/fetch-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round }),
      })
      const data = await res.json()
      if (data.success) {
        showMsg('success', `Results fetched for ${data.count} games!`)
        load()
        updateLeaderboard()
      } else {
        showMsg('error', data.error || 'Results fetch failed')
      }
    } catch (e) {
      showMsg('error', 'Results fetch failed')
    }
    setFetchingResults(false)
  }

  // ── Rebuild leaderboard ────────────────────────────────────────────────────
  async function updateLeaderboard() {
    for (const participant of PARTICIPANTS) {
      const roundScores = {}
      let total = 0
      for (let r = 0; r <= 24; r++) {
        const { data: tps } = await supabase
          .from('tips')
          .select('is_correct')
          .eq('round', r)
          .eq('participant', participant)
        const score = (tps || []).filter(t => t.is_correct).length
        roundScores[`r${r}`] = score
        total += score
      }
      await supabase.from('leaderboard_cache').upsert({
        participant,
        total_score: total,
        ...roundScores,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'participant' })
    }
    showMsg('success', 'Leaderboard updated!')
  }

  const approvedLines = lines.filter(l => l.status === 'approved')

  if (loading) return <div className="text-center py-20 text-gray-400 animate-pulse">Loading admin panel…</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-afl-gold">⚙️ Admin Panel</h1>
          <p className="text-gray-400 text-sm mt-0.5">Round {round === 0 ? '0 (Opening)' : round}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRound(r => Math.max(0, r - 1))} disabled={round === 0} className="btn-secondary px-3 py-2 disabled:opacity-30">◀</button>
          <span className="text-sm font-bold text-gray-300 w-8 text-center">{round}</span>
          <button onClick={() => setRound(r => Math.min(24, r + 1))} className="btn-secondary px-3 py-2">▶</button>
        </div>
      </div>

      {/* Message banner */}
      {msg && (
        <div className={`mb-4 p-4 rounded-xl font-semibold text-sm ${msg.type === 'error' ? 'bg-red-900/50 text-red-300 border border-red-700' : 'bg-green-900/50 text-green-300 border border-green-700'}`}>
          {msg.text}
        </div>
      )}

      {/* Pending approval banner */}
      {pendingLines.length > 0 && (
        <div className="mb-4 p-4 rounded-xl bg-yellow-900/40 border border-yellow-700 text-yellow-300 font-semibold text-sm">
          ⚠️ {pendingLines.length} scraped line{pendingLines.length > 1 ? 's' : ''} pending your approval
        </div>
      )}

      {/* Lock / Actions row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <button onClick={toggleLock} className={locked ? 'btn-secondary' : 'btn-primary'}>
          {locked ? '🔓 Unlock Round' : '🔒 Lock Round'}
        </button>
        <button onClick={triggerScrape} disabled={scraping} className="btn-secondary disabled:opacity-50">
          {scraping ? '⏳ Scraping…' : '🕷 Scrape Lines'}
        </button>
        <button onClick={triggerFetchResults} disabled={fetchingResults} className="btn-secondary disabled:opacity-50">
          {fetchingResults ? '⏳ Fetching…' : '📡 Fetch Results'}
        </button>
        <button onClick={updateLeaderboard} className="btn-gold">
          🏆 Rebuild Ladder
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-900 rounded-xl p-1 border border-gray-800">
        {['lines', 'results', 'tips'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors capitalize ${tab === t ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
            {t === 'lines' ? '📋 Lines' : t === 'results' ? '📊 Results' : '📝 Tips'}
          </button>
        ))}
      </div>

      {/* ── Lines tab ── */}
      {tab === 'lines' && (
        <div className="space-y-4">
          {/* Pending approval */}
          {pendingLines.length > 0 && (
            <div className="card p-4">
              <h3 className="font-bold text-yellow-300 mb-3">Scraped Lines — Review & Edit Before Approving</h3>
              <div className="space-y-2">
                {pendingLines.map(l => (
                  <div key={l.match_num} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                    <span className="text-sm text-gray-300 flex-1">{l.home_team} vs {l.away_team}</span>
                    <input
                      type="number"
                      step="0.5"
                      value={editLines[l.match_num] ?? ''}
                      onChange={e => setEditLines(prev => ({ ...prev, [l.match_num]: e.target.value }))}
                      className="w-24 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-sm text-center"
                      placeholder="e.g. -23.5"
                    />
                  </div>
                ))}
              </div>
              <button onClick={approveLines} className="btn-gold mt-4 w-full">✅ Approve & Publish All Lines</button>
            </div>
          )}

          {/* Manual line entry for games without lines */}
          {Object.keys(manualLines).length > 0 && (
            <div className="card p-4">
              <h3 className="font-bold text-white mb-1">Manual Line Entry</h3>
              <p className="text-xs text-gray-400 mb-3">Enter the home team's handicap (e.g. -23.5 means home team gives 23.5pts)</p>
              <div className="space-y-2">
                {fixtures.filter(f => f.match_num in manualLines).map(fix => (
                  <div key={fix.match_num} className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                    <span className="text-sm text-gray-300 flex-1">{fix.home_team} vs {fix.away_team}</span>
                    <input
                      type="number"
                      step="0.5"
                      value={manualLines[fix.match_num]}
                      onChange={e => setManualLines(prev => ({ ...prev, [fix.match_num]: e.target.value }))}
                      className="w-24 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-white text-sm text-center"
                      placeholder="e.g. -23.5"
                    />
                  </div>
                ))}
              </div>
              <button onClick={saveManualLines} className="btn-primary mt-4 w-full">💾 Save & Publish Lines</button>
            </div>
          )}

          {/* Approved lines */}
          {approvedLines.length > 0 && (
            <div className="card p-4">
              <h3 className="font-bold text-afl-green mb-3">Published Lines</h3>
              <div className="space-y-2">
                {approvedLines.map(l => (
                  <div key={l.match_num} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3 text-sm">
                    <span className="text-gray-300">{l.home_team} vs {l.away_team}</span>
                    <span className={`font-mono font-bold ${l.line < 0 ? 'text-red-400' : 'text-green-400'}`}>{l.line > 0 ? '+' : ''}{l.line}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Results tab ── */}
      {tab === 'results' && (
        <div className="card p-4">
          <h3 className="font-bold text-white mb-1">Enter Results Manually</h3>
          <p className="text-xs text-gray-400 mb-4">Enter the home team's final margin (positive = home won, negative = away won). ATS winner is calculated automatically.</p>
          <div className="space-y-3">
            {approvedLines.map(l => (
              <div key={l.match_num} className="bg-gray-800/50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="text-sm font-semibold text-white">{l.home_team} vs {l.away_team}</span>
                    <span className="text-xs text-gray-500 ml-2">Line: {l.line > 0 ? '+' : ''}{l.line}</span>
                  </div>
                  {l.ats_winner && <span className="text-xs text-afl-green font-bold">✓ {l.ats_winner}</span>}
                </div>
                {!l.ats_winner && (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Home margin (e.g. 24 or -8)"
                      value={results[l.match_num]?.margin ?? l.final_margin ?? ''}
                      onChange={e => setResults(prev => ({ ...prev, [l.match_num]: { margin: e.target.value } }))}
                      className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                    />
                    <button onClick={() => saveResult(l.match_num)} className="btn-primary text-sm px-4">Save</button>
                  </div>
                )}
                {l.ats_winner && l.final_margin != null && (
                  <div className="flex gap-2 mt-1">
                    <input
                      type="number"
                      defaultValue={l.final_margin}
                      onChange={e => setResults(prev => ({ ...prev, [l.match_num]: { margin: e.target.value } }))}
                      className="flex-1 bg-gray-900 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                    />
                    <button onClick={() => saveResult(l.match_num)} className="btn-secondary text-sm px-4">Override</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Tips tab ── */}
      {tab === 'tips' && (
        <div className="card p-4">
          <h3 className="font-bold text-white mb-3">All Tips — Round {round}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <th className="pb-2 pr-3">Game</th>
                  {PARTICIPANTS.map(p => <th key={p} className="pb-2 px-2 text-center">{p}</th>)}
                </tr>
              </thead>
              <tbody>
                {fixtures.map(fix => (
                  <tr key={fix.match_num} className="border-b border-gray-800/50">
                    <td className="py-2 pr-3 text-gray-400 text-xs">
                      <span className="block font-semibold text-white">{fix.home_team}</span>
                      <span className="text-gray-500">vs {fix.away_team}</span>
                    </td>
                    {PARTICIPANTS.map(p => {
                      const tip = allTips.find(t => t.match_num === fix.match_num && t.participant === p)
                      return (
                        <td key={p} className="py-2 px-2 text-center">
                          {tip ? (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              tip.is_correct === true ? 'bg-green-900/60 text-green-300'
                              : tip.is_correct === false ? 'bg-red-900/60 text-red-300'
                              : 'bg-gray-800 text-gray-300'
                            }`}>
                              {tip.tip_team.split(' ').slice(-1)[0]}
                            </span>
                          ) : <span className="text-gray-700">–</span>}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
