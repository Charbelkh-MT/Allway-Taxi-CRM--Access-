const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

async function run() {
  const response = await fetch(`${url}/rest/v1/suppliers?select=id,name`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  const data = await response.json()
  console.log('Current Suppliers:', data)
}

run()
