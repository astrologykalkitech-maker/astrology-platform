const fs = require('fs');
const path = require('path');

function getHrefs(dir) {
  let hrefs = new Set();
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.next' && file !== '.git') {
        getHrefs(full).forEach(h => hrefs.add(h));
      }
    } else if (file.endsWith('.tsx') || file.endsWith('.ts') || file.endsWith('.jsx')) {
      const content = fs.readFileSync(full, 'utf8');
      const regex = /href=["'](\/[^"']*)["']/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        hrefs.add(match[1]);
      }
      // Also look for router.push('/...') and router.replace('/...') and redirect('/...')
      const navRegex = /(?:router\.(?:push|replace)|redirect)\(["'](\/[^"']*)["']/g;
      while ((match = navRegex.exec(content)) !== null) {
        hrefs.add(match[1]);
      }
    }
  }
  return hrefs;
}

const componentHrefs = getHrefs('components');
const appHrefs = getHrefs('app');
const allHrefs = Array.from(new Set([...componentHrefs, ...appHrefs])).sort();

console.log('Total internal links and navigations found:', allHrefs.length);
allHrefs.forEach(h => console.log('NAV:', h));

