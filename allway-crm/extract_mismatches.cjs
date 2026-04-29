const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('📄 Extracting products with Cost > Selling...')
  
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

  const mismatches = allProducts.filter(p => Number(p.cost) > Number(p.selling))
  
  console.log(`Found ${mismatches.length} mismatches out of ${allProducts.length} products.`)
  
  if (mismatches.length > 0) {
    console.table(mismatches.map(p => ({
      ID: p.id,
      Description: p.description,
      Cost: p.cost,
      Sell: p.selling,
      Diff: (p.cost - p.selling).toFixed(2)
    })))
  }
}

run()
