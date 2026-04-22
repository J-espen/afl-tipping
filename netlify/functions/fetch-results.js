/**
 * fetch-results.js — Netlify Function
 *
 * Fetches completed AFL game results from api.squiggle.com.au (free, no auth).
 * Calculates ATS (against the spread) winners and marks tips correct/incorrect.
 * Updates the leaderboard cache via Supabase.
 *
 * SQUIGGLE API DOCS: https://api.squiggle.com.au
 * ENDPOINT USED:     https://api.squiggle.com.au/?q=games;year=2026;round=N
 *
 * SCHEDULE: Every Sunday at 11pm AEST (1pm UTC Sunday)
 *   netlify.toml: schedule = "0 13 * * 0"
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
      return { statusCode: 200, body: JSON.stringify({ success: true, count: 0, message: 'No rounds to update' }) }
    }

    let totalUpdated = 0

    for (const r of roundsToFetch) {
      console.log(`[fetch-results] Fetching results for Round ${r}`)

      const url = `https://api.squiggle.com.au/?q=games;year=${SQUIGGLE_YEAR};round=${r}`
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AFL-Tipping-App/1.0; +https://github.com/J-espen/afl-tipping)',
          'Accept': 'application/json',
          'Referer': 'https://squiggle.com.au'
        }
      })

      if (!response.ok) throw new Error(`Squiggle API error: ${response.status}`)

      const data = await response.json()
      const games = data.games || []

      console.log(`[fetch-results] Round ${r}: ${games.length} games from Squiggle`)

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
        if (game.complete !== 100) continue

        const homeScore = game.hscore
        const awayScore = game.ascore
        if (homeScore == null || awayScore == null) continue

        const margin = homeScore - awayScore

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

        let adjustedMargin = margin
        if (teamMatch(fix.home_team, game.ateam)) {
          adjustedMargin = -margin
        }

        const atsWinner = (adjustedMargin + line.line) > 0 ? fix.home_team : fix.away_team

        await supabase.from('lines').update({
          final_margin: adjustedMargin,
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

function teamMatch(fixtureTeam, squiggleTeam) {
  if (!fixtureTeam || !squiggleTeam) return false
  const a = fixtureTeam.toLowerCase().replace(/[^a-z]/g, '')
  const b = squiggleTeam.toLowerCase().replace(/[^a-z]/g, '')
  return a.includes(b) || b.includes(a) || a === b
}
