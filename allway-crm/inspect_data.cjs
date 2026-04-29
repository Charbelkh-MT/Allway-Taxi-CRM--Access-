const { createClient } = require('@supabase/supabase-client')
const fs = require('fs')
const path = require('path')

const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_ANON_KEY=(.*)/)[1].trim()

const supabase = createClient(url, key)

async function run() {
  const { data, error } = await supabase
    .from('products')
    .select('id, description, cost, selling, currency')
    .eq('active', true)
    .gt('cost', 1000)
    .limit(20)

  if (error) {
    console.error(error)
    return
  }

  console.log('Suspicious Products (Cost > 1000):')
  console.table(data)
}

run()
