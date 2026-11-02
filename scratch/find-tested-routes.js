const fs = require('fs');
const files = fs.readdirSync('tests');
const routes = new Set();
for (const f of files) {
  if (f.endsWith('.ts')) {
    const code = fs.readFileSync('tests/' + f, 'utf8');
    const regex = /["'](\/[a-zA-Z0-9_\-\/\[\]]+)["']/g;
    let m;
    while ((m = regex.exec(code)) !== null) {
      if (m[1].startsWith('/customer') || m[1].startsWith('/astrologer') || m[1].startsWith('/super-admin') || m[1].startsWith('/admin') || m[1].startsWith('/api/') || m[1].startsWith('/consultation')) {
        routes.add(m[1]);
      }
    }
  }
}
const sorted = Array.from(routes).sort();
console.log('Total tested routes found:', sorted.length);
sorted.forEach(r => console.log('ROUTE:', r));

