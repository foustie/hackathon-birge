// Клиентская часть семантического поиска: векторы каталога грузятся один раз,
// вектор запроса приходит с /api/search, косинус по 81 SKU считается локально (<1 мс).

interface VectorFile {
  model: string
  dim: number
  items: { id: string; v: number[] }[]
}

let vectorsPromise: Promise<VectorFile | null> | null = null

function loadVectors(): Promise<VectorFile | null> {
  if (!vectorsPromise) {
    // content-type guard: SPA-rewrite отдаёт index.html с кодом 200 на отсутствующий файл
    vectorsPromise = fetch('/vectors.json')
      .then((r) => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .catch(() => null)
  }
  return vectorsPromise
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

export interface SemanticHit {
  id: string
  score: number
}

import { catalog } from './store'
import { AI_API_ENABLED } from './config'

// null = семантика недоступна (нет ключей/сети) → вызывающий падает на substring.
// Векторный режим (vectors.json + embed-ключ) приоритетен; без него — LLM-ранжирование через Claude.
export async function semanticSearch(query: string): Promise<SemanticHit[] | null> {
  if (!AI_API_ENABLED) return null
  const vectors = await loadVectors()
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), vectors ? 4000 : 8000)
  try {
    if (vectors) {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctl.signal,
        body: JSON.stringify({ query, model: vectors.model }),
      })
      if (r.ok) {
        const { v } = await r.json()
        const scored = vectors.items
          .map(({ id, v: doc }) => ({ id, score: cosine(v, doc) }))
          .sort((a, b) => b.score - a.score)
        const top = scored[0]?.score ?? 0
        return scored.filter((s) => s.score >= Math.max(0.3, top * 0.86)).slice(0, 12)
      }
    }
    // LLM-rank fallback: компактный каталог + запрос → ранжированные id
    const r = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctl.signal,
      body: JSON.stringify({
        query,
        mode: 'llm-rank',
        items: catalog.map((p) => ({ id: p.id, title: p.title, category: p.category, priceKzt: p.tiers[0].priceKzt })),
      }),
    })
    if (!r.ok) return null
    const { ids } = (await r.json()) as { ids: string[] }
    if (!Array.isArray(ids) || ids.length === 0) return []
    return ids.map((id, i) => ({ id, score: 1 - i / ids.length }))
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
