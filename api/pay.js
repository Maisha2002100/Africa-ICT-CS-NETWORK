// api/pay.js — PayHero STK Push Proxy
const PH_URL  = 'https://backend.payhero.co.ke/api/v2'
const PH_AUTH = 'Basic YVlPRnJRbWROVElQMmdFcXpDRFI6dXJIazlTTW9TcndZT0k4UXFZRUVzUlhmUmZ3TklsZ1RBejBnVGl5Rw=='
const PH_CH   = 9054

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()

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

      const ref = external_reference || ('AICTN-' + Date.now())
      const protocol = req.headers['x-forwarded-proto'] || 'https'
      const host     = req.headers['host'] || 'africa-ict-cs-network.vercel.app'

      const payload = {
        amount:             Number(amount),
        phone_number:       phone,
        channel_id:         PH_CH,
        provider:           provider || 'mpesa',
        external_reference: ref,
        callback_url:       `${protocol}://${host}/api/pay-callback`
      }

      console.log('Sending to PayHero:', JSON.stringify(payload))

      const phRes = await fetch(`${PH_URL}/payments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': PH_AUTH },
        body:    JSON.stringify(payload)
      })

      const data = await phRes.json()
      console.log('PayHero response:', phRes.status, JSON.stringify(data))

      if (!phRes.ok) {
        return res.status(phRes.status).json({
          error:   data.message || data.error || data.error_message || ('PayHero error ' + phRes.status),
          details: data
        })
      }

      return res.status(200).json({ success: true, reference: ref, data })

    } catch (err) {
      console.error('Pay error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
