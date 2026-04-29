const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  console.log('🔍 Auditing ALL products for pricing anomalies...')
  
  const fetchUrl = `${url}/rest/v1/products?select=id,description,cost,selling,currency&active=eq.true&limit=2000`
  const response = await fetch(fetchUrl, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  })
  
  const products = await response.json()
  
  const costErrors = products.filter(p => p.cost > 5000)
  const sellErrors = products.filter(p => p.selling > 5000)
  const mismatches = products.filter(p => p.cost > p.selling)

  console.log('--- AUDIT REPORT ---')
  console.log(`Total Products: ${products.length}`)
  console.log(`High Cost (>5000): ${costErrors.length}`)
  console.log(`High Selling (>5000): ${sellErrors.length}`)
  console.log(`Inverted (Cost > Selling): ${mismatches.length}`)

  if (sellErrors.length > 0) {
    console.log('\nTop High-Selling Anomalies:')
    console.table(sellErrors.slice(0, 10).map(p => ({
      id: p.id,
      desc: p.description,
      cost: p.cost,
      selling: p.selling,
      cur: p.currency
    })))
  }
}

run()
