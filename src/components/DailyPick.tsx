import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import { catalog, useStore } from '../lib/store'
import type { Reco } from '../lib/types'
import { kzt, pct } from '../lib/format'
import { AI_API_ENABLED } from '../lib/config'

interface PickData {
  intro: string
  picks: { id: string; blurb: string }[]
  source: 'llm' | 'local'
}

const byId = new Map(catalog.map((p) => [p.id, p]))

export default function DailyPick({ recos }: { recos: Reco[] }) {
  const { profile, membersOf, tr } = useStore()
  const [data, setData] = useState<PickData | null>(null)

  useEffect(() => {
    const cacheKey = `birge_pick_v2_${new Date().toDateString()}_${profile.lang}`
    try {
      const cached = localStorage.getItem(cacheKey)
      if (cached) {
        const parsed = JSON.parse(cached) as PickData
        parsed.picks = (parsed.picks ?? []).filter((x) => byId.has(x.id))
        if (parsed.intro && parsed.picks.length > 0) {
          setData(parsed)
          return
        }
      }
    } catch {
      /* битый кэш — генерируем заново */
    }

    const fallback = (): PickData => ({
      intro: profile.name
        ? tr('pick_fallback_intro').replace('{name}', profile.name)
        : tr('pick_fallback_intro').replace('{name}, ', '').replace('{name}', ''),
      picks: recos.slice(0, 3).map((r, i) => {
        const p = r.product
        const blurbs = [
          `${tr('pick_fb_save')} ${kzt(p.retailKzt - p.tiers[0].priceKzt)}`,
          `${tr('pick_fb_left')}: ${Math.max(1, p.tiers[0].min - membersOf(p))}`,
          `${tr('pick_fb_city')} ${profile.city}`,
        ]
        return { id: p.id, blurb: blurbs[i % 3] }
      }),
      source: 'local',
    })

    const candidates = recos.slice(0, 20).map((r) => ({
      id: r.product.id,
      title: r.product.title,
      category: r.product.category,
      priceKzt: r.product.tiers[0].priceKzt,
      retailKzt: r.product.retailKzt,
      members: membersOf(r.product),
      min: r.product.tiers[0].min,
    }))

    if (!AI_API_ENABLED) {
      setData(fallback())
      return
    }

    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 12000)
    fetch('/api/pick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        profile: { name: profile.name, city: profile.city, budgetKzt: profile.budgetKzt, interests: profile.interests, lang: profile.lang },
        candidates,
      }),
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        const picked: PickData = { ...json, picks: json.picks.filter((x: { id: string }) => byId.has(x.id)).slice(0, 3), source: 'llm' }
        if (picked.picks.length === 0) throw new Error('no valid picks')
        try {
          localStorage.setItem(cacheKey, JSON.stringify(picked))
        } catch { /* quota */ }
        setData(picked)
      })
      .catch(() => setData(fallback()))
      .finally(() => clearTimeout(timer))
    return () => { ctl.abort(); clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.lang])

  if (!data) return null

  return (
    <section className="px-5 mt-7 rise">
      <div className="flex items-center gap-1.5">
        <Sparkles size={15} className="text-violet" />
        <h2 className="font-bold text-[15px]">{tr(data.source === 'llm' ? 'pick_title' : 'pick_title_local')}</h2>
      </div>
      <p className="mt-1 text-[13px] leading-snug text-ink-2 line-clamp-2">{data.intro}</p>

      <div className="mt-3 bg-card border border-line rounded-3xl divide-y divide-line overflow-hidden">
        {data.picks.map(({ id, blurb }) => {
          const p = byId.get(id)!
          return (
            <Link key={id} to={`/p/${id}`} className="flex gap-3 items-center p-3 active:bg-paper transition-colors">
              <img src={p.image} alt="" className="w-12 h-12 object-contain rounded-xl bg-white shrink-0 border border-line" loading="lazy" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold line-clamp-1">{p.title}</div>
                <div className="text-[12px] text-ink-3 line-clamp-1 leading-snug mt-0.5">{blurb}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[13px] font-extrabold">{kzt(p.tiers[0].priceKzt)}</div>
                <div className="text-[11px] font-bold text-coral">−{pct(p.retailKzt, p.tiers[0].priceKzt)}%</div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
