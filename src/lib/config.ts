// Внешние сервисы включаются только через env на этапе сборки.
// Без них демо работает полностью локально: группы в localStorage, подборка и поиск — детерминированные фолбэки.
//   VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY — realtime-синхронизация групп между устройствами
//   VITE_AI_API=1 — вызывать /api/pick и /api/search (нужен хостинг serverless-функций с ключами)
const env = import.meta.env

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON: string = env.VITE_SUPABASE_ANON_KEY ?? ''
export const REALTIME_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON)
export const AI_API_ENABLED = env.VITE_AI_API === '1'
