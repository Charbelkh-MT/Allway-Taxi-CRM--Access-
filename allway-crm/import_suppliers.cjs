const fs = require('fs')
const env = fs.readFileSync('.env', 'utf8')
const url = env.match(/SUPABASE_URL=(.*)/)[1].trim()
const key = env.match(/SUPABASE_SERVICE_ROLE_KEY=(.*)/)[1].trim()

const suppliers = [
  { name: 'Ahmad Koz', contact_person: '', phone: '+96176901027', address: '' },
  { name: 'Elie Cell', contact_person: '', phone: '', address: '' },
  { name: 'Habib Korban', contact_person: '', phone: '', address: '' },
  { name: 'Serge Kizil Tech', contact_person: '', phone: '', address: '' },
  { name: 'iPin Yehya', contact_person: '', phone: '', address: '' },
  { name: 'Hisham Rammouz', contact_person: '', phone: '', address: '' },
  { name: 'Jawad Matta', contact_person: 'Jawad', phone: '0', address: 'Jounieh' },
  { name: 'TOBA-GO', contact_person: 'JASON', phone: '03026070', address: 'MAZRAAT YACHOUH' },
  { name: 'HONOR', contact_person: 'ELIO', phone: '76118803', address: 'SEN EL FIL' },
  { name: 'SARKIS GROUP', contact_person: 'HASSAN', phone: '04547666', address: 'JAL DIB HIGH WAY' },
  { name: 'USED PHONES', contact_person: 'ANTOINE AZIZ', phone: '76867044', address: 'BSALIM' },
  { name: 'TELIA', contact_person: 'THERESE', phone: '03516192', address: 'ZALKA HIGH WAY' },
  { name: 'SHEIN', contact_person: 'tamer saad', phone: '9613569506', address: 'bsalim' },
  { name: 'Akiki S.A.R.L', contact_person: 'MOHAMAD', phone: '09938670', address: 'NAHER IBRAHIM' },
  { name: 'Dany', contact_person: 'DANY', phone: '76564663', address: '*' },
  { name: 'wassif', contact_person: 'wassif', phone: '96181728918', address: 'beirut' },
  { name: 'Private tech', contact_person: 'private tech', phone: '03988231', address: 'dekweneh slav' },
  { name: 'MOURADI', contact_person: 'LYNN SAADEH', phone: '+961 79 131 379', address: 'ZALKA' },
  { name: 'vissam phone wholesale', contact_person: 'wissam', phone: '96170876500', address: 'dawhet aramoun' },
  { name: 'william khoureh', contact_person: 'william', phone: '78859955', address: 'sen el fil' },
  { name: 'SID INTERNATIONAL SAI', contact_person: 'william', phone: '96178859955', address: 'NEW RAWDA APOTRE' },
  { name: 'MI CARE', contact_person: 'NAWAL SHOUMAN', phone: '9613495449', address: 'SEN EL FIL' },
  { name: 'Mohamad leil', contact_person: 'mohamad', phone: '96171465433', address: 'beirut' },
  { name: 'elie', contact_person: 'elie', phone: '9613142188', address: 'bsalim' },
  { name: 'Karrout Toys', contact_person: 'Karrout Toys', phone: '0', address: 'Salim Slem Highway' },
  { name: 'Mercado', contact_person: 'Bilal', phone: '76764858', address: 'salim slam' },
  { name: 'toters', contact_person: 'N/A', phone: 'N/A', address: 'N/A' },
  { name: 'Hoco Biakout', contact_person: 'Hoco Biakout', phone: '0', address: 'Biakout' },
  { name: 'Samir Wholesale', contact_person: 'Samir', phone: '0', address: '0' },
  { name: 'Whish', contact_person: 'HALIM AJ', phone: '9611788999', address: 'JAL EL DEEB' },
  { name: 'Ricky cell', contact_person: 'ricky', phone: '+96171033546', address: 'zalka main road' },
  { name: 'Igo Tech', contact_person: 'salesman', phone: '96170875359', address: 'dbayeh' },
  { name: 'Ayoub Computers', contact_person: 'sales department', phone: '961712222667', address: 'zalka' },
  { name: 'Deo Group', contact_person: 'Rawad Keyrouz', phone: '96170144284', address: 'bsalim' }
]

async function run() {
  console.log(`🚀 Importing ${suppliers.length} suppliers...`)
  
  const response = await fetch(`${url}/rest/v1/suppliers`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(suppliers)
  })

  if (response.ok) {
    console.log('✅ Successfully imported all suppliers.')
  } else {
    console.error('❌ Failed to import suppliers:', await response.text())
  }
}

run()
