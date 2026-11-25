const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    const p = path.join(dir, file);
    if (fs.statSync(p).isDirectory()) {
      if (!['node_modules', '.next', '.git'].includes(file)) results = results.concat(walk(p));
    } else if (p.endsWith('.ts') || p.endsWith('.tsx')) {
      results.push(p);
    }
  });
  return results;
}

const files = walk('app').concat(walk('lib'));
const tableRefs = new Set();
const rpcRefs = new Set();

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf-8');
  const fromRegex = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
  let m;
  while ((m = fromRegex.exec(content)) !== null) {
    tableRefs.add(m[1]);
  }
  const rpcRegex = /\.rpc\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
  while ((m = rpcRegex.exec(content)) !== null) {
    rpcRefs.add(m[1]);
  }
});

console.log('App referenced tables count:', tableRefs.size);
console.log('Tables:', Array.from(tableRefs).sort());
console.log('App referenced RPCs count:', rpcRefs.size);
console.log('RPCs:', Array.from(rpcRefs).sort());
