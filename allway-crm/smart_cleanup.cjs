const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('🤖 Starting INTELLIGENT database cleanup...')
  
  const fetchUrl = `${url}/rest/v1/products?select=id,description,cost,selling,currency&active=eq.true&limit=2000`
  const response = await fetch(fetchUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  
  const products = await response.json()
  let fixedCount = 0

  const USD_RATE = 90000
  const SCALE = 10000
  const DIVIDER_LBP = SCALE * USD_RATE // 900,000,000
  const DIVIDER_USD = SCALE // 10,000

  for (const p of products) {
    let needsUpdate = false
    const updatePayload = {}
    const desc = (p.description || '').toLowerCase()
    
    // Check Selling & Cost
    const fields = ['cost', 'selling']
    for (const field of fields) {
      const val = p[field] || 0
      if (val >= 10000) {
        const normalized = val / SCALE
        
        // HEURISTIC: If it's a card/recharge and price is > 500, it's LBP scaled
        const isRecharge = desc.includes('card') || desc.includes('alfa') || desc.includes('touch') || desc.includes('internet') || desc.includes('whish') || desc.includes('dollars')
        
        if (isRecharge && normalized > 500) {
          updatePayload[field] = val / DIVIDER_LBP
          needsUpdate = true
        } else if (normalized >= 5000) {
           // Extreme outliers even for non-recharges are likely LBP
           updatePayload[field] = val / DIVIDER_LBP
           needsUpdate = true
        } else {
          // Standard scaling fix
          updatePayload[field] = val / DIVIDER_USD
          needsUpdate = true
        }
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

      if (res.ok) {
        fixedCount++
        if (fixedCount % 50 === 0) console.log(`Fixed ${fixedCount} products...`)
      }
    }
  }

  console.log(`✅ Intelligent cleanup finished. Fixed ${fixedCount} products.`)
}

run()
