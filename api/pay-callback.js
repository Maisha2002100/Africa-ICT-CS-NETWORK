// api/pay-callback.js — PayHero Webhook Handler

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    console.log('PayHero callback:', JSON.stringify(body))

    const reference = body.external_reference || body.reference || ''
    const status    = String(body.status || body.Status || '').toLowerCase()
    const success   = status === 'completed' || status === 'success' ||
                      String(body.ResultCode) === '0'

    const sbUrl = process.env.SUPABASE_URL
    const sbKey = process.env.SUPABASE_SERVICE_KEY
    if (reference && sbUrl && sbKey) {
      await fetch(`${sbUrl}/rest/v1/payments?reference=eq.${encodeURIComponent(reference)}`, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          'apikey':        sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Prefer':        'return=minimal'
        },
        body: JSON.stringify({
          status:       success ? 'completed' : 'failed',
          completed_at: success ? new Date().toISOString() : null
        })
      })
    }
    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Callback error:', err.message)
    return res.status(200).json({ received: true })
  }
}
