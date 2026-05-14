const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');

const locations = [
  'C:\\Users\\mjaym\\Downloads',
  'C:\\Users\\mjaym\\Desktop',
  'C:\\Users\\mjaym\\Documents',
  'C:\\Users\\mjaym',
];

let found = null;
for (const dir of locations) {
  try {
    const files = fs.readdirSync(dir);
    const match = files.find(f => /partner/i.test(f) && /\.(xls|xlsx|csv)$/i.test(f));
    if (match) { found = path.join(dir, match); break; }
  } catch {}
}

if (!found) {
  for (const dir of locations) {
    try {
      const files = fs.readdirSync(dir);
      files.filter(f => /\.(xls|xlsx)$/i.test(f)).forEach(f => {
        console.log('XLS file found:', path.join(dir, f));
      });
    } catch {}
  }
  console.log('No PartnerPak file found in common locations.');
  process.exit(0);
}

console.log('Found:', found);
const wb = XLSX.readFile(found);
console.log('Sheets:', wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];
console.log('Range:', ws['!ref']);

const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log('Row count:', json.length);
if (json.length > 0) {
  console.log('Headers:', JSON.stringify(Object.keys(json[0])));
  for (let i = 0; i < Math.min(5, json.length); i++) {
    console.log('Row ' + i + ':', JSON.stringify(json[i]));
  }
  if (json.length > 5) {
    console.log('Last row:', JSON.stringify(json[json.length - 1]));
  }
}

console.log('\n--- Raw cells (first 20 rows) ---');
const range = XLSX.utils.decode_range(ws['!ref']);
for (let r = range.s.r; r <= Math.min(range.e.r, 19); r++) {
  const cells = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r, c });
    const cell = ws[addr];
    cells.push(cell ? String(cell.v) : '');
  }
  console.log('R' + r + ': ' + JSON.stringify(cells));
}
const XLSX = require('xlsx');
const path = require('path');

// Search common locations for PartnerPak files
const fs = require('fs');
const locations = [
  'C:\\Users\\mjaym\\Downloads',
  'C:\\Users\\mjaym\\Desktop',
  'C:\\Users\\mjaym\\Documents',
  'C:\\Users\\mjaym',
];

let found = null;
for (const dir of locations) {
  try {
    const files = fs.readdirSync(dir);
    const match = files.find(f => /partner/i.test(f) && /\.(xls|xlsx|csv)$/i.test(f));
    if (match) { found = path.join(dir, match); break; }
  } catch {}
}

if (!found) {
  // Try to find ANY xls file
  for (const dir of locations) {
    try {
      const files = fs.readdirSync(dir);
      const match = files.find(f => /\.(xls|xlsx)$/i.test(f));
      if (match) { console.log('Found XLS:', path.join(dir, match)); }
    } catch {}
  }
  console.log('No PartnerPak file found. Listing .xls files...');
  process.exit(0);
}

console.log('Found:', found);
const wb = XLSX.readFile(found);
console.log('Sheets:', wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];
const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log('Row count:', json.length);
if (json.length > 0) {
  console.log('Headers:', Object.keys(json[0]));
  console.log('--- First 5 rows ---');
  json.slice(0, 5).forEach((row, i) => console.log(Row :, JSON.stringify(row)));
  console.log('--- Last row ---');
  console.log(JSON.stringify(json[json.length - 1]));
}
