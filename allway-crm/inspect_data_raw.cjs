const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_ANON_KEY=(.*)/)[1].trim()

async function run() {
  const response = await fetch(`${url}/rest/v1/products?select=id,description,cost,selling,currency&active=eq.true&cost=gt.100000&limit=10`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  })
  const data = await response.json()
  console.log('Abnormally High Costs (Raw > 100,000):')
  console.table(data)
}

run()
