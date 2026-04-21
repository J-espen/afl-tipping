/**
 * scrape-lines.js — Netlify Function
 *
 * Scrapes AFL handicap (line) markets from Sportsbet.com.au using
 * Puppeteer (headless Chrome). Because Sportsbet is a JS-heavy SPA,
 * we must render the page before extracting data.
 *
 * TARGET URL:
 *   https://www.sportsbet.com.au/betting/australian-rules/afl
 *   Navigate to the "Line" tab on the AFL markets page.
 *
 * HOW TO UPDATE SELECTORS IF SPORTSBET CHANGES THEIR SITE:
 *   1. Open the Sportsbet AFL page in Chrome DevTools (F12)
 *   2. Inspect the line market elements
 *   3. Update the CSS_SELECTORS object below with new selectors
 *   4. The key selectors are: EVENT_ROW, HOME_TEAM, AWAY_TEAM, LINE_VALUE
 *
 * SCHEDULE: Runs every Wednesday at 9am AEST via netlify.toml
 *   [functions."scrape-lines"]
 *     schedule = "0 23 * * 1"  (UTC Monday 11pm = AEST Tuesday 9am... adjust as needed)
 */

const chromium = require('@sparticuz/chromium')
const puppeteer = require('puppeteer-core')
const { createClient } = require('@supabase/supabase-js')

// ─── CSS Selectors for Sportsbet AFL Line Market ──────────────────────────────
// UPDATE THESE if the Sportsbet page structure changes
const CSS_SELECTORS = {
  // The tab/button to switch to "Line" markets
  LINE_TAB: '[data-automation-id*="line"], button:contains("Line"), [aria-label*="Line"]',
  // Container for each match's betting row
  EVENT_ROW: '[data-automation-id="competitionEvent"], .market-coupon-row, [class*="CompetitionEvent"]',
  // Team name elements within a row
  HOME_TEAM: '[data-automation-id="homeCompetitor"] [data-automation-id="competitorName"], .home-team-name, [class*="homeCompetitor"] [class*="name"]',
  AWAY_TEAM: '[data-automation-id="awayCompetitor"] [data-automation-id="competitorName"], .away-team-name, [class*="awayCompetitor"] [class*="name"]',
  // The handicap value (e.g. "-23.5" or "+23.5")
  LINE_VALUE: '[data-automation-id="price"], .handicap-value, [class*="handicap"], [class*="price"]',
  // Alternative: look for the odds/price elements in order (home handicap, away handicap)
  PRICE_BUTTONS: '[data-automation-id="price-button"], .price-button',
}

// Sportsbet AFL URL — navigate to line markets
const SPORTSBET_AFL_URL = 'https://www.sportsbet.com.au/betting/australian-rules/afl'

exports.handler = async (event) => {
  // Parse round from body (manual trigger) or use current round logic
  let round = 5
  try {
    const body = JSON.parse(event.body || '{}')
    if (body.round !== undefined) round = body.round
  } catch {}

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  )

  let browser = null

  try {
    console.log(`[scrape-lines] Starting scrape for Round ${round}`)
    console.log(`[scrape-lines] Target URL: ${SPORTSBET_AFL_URL}`)

    // Launch headless Chrome via @sparticuz/chromium (Netlify-compatible)
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })

    const page = await browser.newPage()
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')

    // Navigate to Sportsbet AFL page
    console.log('[scrape-lines] Navigating to Sportsbet AFL page...')
    await page.goto(SPORTSBET_AFL_URL, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    })

    // Wait for initial page load
    await page.waitForTimeout(2000)

    // Try to click the "Line" tab/button if present
    // UPDATE THIS SELECTOR if Sportsbet changes their navigation
    try {
      await page.evaluate(() => {
        // Look for any button/tab containing "Line"
        const buttons = Array.from(document.querySelectorAll('button, a, [role="tab"]'))
        const lineBtn = buttons.find(b => b.textContent.trim().toLowerCase() === 'line' || b.textContent.trim().toLowerCase() === 'lines')
        if (lineBtn) lineBtn.click()
      })
      await page.waitForTimeout(2000)
    } catch (e) {
      console.log('[scrape-lines] Could not find Line tab, trying to extract from current page')
    }

    // Extract line data from the page
    // This is the main extraction logic — UPDATE if Sportsbet changes their DOM
    const scrapedGames = await page.evaluate(() => {
      const games = []

      // Strategy 1: Look for structured event rows with competitor names
      // Sportsbet typically uses data-automation-id attributes
      const eventRows = document.querySelectorAll(
        '[data-automation-id="competitionEvent"], [data-automation-id*="event-row"], [class*="EventCard"], [class*="competitionEvent"]'
      )

      for (const row of eventRows) {
        try {
          // Extract team names
          const teamEls = row.querySelectorAll(
            '[data-automation-id="competitorName"], [class*="CompetitorName"], [class*="teamName"]'
          )
          const priceEls = row.querySelectorAll(
            '[data-automation-id="price"], [class*="price"], [class*="handicap"]'
          )

          if (teamEls.length >= 2 && priceEls.length >= 2) {
            const homeTeam = teamEls[0].textContent.trim()
            const awayTeam = teamEls[1].textContent.trim()
            // The handicap for home team (e.g. "-23.5")
            const homeHandicap = priceEls[0].textContent.trim().replace(/[^\d.\-+]/g, '')
            const lineVal = parseFloat(homeHandicap)

            if (homeTeam && awayTeam && !isNaN(lineVal)) {
              games.push({ homeTeam, awayTeam, line: lineVal })
            }
          }
        } catch {}
      }

      // Strategy 2: Fallback — look for any element with AFL team names near a handicap number
      if (games.length === 0) {
        const allText = document.body.innerText
        console.log('[scrape-lines] Fallback: page text length:', allText.length)
      }

      return games
    })

    console.log(`[scrape-lines] Found ${scrapedGames.length} games`)

    if (scrapedGames.length === 0) {
      // Log page HTML for debugging
      const html = await page.content()
      console.log('[scrape-lines] Page HTML (first 500 chars):', html.substring(0, 500))
      throw new Error('No games found — Sportsbet page structure may have changed. Check CSS selectors.')
    }

    // Get fixtures for this round to match scraped teams
    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('*')
      .eq('round', round)
      .order('match_num')

    if (!fixtures?.length) {
      throw new Error(`No fixtures found for Round ${round}`)
    }

    // Match scraped games to fixtures (fuzzy team name matching)
    let savedCount = 0
    for (const game of scrapedGames) {
      // Find matching fixture
      const fix = fixtures.find(f =>
        teamMatch(f.home_team, game.homeTeam) ||
        teamMatch(f.away_team, game.homeTeam)
      )

      if (!fix) {
        console.log(`[scrape-lines] Could not match: ${game.homeTeam} vs ${game.awayTeam}`)
        continue
      }

      // Determine if we need to flip the line (if teams matched but home/away flipped)
      let line = game.line
      if (teamMatch(fix.away_team, game.homeTeam)) {
        line = -line // Flip the line
      }

      // Save as pending_approval
      await supabase.from('lines').upsert({
        round,
        match_num: fix.match_num,
        home_team: fix.home_team,
        away_team: fix.away_team,
        line,
        status: 'pending_approval',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'round,match_num' })

      savedCount++
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, count: savedCount }),
    }

  } catch (error) {
    console.error('[scrape-lines] Error:', error.message)

    // Save error to Supabase so admin can see it
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
      await supabase.from('lines').update({
        scrape_error: error.message
      }).eq('round', round)
    } catch {}

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message,
        note: 'Use manual line entry in the admin panel. To fix scraping, check CSS selectors in netlify/functions/scrape-lines.js'
      }),
    }
  } finally {
    if (browser) await browser.close()
  }
}

// Fuzzy team name matching — handles "Sydney Swans" vs "Sydney", etc.
function teamMatch(fixtureTeam, scrapedTeam) {
  const a = fixtureTeam.toLowerCase().replace(/[^a-z]/g, '')
  const b = scrapedTeam.toLowerCase().replace(/[^a-z]/g, '')
  return a.includes(b) || b.includes(a) || a === b
}
