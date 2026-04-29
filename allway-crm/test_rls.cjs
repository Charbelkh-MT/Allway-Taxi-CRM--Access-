const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1].trim()

async function run() {
  console.log('Testing browser-level access to suppliers...')
  const response = await fetch(`${url}/rest/v1/suppliers?select=id`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  })
  if (response.ok) {
    const data = await response.json()
    console.log(`Success! Browser can see ${data.length} suppliers.`)
  } else {
    console.log('FAILED! Browser access is blocked by RLS policies.')
    console.log('Status:', response.status)
    console.log('Error:', await response.text())
  }
}

run()
