const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('🚀 GLOBAL REPAIR STARTING...')
  
  // Fetch ALL products (no limit)
  const fetchUrl = `${url}/rest/v1/products?select=id,description,cost,selling,currency&active=eq.true`
  const response = await fetch(fetchUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  
  const products = await response.json()
  console.log(`Auditing ${products.length} products...`)
  
  let fixed = 0
  const SCALE_USD = 900000000 
  const SCALE_LEGACY = 10000

  for (const p of products) {
    let updateNeeded = false
    const payload = {}

    const fields = ['cost', 'selling']
    for (const f of fields) {
      const val = Number(p[f] || 0)
      if (val >= 100000000) {
        payload[f] = val / SCALE_USD
        updateNeeded = true
      } else if (val >= 10000) {
        payload[f] = val / SCALE_LEGACY
        updateNeeded = true
      }
    }

    if (updateNeeded) {
      const res = await fetch(`${url}/rest/v1/products?id=eq.${p.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      if (res.ok) fixed++
    }
  }

  console.log(`✅ Repair complete. Total fixed: ${fixed}`)
}

run()
