const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('🛡️ Starting BULLETPROOF database cleanup...')
  
  let allProducts = []
  let page = 0
  const PAGE_SIZE = 1000

  while (true) {
    const fetchUrl = `${url}/rest/v1/products?select=id,description,cost,selling,currency&active=eq.true&offset=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`
    const response = await fetch(fetchUrl, {
      headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
    })
    const data = await response.json()
    if (!data || data.length === 0) break
    allProducts = allProducts.concat(data)
    if (data.length < PAGE_SIZE) break
    page++
  }

  console.log(`Auditing ${allProducts.length} products total...`)
  
  let fixed = 0
  const USD_RATE = 90000
  const SCALE = 10000

  for (const p of allProducts) {
    let updateNeeded = false
    const payload = {}
    const cur = p.currency || 'USD'
    const desc = (p.description || '').toLowerCase()
    const isRecharge = desc.includes('alfa') || desc.includes('touch') || desc.includes('card') || desc.includes('internet')

    const fields = ['cost', 'selling']
    for (const f of fields) {
      const val = Number(p[f] || 0)
      
      // CASE 1: USD Scaling (Access Threshold 10,000)
      if (cur === 'USD') {
        if (val >= 100000000) {
          // Definitely an LBP value scaled by 10k trapped in USD column
          payload[f] = val / (SCALE * USD_RATE)
          updateNeeded = true
        } else if (val >= 10000) {
          // Standard USD scaling
          payload[f] = val / SCALE
          updateNeeded = true
        } else if (isRecharge && val > 500) {
          // Unscaled LBP value trapped in USD column (e.g. 400,000)
          payload[f] = val / USD_RATE
          updateNeeded = true
        }
      } 
      // CASE 2: LBP Scaling (Access Threshold 100,000,000)
      else if (cur === 'LBP') {
        if (val >= 100000000) {
          payload[f] = val / SCALE
          updateNeeded = true
        }
        // NOTE: LBP values between 10,000 and 100,000,000 are LEFT ALONE (e.g. 50,000 LBP)
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

  console.log(`✅ BULLETPROOF Repair complete. Total fixed: ${fixed}`)
}

run()
