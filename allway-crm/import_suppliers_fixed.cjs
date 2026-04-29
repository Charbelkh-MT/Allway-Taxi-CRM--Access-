const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

const suppliers = [
  { name: 'Ahmad Koz', contact_person: '', mobile: '+96176901027', address: '', usd_balance: 0 },
  { name: 'Elie Cell', contact_person: '', mobile: '', address: '', usd_balance: 0 },
  { name: 'Habib Korban', contact_person: '', mobile: '', address: '', usd_balance: 0 },
  { name: 'Serge Kizil Tech', contact_person: '', mobile: '', address: '', usd_balance: 0 },
  { name: 'iPin Yehya', contact_person: '', mobile: '', address: '', usd_balance: 0 },
  { name: 'Hisham Rammouz', contact_person: '', mobile: '', address: '', usd_balance: 0 },
  { name: 'Jawad Matta', contact_person: 'Jawad', mobile: '0', address: 'Jounieh', usd_balance: 0 },
  { name: 'TOBA-GO', contact_person: 'JASON', mobile: '03026070', address: 'MAZRAAT YACHOUH', usd_balance: 0 },
  { name: 'HONOR', contact_person: 'ELIO', mobile: '76118803', address: 'SEN EL FIL', usd_balance: 0 },
  { name: 'SARKIS GROUP', contact_person: 'HASSAN', mobile: '04547666', address: 'JAL DIB HIGH WAY', usd_balance: 0 },
  { name: 'USED PHONES', contact_person: 'ANTOINE AZIZ', mobile: '76867044', address: 'BSALIM', usd_balance: 0 },
  { name: 'TELIA', contact_person: 'THERESE', mobile: '03516192', address: 'ZALKA HIGH WAY', usd_balance: 0 },
  { name: 'SHEIN', contact_person: 'tamer saad', mobile: '9613569506', address: 'bsalim', usd_balance: 0 },
  { name: 'Akiki S.A.R.L', contact_person: 'MOHAMAD', mobile: '09938670', address: 'NAHER IBRAHIM', usd_balance: 0 },
  { name: 'Dany', contact_person: 'DANY', mobile: '76564663', address: '*', usd_balance: 0 },
  { name: 'wassif', contact_person: 'wassif', mobile: '96181728918', address: 'beirut', usd_balance: 0 },
  { name: 'Private tech', contact_person: 'private tech', mobile: '03988231', address: 'dekweneh slav', usd_balance: 0 },
  { name: 'MOURADI', contact_person: 'LYNN SAADEH', mobile: '+961 79 131 379', address: 'ZALKA', usd_balance: 0 },
  { name: 'vissam phone wholesale', contact_person: 'wissam', mobile: '96170876500', address: 'dawhet aramoun', usd_balance: 0 },
  { name: 'william khoureh', contact_person: 'william', mobile: '78859955', address: 'sen el fil', usd_balance: 0 },
  { name: 'SID INTERNATIONAL SAI', contact_person: 'william', mobile: '96178859955', address: 'NEW RAWDA APOTRE', usd_balance: 0 },
  { name: 'MI CARE', contact_person: 'NAWAL SHOUMAN', mobile: '9613495449', address: 'SEN EL FIL', usd_balance: 0 },
  { name: 'Mohamad leil', contact_person: 'mohamad', mobile: '96171465433', address: 'beirut', usd_balance: 0 },
  { name: 'elie', contact_person: 'elie', mobile: '9613142188', address: 'bsalim', usd_balance: 0 },
  { name: 'Karrout Toys', contact_person: 'Karrout Toys', mobile: '0', address: 'Salim Slem Highway', usd_balance: 0 },
  { name: 'Mercado', contact_person: 'Bilal', mobile: '76764858', address: 'salim slam', usd_balance: 0 },
  { name: 'toters', contact_person: 'N/A', mobile: 'N/A', address: 'N/A', usd_balance: 0 },
  { name: 'Hoco Biakout', contact_person: 'Hoco Biakout', mobile: '0', address: 'Biakout', usd_balance: 0 },
  { name: 'Samir Wholesale', contact_person: 'Samir', mobile: '0', address: '0', usd_balance: 0 },
  { name: 'Whish', contact_person: 'HALIM AJ', mobile: '9611788999', address: 'JAL EL DEEB', usd_balance: 0 },
  { name: 'Ricky cell', contact_person: 'ricky', mobile: '+96171033546', address: 'zalka main road', usd_balance: 0 },
  { name: 'Igo Tech', contact_person: 'salesman', mobile: '96170875359', address: 'dbayeh', usd_balance: 0 },
  { name: 'Ayoub Computers', contact_person: 'sales department', mobile: '961712222667', address: 'zalka', usd_balance: 0 },
  { name: 'Deo Group', contact_person: 'Rawad Keyrouz', mobile: '96170144284', address: 'bsalim', usd_balance: 0 }
]

async function run() {
  const response = await fetch(`${url}/rest/v1/suppliers`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(suppliers)
  })

  if (response.ok) {
    console.log('✅ Successfully imported 34 suppliers.')
  } else {
    console.error('❌ Failed:', await response.text())
  }
}

run()
