// api/pay.js — PayHero STK push + status polling proxy
// Deploy to Vercel — solves CORS and keeps credentials server-side

const PAYHERO_URL  = 'https://backend.payhero.co.ke/api/v2'
const PAYHERO_AUTH = process.env.PAYHERO_AUTH ||
  'Basic YVlPRnJRbWROVElQMmdFcXpDRFI6dXJIazlTTW9TcndZT0k4UXFZRUVzUlhmUmZ3TklsZ1RBejBnVGl5Rw=='
const PAYHERO_CHANNEL = Number(process.env.PAYHERO_CHANNEL) || 8492

export default async function handler(req, res) {
  // ── CORS headers (allow your GitHub Pages + any origin for flexibility)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── GET /api/pay?reference=XXXX  → poll transaction status
  if (req.method === 'GET') {
    const { reference } = req.query
    if (!reference) return res.status(400).json({ error: 'reference required' })
    try {
      const r = await fetch(
        `${PAYHERO_URL}/transaction-status?reference=${encodeURIComponent(reference)}`,
        { headers: { Authorization: PAYHERO_AUTH } }
      )
      const data = await r.json()
      return res.status(r.status).json(data)
    } catch (err) {
      return res.status(502).json({ error: 'PayHero unreachable', detail: err.message })
    }
  }

  // ── POST /api/pay  → initiate STK push
  if (req.method === 'POST') {
    const { amount, phone_number, provider, external_reference } = req.body || {}
    if (!amount || !phone_number || !provider || !external_reference) {
      return res.status(400).json({ error: 'Missing required fields: amount, phone_number, provider, external_reference' })
    }

    const payload = {
      amount,
      phone_number,
      channel_id: PAYHERO_CHANNEL,
      provider,
      external_reference,
      callback_url: `https://africa-ictcs-api.vercel.app/api/webhook`
    }

    try {
      const r = await fetch(`${PAYHERO_URL}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: PAYHERO_AUTH
        },
        body: JSON.stringify(payload)
      })
      const data = await r.json()
      if (!r.ok) {
        return res.status(r.status).json({ error: data?.message || data?.error || 'PayHero error', detail: data })
      }
      return res.status(200).json(data)
    } catch (err) {
      return res.status(502).json({ error: 'Cannot reach PayHero', detail: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
