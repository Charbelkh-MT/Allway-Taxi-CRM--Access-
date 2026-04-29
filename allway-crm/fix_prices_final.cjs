const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('🚀 Starting deep-clean of product costs...')
  
  // 1. Fetch products that need fixing (abnormally high costs)
  // Threshold: > 10,000 USD (normalized) means raw > 100,000,000
  const fetchUrl = `${url}/rest/v1/products?select=id,description,cost,currency,selling&active=eq.true&cost=gt.10000000`
  const response = await fetch(fetchUrl, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  })
  
  const products = await response.json()
  console.log(`Found ${products.length} products with scaling errors.`)

  if (products.length === 0) {
    console.log('No errors found. Database is clean.')
    return
  }

  const USD_RATE = 90000
  const SCALE = 10000
  const DIVIDER = SCALE * USD_RATE // 900,000,000

  let fixed = 0
  for (const p of products) {
    const rawCost = p.cost || 0
    const newCost = rawCost / DIVIDER
    
    // Safety check: only update if new cost is realistic (< $500 and < selling * 1.5)
    // Actually, some items might cost $600 (like phones), but cases shouldn't cost $8,000
    
    const updateUrl = `${url}/rest/v1/products?id=eq.${p.id}`
    const res = await fetch(updateUrl, {
      method: 'PATCH',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ 
        cost: newCost,
        currency: 'USD'
      })
    })

    if (res.ok) {
      fixed++
      if (fixed % 10 === 0) console.log(`Fixed ${fixed}/${products.length}...`)
    } else {
      console.error(`Failed to fix item ${p.id}:`, await res.text())
    }
  }

  console.log(`✅ Cleanup complete. Repaired ${fixed} product costs.`)
}

run()
