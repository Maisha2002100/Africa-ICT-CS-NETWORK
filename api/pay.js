// api/pay.js — PayHero STK Push Proxy
const PH_URL  = 'https://backend.payhero.co.ke/api/v2'
const PH_AUTH = 'Basic YVlPRnJRbWROVElQMmdFcXpDRFI6dXJIazlTTW9TcndZT0k4UXFZRUVzUlhmUmZ3TklsZ1RBejBnVGl5Rw=='

// Try channels in order — 9054 worked before for STK push
const CHANNELS = [9054, 9053, 8492]

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — check payment status
  if (req.method === 'GET') {
    const { reference } = req.query
    if (!reference) return res.status(400).json({ error: 'reference required' })
    try {
      const r = await fetch(
        `${PH_URL}/transaction-status?reference=${encodeURIComponent(reference)}`,
        { headers: { 'Authorization': PH_AUTH } }
      )
      const data = await r.json()
      return res.status(200).json(data)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // POST — initiate STK push
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const { amount, phone_number, provider, external_reference } = body

      if (!amount || !phone_number) {
        return res.status(400).json({ error: 'amount and phone_number required' })
      }

      let phone = String(phone_number).replace(/\D/g, '')
      if (phone.startsWith('0') && phone.length === 10) phone = '254' + phone.slice(1)
      if (phone.startsWith('7') && phone.length === 9)  phone = '254' + phone
      if (phone.startsWith('1') && phone.length === 9)  phone = '254' + phone
      if (!phone.startsWith('254') || phone.length !== 12) {
        return res.status(400).json({ error: 'Invalid phone. Use 07XXXXXXXX' })
      }

      const ref = external_reference || `AICTN-${Date.now()}`
      const protocol = req.headers['x-forwarded-proto'] || 'https'
      const host     = req.headers['host'] || 'africa-ict-cs-network.vercel.app'
      const errors   = []

      // Try each channel until one works
      for (const channelId of CHANNELS) {
        const payload = {
          amount:             Number(amount),
          phone_number:       phone,
          channel_id:         channelId,
          provider:           provider || 'mpesa',
          external_reference: ref,
          callback_url:       `${protocol}://${host}/api/pay-callback`
        }
        console.log(`Trying channel ${channelId}:`, JSON.stringify(payload))

        const phRes = await fetch(`${PH_URL}/payments`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': PH_AUTH },
          body:    JSON.stringify(payload)
        })
        const data = await phRes.json()
        console.log(`Channel ${channelId} response:`, phRes.status, JSON.stringify(data))

        if (phRes.ok && !data.error && !data.error_code) {
          console.log(`✅ SUCCESS with channel ${channelId}`)
          return res.status(200).json({ success: true, reference: ref, channel_used: channelId, data })
        }

        const msg = (data.message || data.error || data.error_message || '').toLowerCase()
        if (msg.includes('not a payments channel') || msg.includes('invalid channel')) {
          errors.push(`ch${channelId}: ${msg}`)
          continue // try next channel
        }

        // Any other error — return it with full details so we can see it
        return res.status(phRes.status).json({
          error:   data.message || data.error || data.error_message || `PayHero ${phRes.status}`,
          details: data,
          channel: channelId
        })
      }

      // All channels failed
      return res.status(400).json({ error: 'No working channel found', tried: CHANNELS, errors })

    } catch (err) {
      console.error('Pay error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
