const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('🚀 Finalizing database cleanup (Cost + Selling)...')
  
  // Fetch all active products
  const fetchUrl = `${url}/rest/v1/products?select=id,description,cost,selling,currency&active=eq.true&limit=2000`
  const response = await fetch(fetchUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  
  const products = await response.json()
  let fixedCount = 0

  const SCALE_USD = 900000000 // 10,000 scaling * 90,000 LBP/USD rate
  const SCALE_LEGACY = 10000  // Just the 10,000 scaling

  for (const p of products) {
    let needsUpdate = false
    const updatePayload = {}
    const desc = (p.description || '').toLowerCase()
    const isRecharge = desc.includes('alfa') || desc.includes('touch') || desc.includes('card') || desc.includes('internet') || desc.includes('whish')

    const fields = ['cost', 'selling']
    for (const field of fields) {
      const val = p[field] || 0
      
      // If it's a massive number (Billions), it's definitely LBP-Scaled
      if (val >= 100000000) {
        updatePayload[field] = val / SCALE_USD
        needsUpdate = true
      } 
      // If it's moderately high (Thousands), it's likely just legacy scaled USD
      else if (val >= 10000) {
        // Exception: genuine high-value items? 
        // But in Allway CRM context, most items > 10,000 in DB are scaled
        updatePayload[field] = val / SCALE_LEGACY
        needsUpdate = true
      }
    }

    if (needsUpdate) {
      const updateUrl = `${url}/rest/v1/products?id=eq.${p.id}`
      const res = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      })
      if (res.ok) fixedCount++
    }
  }

  console.log(`✅ Fixed ${fixedCount} additional pricing errors.`)
}

run()
