const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('⚡ EXHAUSTIVE PRICE OVERRIDE STARTING...')
  
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

  let fixed = 0
  for (const p of allProducts) {
    const cost = Number(p.cost || 0)
    const sell = Number(p.selling || 0)
    
    // If Cost > Sell and Cost is significantly high (> 10)
    if (cost > sell && cost >= 10) {
      const scaledCost = cost / 1000
      
      // Only apply if the new cost is now lower than the selling price (the fix works)
      if (scaledCost < sell) {
        await fetch(`${url}/rest/v1/products?id=eq.${p.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': key,
            'Authorization': `Bearer ${key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ cost: scaledCost })
        })
        fixed++
      }
    }
  }

  console.log(`✅ EXHAUSTIVE FIX COMPLETE. Total products corrected: ${fixed}`)
}

run()
