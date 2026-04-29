const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('🛠️ Final Direct Repair of Price Mismatches...')
  
  const fetchUrl = `${url}/rest/v1/products?select=id,description,cost,selling,currency&active=eq.true`
  const response = await fetch(fetchUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  
  const products = await response.json()
  let fixed = 0

  for (const p of products) {
    const cost = Number(p.cost || 0)
    const sell = Number(p.selling || 0)
    const desc = (p.description || '').toLowerCase()
    
    // Pattern: Accessories with high cost (> 100) and low sell (< 50)
    const isAccessory = desc.includes('case') || desc.includes('glue') || desc.includes('shield') || 
                       desc.includes('pen') || desc.includes('cable') || desc.includes('earphone') || 
                       desc.includes('bag') || desc.includes('squirrel') || desc.includes('duck')

    if (cost > sell && isAccessory && cost >= 100) {
      const newCost = cost / 1000
      const updateUrl = `${url}/rest/v1/products?id=eq.${p.id}`
      await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cost: newCost })
      })
      fixed++
    }
  }

  console.log(`✅ Fixed ${fixed} mismatched accessory costs.`)
}

run()
