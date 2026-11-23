const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory() && !full.includes('node_modules') && !full.includes('.next')) {
      results = results.concat(walk(full));
    } else if (!full.includes('node_modules') && !full.includes('.next') && full.endsWith('.ts')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk('.');
const usages = [];
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes('createAdminClient("admin")') || content.includes("createAdminClient('admin')")) {
    usages.push({ file: f, target: 'admin' });
  }
  if (content.includes('createAdminClient("main")') || content.includes("createAdminClient('main')")) {
    usages.push({ file: f, target: 'main' });
  }
});

console.log(JSON.stringify(usages, null, 2));
