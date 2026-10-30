const fs = require('fs');
const path = require('path');

function search(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) {
      if (f !== 'node_modules' && f !== '.next' && f !== '.git') search(full);
    } else if (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js')) {
      const code = fs.readFileSync(full, 'utf8');
      if (code.includes(".from('bookings')") || code.includes('.from("bookings")')) {
        console.log('Queries from("bookings"):', full);
      }
    }
  }
}
search('app');
search('components');
search('lib');

