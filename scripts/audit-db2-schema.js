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
const db2TableRefs = new Set();
const db2RpcRefs = new Set();

files.forEach(f => {
  const content = fs.readFileSync(f, 'utf-8');
  if (content.includes('createAdminClient("admin")') || content.includes('createAdminClient()')) {
    const tableRegex = /\.from\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/g;
    let m;
    while ((m = tableRegex.exec(content)) !== null) {
      db2TableRefs.add(m[1]);
    }
    const rpcRegex = /\.rpc\(\s*['"]([a-zA-Z0-9_]+)['"]/g;
    while ((m = rpcRegex.exec(content)) !== null) {
      db2RpcRefs.add(m[1]);
    }
  }
});

console.log('Tables accessed by admin target:', Array.from(db2TableRefs).sort());
console.log('RPCs accessed by admin target:', Array.from(db2RpcRefs).sort());
