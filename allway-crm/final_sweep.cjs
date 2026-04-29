const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('🔍 FINAL DEEP AUDIT IN PROGRESS...')
  
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

  let anomalies = 0
  for (const p of allProducts) {
    const cost = Number(p.cost || 0)
    const sell = Number(p.selling || 0)
    const cur = p.currency || 'USD'

    let fixNeeded = false
    const payload = {}

    // Rule: Anything still > 5000 in USD or > 500M in LBP is definitely an error
    if (cur === 'USD') {
      if (cost >= 5000) { payload.cost = cost / 10000; fixNeeded = true; }
      if (sell >= 5000) { payload.selling = sell / 10000; fixNeeded = true; }
    } else if (cur === 'LBP') {
      if (cost >= 100000000) { payload.cost = cost / 10000; fixNeeded = true; }
      if (sell >= 100000000) { payload.selling = sell / 10000; fixNeeded = true; }
    }

    if (fixNeeded) {
      await fetch(`${url}/rest/v1/products?id=eq.${p.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })
      anomalies++
    }
  }

  console.log(`✨ FINAL AUDIT COMPLETE. Found and fixed ${anomalies} lingering anomalies.`)
}

run()
