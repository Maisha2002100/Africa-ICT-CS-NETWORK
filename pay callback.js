// api/pay-callback.js — PayHero Webhook Handler
// FIXED: Proper enrollment creation and payment status tracking

const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    console.log('PayHero callback received:', JSON.stringify(body))

    const reference = body.external_reference || body.reference || ''
    const status    = String(body.status || body.Status || '').toLowerCase()
    const phone     = body.phone_number || body.PhoneNumber || ''
    const amount    = body.amount || body.Amount || 0
    
    const success   = status === 'completed' || status === 'success' || 
                      status === '0' || 
                      String(body.ResultCode) === '0'

    console.log('Payment callback parsed:', { reference, status, success, phone, amount })

    // FIXED: Initialize Supabase for enrollment creation
    const sbUrl = process.env.SUPABASE_URL || 'https://oqkbcnnjudfhlizrqjeu.supabase.co'
    const sbKey = process.env.SUPABASE_SERVICE_KEY
    
    if (reference && sbUrl) {
      try {
        // Update payment record
        if (sbKey) {
          const updateRes = await fetch(
            `${sbUrl}/rest/v1/payments?reference=eq.${encodeURIComponent(reference)}`,
            {
              method:  'PATCH',
              headers: {
                'Content-Type':  'application/json',
                'apikey':        sbKey,
                'Authorization': `Bearer ${sbKey}`,
                'Prefer':        'return=minimal'
              },
              body: JSON.stringify({
                status:       success ? 'completed' : 'failed',
                phone:        phone,
                amount:       amount,
                completed_at: success ? new Date().toISOString() : null
              })
            }
          )
          console.log('Payment update response:', updateRes.status)
        }
        
        // FIXED: If payment succeeded, query and create enrollment
        if (success && sbKey) {
          try {
            // Get the payment record to extract user_id and course_id
            const paymentRes = await fetch(
              `${sbUrl}/rest/v1/payments?reference=eq.${encodeURIComponent(reference)}&select=user_id,course_id`,
              {
                method:  'GET',
                headers: {
                  'apikey':        sbKey,
                  'Authorization': `Bearer ${sbKey}`
                }
              }
            )
            
            const payments = await paymentRes.json()
            console.log('Payment records found:', payments)
            
            if (payments && payments.length > 0) {
              const payment = payments[0]
              const userId = payment.user_id
              const courseId = payment.course_id
              
              if (userId && courseId) {
                // Create enrollment
                const enrollRes = await fetch(
                  `${sbUrl}/rest/v1/enrollments`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type':  'application/json',
                      'apikey':        sbKey,
                      'Authorization': `Bearer ${sbKey}`,
                      'Prefer':        'return=minimal'
                    },
                    body: JSON.stringify({
                      user_id:           userId,
                      course_id:         courseId,
                      status:            'active',
                      progress_percent:  0,
                      enrolled_at:       new Date().toISOString()
                    })
                  }
                )
                console.log('Enrollment creation response:', enrollRes.status)
              }
            }
          } catch (e) {
            console.error('Enrollment creation error:', e.message)
          }
        }
      } catch (err) {
        console.error('Supabase update error:', err.message)
      }
    }
    
    return res.status(200).json({ received: true, processed: success })
  } catch (err) {
    console.error('Callback error:', err.message, err.stack)
    return res.status(200).json({ received: true, error: err.message })
  }
}
