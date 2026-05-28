// api/webhook.js — PayHero payment callback
// PayHero POSTs here when a payment completes, fails or times out

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const payload = req.body
    console.log('[PayHero Webhook]', JSON.stringify(payload))

    // PayHero sends: { reference, status, amount, phone, ResultCode, ResultDesc }
    const reference  = payload?.reference || payload?.external_reference || ''
    const resultCode = String(payload?.ResultCode ?? payload?.result_code ?? '')
    const status     = (payload?.status || '').toLowerCase()

    const isSuccess = resultCode === '0' || status === 'success' || status === 'completed'
    const isFailed  = resultCode !== '' && resultCode !== '0' ||
                      status === 'failed' || status === 'cancelled'

    if (reference) {
      // Update Supabase via REST (server-side with service key if available)
      const SUPABASE_URL = process.env.SUPABASE_URL || 'https://oqkbcnnjudfhlizrqjeu.supabase.co'
      const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY // set in Vercel env vars

      if (SUPABASE_SERVICE_KEY) {
        const newStatus = isSuccess ? 'completed' : isFailed ? 'failed' : 'pending'
        const updateBody = { status: newStatus }
        if (isSuccess) updateBody.completed_at = new Date().toISOString()

        await fetch(`${SUPABASE_URL}/rest/v1/payments?reference=eq.${encodeURIComponent(reference)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            Prefer: 'return=minimal'
          },
          body: JSON.stringify(updateBody)
        })

        // If success — upsert enrollment (requires course_id stored in payments row)
        if (isSuccess) {
          // Fetch the payment record to get user_id + course_id
          const pr = await fetch(
            `${SUPABASE_URL}/rest/v1/payments?reference=eq.${encodeURIComponent(reference)}&select=user_id,course_id`,
            {
              headers: {
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`
              }
            }
          )
          const payments = await pr.json()
          const p = payments?.[0]
          if (p?.user_id && p?.course_id) {
            await fetch(`${SUPABASE_URL}/rest/v1/enrollments`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
                Prefer: 'resolution=merge-duplicates,return=minimal'
              },
              body: JSON.stringify({
                user_id: p.user_id,
                course_id: p.course_id,
                status: 'active',
                progress_percent: 0,
                enrolled_at: new Date().toISOString()
              })
            })
          }
        }
      }
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('[Webhook error]', err)
    return res.status(200).json({ received: true }) // always 200 to PayHero
  }
}
