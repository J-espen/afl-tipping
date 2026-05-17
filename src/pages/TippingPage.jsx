import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../App'

export default function TippingPage() {
  const user = useAuth()
  const [round, setRound] = useState(null)
  const [currentRound, setCurrentRound] = useState(null)
  const [fixtures, setFixtures] = useState([])
  const [lines, setLines] = useState([])
  const [myTips, setMyTips] = useState({})
  const [locked, setLocked] = useState(false)
  const [allTips, setAllTips] = useState([])
  const [saving, setSaving] = useState(null)
  const [loading, setLoading] = useState(true)
  const [maxRound, setMaxRound] = useState(24)

  useEffect(() => {
    async function findCurrentRound() {
      const { data: locks } = await supabase
        .from('round_locks')
        .select('round, locked')
        .order('round', { ascending: true })

      const { data: allFixtures } = await supabase
        .from('fixtures')
        .select('round')
        .order('round', { ascending: false })
        .limit(1)

      const max = allFixtures?.[0]?.round ?? 24
      setMaxRound(max)

      const { data: roundsWithFixtures } = await supabase
        .from('fixtures')
        .select('round')
      const fixtureRounds = [...new Set((roundsWithFixtures || []).map(f => f.round))].sort((a, b) => a - b)

      const lockMap = {}
      for (const l of (locks || [])) lockMap[l.round] = l.locked

      let active = fixtureRounds.find(r => !lockMap[r])

      if (active === undefined) {
        active = fixtureRounds[fixtureRounds.length - 1] ?? 0
      }

      setCurrentRound(active)
      setRound(active)
    }
    findCurrentRound()
  }, [])

  const load = useCallback(async () => {
    if (round === null) return
    setLoading(true)

    const [{ data: fix }, { data: lns }, { data: lock }] = await Promise.all([
      supabase.from('fi
