/**
 * fetch-results.js — Netlify Function
 *
 * Tries multiple free AFL data sources in order:
 *   1. api.squiggle.com.au (free, no auth)
 *   2. aflapi.net (community wrapper, no auth)
 *
 * SCHEDULE: Every Monday at 11pm AEST = Monday 1pm UTC
 *   netlify.toml: schedule = "0 13 * * 1"
 */

const { createClient } = require('@supabase/supabase-js')

const PARTICIPANTS = ['Swan', 'Mignon', 'Mr K', 'Uncle', 'Rave', 'Guido', 'Jurgen', 'Stickman']
const SQUIGGLE_YEAR = 2026

exports.handler = async (event) => {
  let round = null
  try {
    const body = JSON.parse(event.body || '{}')
    if (body.round !== undefined) round = body.round
  } catch {}

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  try {
    let roundsToFetch = []
    if (round !== null) {
      roundsToFetch = [round]
    } else {
      const { data: locks } = await supabase
        .from('round_locks')
        .select('round')
        .eq('locked', true)
      const { data: incompleteLines } = await supabase
        .from('lines')
        .select('round')
        .is('ats_winner', null)
        .eq('status', 'approved')

      const incompleteRounds = [...new Set((incompleteLines || []).map(l => l.round))]
      roundsToFetch = (locks || [])
        .map(l => l.round)
        .filter(r => incompleteRounds.includes(r))
    }

    if (!roundsToFetch.length) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, count: 0, message: 'No rounds to update' })
      }
    }

    let totalUpdated = 0

    for (const r of roundsToFetch) {
      console.log(`[fetch-results] Fetching Round ${r}`)

      // Try fetching from multiple sources
      let games = await fetchFromSquiggle(r)

      if (!games || games.length === 0) {
        console.log('[fetch-results] Squiggle failed, trying AFL Tables...')
        games = await fetchFromAFLTables(r)
      }

      if (!games || games.length === 0) {
        throw new Error(`Could not fetch results for Round ${r} from any source`)
      }

      console.log(`[fetch-results] Got ${games.length} games`)

      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('*')
        .eq('round', r)

      const { data: lines } = await supabase
        .from('lines')
        .select('*')
        .eq('round', r)
        .eq('status', 'approved')

      for (const game of games) {
        if (!game.complete) continue

        const fix = fixtures?.find(f =>
          teamMatch(f.home_team, game.hteam) ||
          teamMatch(f.home_team, game.ateam)
        )
        if (!fix) {
          console.log(`[fetch-results] No fixture match for: ${game.hteam} vs ${game.ateam}`)
          continue
        }

        const line = lines?.find(l => l.match_num === fix.match_num)
        if (!line || line.line == null) continue

        let margin = game.hscore - game.ascore
        if (teamMatch(fix.home_team, game.ateam)) margin = -margin

        const atsWinner = (margin + line.line) > 0 ? fix.home_team : fix.away_team

        await supabase.from('lines').update({
          final_margin: margin,
          ats_winner: atsWinner,
          updated_at: new Date().toISOString(),
        }).eq('round', r).eq('match_num', fix.match_num)

        const { data: gameTips } = await supabase
          .from('tips')
          .select('id, tip_team')
          .eq('round', r)
          .eq('match_num', fix.match_num)

        for (const tip of (gameTips || [])) {
          await supabase.from('tips').update({
            is_correct: tip.tip_team === atsWinner,
            updated_at: new Date().toISOString(),
          }).eq('id', tip.id)
        }

        totalUpdated++
      }
    }

    await rebuildLeaderboard(supabase)

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, count: totalUpdated }),
    }

  } catch (error) {
    console.error('[fetch-results] Error:', error.message)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    }
  }
}

// ── Source 1: Squiggle ────────────────────────────────────────────────────────
async function fetchFromSquiggle(round) {
  try {
    const url = `https://api.squiggle.com.au/?q=games;year=${SQUIGGLE_YEAR};round=${round}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'AFL-Tipping-App/1.0 (private comp; https://github.com/J-espen/afl-tipping)',
        'Accept': 'application/json',
      }
    })
    if (!res.ok) {
      console.log(`[squiggle] HTTP ${res.status}`)
      return null
    }
    const data = await res.json()
    return (data.games || [])
      .filter(g => g.complete === 100)
      .map(g => ({
        hteam: g.hteam,
        ateam: g.ateam,
        hscore: g.hscore,
        ascore: g.ascore,
        complete: true,
      }))
  } catch (e) {
    console.log('[squiggle] Error:', e.message)
    return null
  }
}

// ── Source 2: AFL Tables (afltables.com) ──────────────────────────────────────
// Scrapes the simple text-based afltables.com which has no JS requirement
async function fetchFromAFLTables(round) {
  try {
    const url = `https://afltables.com/afl/seas/${SQUIGGLE_YEAR}.html`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AFL-Tipping-App/1.0)',
        'Accept': 'text/html',
      }
    })
    if (!res.ok) {
      console.log(`[afltables] HTTP ${res.status}`)
      return null
    }
    const html = await res.text()

    // Parse simple HTML table rows for completed games
    // AFLTables format: Team1 Score1 - Score2 Team2
    const games = []
    // Match score patterns like: "Adelaide 85 def Carlton 72" or score tables
    const roundMarker = `Round ${round}`
    const roundIdx = html.indexOf(roundMarker)
    if (roundIdx === -1) return null

    // Extract section for this round
    const nextRoundIdx = html.indexOf('Round', roundIdx + 10)
    const section = html.slice(roundIdx, nextRoundIdx > -1 ? nextRoundIdx : roundIdx + 5000)

    // Match score rows: look for patterns with two scores
    const scoreRegex = /<td[^>]*>([A-Za-z ]+)<\/td>.*?<td[^>]*>(\d+)<\/td>.*?<td[^>]*>(\d+)<\/td>.*?<td[^>]*>([A-Za-z ]+)<\/td>/gs
    let match
    while ((match = scoreRegex.exec(section)) !== null) {
      const hteam = match[1].trim()
      const hscore = parseInt(match[2])
      const ascore = parseInt(match[3])
      const ateam = match[4].trim()
      if (hteam && ateam && !isNaN(hscore) && !isNaN(ascore)) {
        games.push({ hteam, ateam, hscore, ascore, complete: true })
      }
    }

    return games.length > 0 ? games : null
  } catch (e) {
    console.log('[afltables] Error:', e.message)
    return null
  }
}

async function rebuildLeaderboard(supabase) {
  for (const participant of PARTICIPANTS) {
    const roundScores = {}
    let total = 0
    for (let r = 0; r <= 24; r++) {
      const { data: tps } = await supabase
        .from('tips')
        .select('is_correct')
        .eq('round', r)
        .eq('participant', participant)
      const score = (tps || []).filter(t => t.is_correct === true).length
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
}

function teamMatch(fixtureTeam, scrapedTeam) {
  if (!fixtureTeam || !scrapedTeam) return false
  const a = fixtureTeam.toLowerCase().replace(/[^a-z]/g, '')
  const b = scrapedTeam.toLowerCase().replace(/[^a-z]/g, '')
  return a.includes(b) || b.includes(a) || a === b
}
