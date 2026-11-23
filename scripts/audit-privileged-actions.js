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

const actionFiles = walk('app/actions');
const auditResults = [];

actionFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  if (content.includes('createAdminClient')) {
    const hasAuthGuard = 
      content.includes('requireSuperAdmin') ||
      content.includes('requireAdminAccess') ||
      content.includes('requireAdminPermission') ||
      content.includes('requireAstrologer') ||
      content.includes('requireAuth') ||
      content.includes('getCurrentUser') ||
      content.includes('getCurrentProfile') ||
      content.includes('getAuthSession');

    auditResults.push({
      file: path.relative(process.cwd(), file),
      hasAuthGuard,
    });
  }
});

console.log('Total action files using createAdminClient:', auditResults.length);
const unguarded = auditResults.filter(r => !r.hasAuthGuard);
console.log('Unguarded files:', unguarded);
if (unguarded.length === 0) {
  console.log('ALL action files using createAdminClient contain explicit session or admin auth guards.');
}
