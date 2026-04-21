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
    // Determine which round(s) to fetch
    // If no round specified, find the most recently locked round without results
    let roundsToFetch = []
    if (round !== null) {
      roundsToFetch = [round]
    } else {
      // Find locked rounds without complete results
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

      // Squiggle uses round numbers directly; Opening Round = Round 0
      // Note: Squiggle API round parameter: round 0 = Opening Round
      const url = `https://api.squiggle.com.au/?q=games;year=${SQUIGGLE_YEAR};round=${r}`
      const response = await fetch(url, {
        headers: { 'User-Agent': 'AFL-Tipping-App/1.0 (contact: admin)' }
      })

      if (!response.ok) throw new Error(`Squiggle API error: ${response.status}`)

      const data = await response.json()
      const games = data.games || []

      console.log(`[fetch-results] Round ${r}: ${games.length} games from Squiggle`)

      // Get our fixtures and lines for this round
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
        // Only process completed games (Squiggle: complete = 100)
        if (game.complete !== 100) continue

        const homeScore = game.hscore
        const awayScore = game.ascore
        if (homeScore == null || awayScore == null) continue

        const margin = homeScore - awayScore // positive = home won

        // Match to our fixture
        const fix = fixtures?.find(f =>
          teamMatch(f.home_team, game.hteam) ||
          teamMatch(f.home_team, game.ateam)
        )
        if (!fix) {
          console.log(`[fetch-results] No fixture match for: ${game.hteam} vs ${game.ateam}`)
          continue
        }

        // Get our line for this fixture
        const line = lines?.find(l => l.match_num === fix.match_num)
        if (!line || line.line == null) continue

        // If home/away are flipped between Squiggle and our data, adjust margin
        let adjustedMargin = margin
        if (teamMatch(fix.home_team, game.ateam)) {
          adjustedMargin = -margin // Squiggle had them reversed
        }

        // ATS calculation: home covers if (margin + line) > 0
        // e.g. home is -23.5, wins by 24 → 24 + (-23.5) = 0.5 > 0 → home covers
        const atsWinner = (adjustedMargin + line.line) > 0 ? fix.home_team : fix.away_team

        // Update line with result
        await supabase.from('lines').update({
          final_margin: adjustedMargin,
          ats_winner: atsWinner,
          updated_at: new Date().toISOString(),
        }).eq('round', r).eq('match_num', fix.match_num)

        // Mark tips correct/incorrect
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

    // Rebuild leaderboard cache
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
