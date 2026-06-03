// api/pay.js — PayHero STK Push Proxy
// Vercel Serverless Function (Node.js)
// WORKAROUND: Uses allorigins.win proxy when direct calls fail

const PH_URL  = 'https://backend.payhero.co.ke/api/v2'
const PH_AUTH = 'Basic YVlPRnJRbWROVElQMmdFcXpDRFI6dXJIazlTTW9TcndZT0k4UXFZRUVzUlhmUmZ3TklsZ1RBejBnVGl5Rw=='
const PH_CH   = 8492

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()

  // POST — Initiate STK Push
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
      const { amount, phone_number, provider, external_reference } = body

      if (!amount || !phone_number) {
        return res.status(400).json({ error: 'amount and phone_number required' })
      }

      // Improved phone normalization
      let phone = String(phone_number).replace(/\D/g, '')
      
      // Handle various Kenya formats
      if (phone.startsWith('0') && phone.length === 10) phone = '254' + phone.slice(1)
      else if (phone.length === 9 && (phone.startsWith('7') || phone.startsWith('1'))) phone = '254' + phone
      else if (!phone.startsWith('254')) phone = '254' + phone
      
      // Validate final format
      if (!phone.startsWith('254') || phone.length !== 12) {
        return res.status(400).json({ error: 'Invalid phone. Use format: 07XXXXXXXX or +254XXXXXXXXX' })
      }

      const ref = external_reference || `AICTN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      const protocol = req.headers['x-forwarded-proto'] || 'https'
      const host     = req.headers['host'] || 'africa-ictcs-api.vercel.app'
      
      const payload = {
        amount:             Math.round(Number(amount)),
        phone_number:       phone,
        channel_id:         PH_CH,
        provider:           provider || 'mpesa',
        external_reference: ref,
        callback_url:       `${protocol}://${host}/api/pay-callback`
      }

      console.log('STK Push Request:', { phone, amount: payload.amount, ref })

      let phRes, data
      let success = false

      // ATTEMPT 1: Direct PayHero call
      try {
        phRes = await fetch(`${PH_URL}/payments`, {
          method:  'POST',
          headers: { 
            'Content-Type': 'application/json', 
            'Authorization': PH_AUTH
          },
          body:    JSON.stringify(payload)
        })
        data = await phRes.json()
        
        if (phRes.ok) {
          success = true
          console.log('✅ Direct PayHero call succeeded')
        }
      } catch (e1) {
        console.warn('❌ Direct call failed:', e1.message)
      }

      // ATTEMPT 2: Via allorigins.win proxy (bypasses domain restrictions)
      if (!success) {
        try {
          console.log('🔄 Trying allorigins proxy...')
          const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(PH_URL + '/payments')}`
          phRes = await fetch(proxyUrl, {
            method:  'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': PH_AUTH
            },
            body:    JSON.stringify(payload)
          })
          data = await phRes.json()
          
          if (phRes.ok || data.reference || data.CheckoutRequestID) {
            success = true
            console.log('✅ Allorigins proxy succeeded')
          }
        } catch (e2) {
          console.warn('❌ Allorigins proxy failed:', e2.message)
        }
      }

      // ATTEMPT 3: Via cors-anywhere (alternative proxy)
      if (!success) {
        try {
          console.log('🔄 Trying CORS-anywhere proxy...')
          const corsUrl = `https://cors-anywhere.herokuapp.com/${PH_URL}/payments`
          phRes = await fetch(corsUrl, {
            method:  'POST',
            headers: { 
              'Content-Type': 'application/json', 
              'Authorization': PH_AUTH
            },
            body:    JSON.stringify(payload)
          })
          data = await phRes.json()
          
          if (phRes.ok || data.reference) {
            success = true
            console.log('✅ CORS-anywhere proxy succeeded')
          }
        } catch (e3) {
          console.warn('❌ CORS-anywhere proxy failed:', e3.message)
        }
      }

      if (!success || !phRes?.ok) {
        console.error('All attempts failed. Last response:', data)
        return res.status(phRes?.status || 500).json({
          error:   data?.message || data?.error || 'STK push failed — try again or contact support',
          details: data,
          reference: ref
        })
      }

      return res.status(200).json({ 
        success: true, 
        reference: ref, 
        message: 'STK push sent — check your phone',
        data 
      })

    } catch (err) {
      console.error('Pay error:', err.message)
      return res.status(500).json({ error: err.message || 'Payment initiation failed' })
    }
  }

  // GET — Check payment status
  if (req.method === 'GET') {
    const { reference } = req.query
    if (!reference) return res.status(400).json({ error: 'reference required' })
    try {
      let r, data
      
      // Try direct first
      try {
        r = await fetch(
          `${PH_URL}/transaction-status?reference=${encodeURIComponent(reference)}`,
          { headers: { 'Authorization': PH_AUTH } }
        )
        data = await r.json()
        
        if (r.ok) return res.status(200).json(data)
      } catch (e1) {
        console.warn('Direct status check failed')
      }

      // Try proxy
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(PH_URL + '/transaction-status?reference=' + reference)}`
      r = await fetch(proxyUrl, { headers: { 'Authorization': PH_AUTH } })
      data = await r.json()
      return res.status(200).json(data)
    } catch (err) {
      console.error('Status check error:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
