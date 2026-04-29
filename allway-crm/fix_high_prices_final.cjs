const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('🔄 Correcting remaining high prices with 90,000 rate...')
  
  const fetchUrl = `${url}/rest/v1/products?select=id,description,cost,selling,currency&active=eq.true&or=(cost.gt.1000,selling.gt.5000)`
  const response = await fetch(fetchUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  
  const products = await response.json()
  console.log(`Analyzing ${products.length} suspicious items...`)
  
  let fixed = 0
  const USD_RATE = 90000

  for (const p of products) {
    let updateNeeded = false
    const payload = {}
    const desc = (p.description || '').toLowerCase()
    const isRecharge = desc.includes('alfa') || desc.includes('touch') || desc.includes('card') || desc.includes('internet') || desc.includes('whish')

    const fields = ['cost', 'selling']
    for (const f of fields) {
      const val = Number(p[f] || 0)
      
      // If it's a recharge and price > 1000, it's definitely LBP not converted
      if (isRecharge && val > 1000) {
        payload[f] = val / USD_RATE
        updateNeeded = true
      } 
      // If it's an extreme outlier (> 5000) for anything, it's likely LBP
      else if (val > 5000) {
        payload[f] = val / USD_RATE
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

  console.log(`✅ Fixed ${fixed} remaining high-price items with correct rate.`)
}

run()
