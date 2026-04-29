const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  const fetchUrl = `${url}/rest/v1/products?select=id,description,cost,selling,currency&description=ilike.*Alfa*&limit=20`
  const response = await fetch(fetchUrl, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  
  const products = await response.json()
  console.log('Results:')
  console.table(products)
}

run()
