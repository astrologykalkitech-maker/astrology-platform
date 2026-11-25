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

const GUARD_NAMES = [
  'requireSuperAdmin',
  'requireAdminAccess',
  'requireAdminPermission',
  'requireAstrologer',
  'requireAstrologerPage',
  'requireCustomer',
  'requireCustomerContext',
  'requireAuth',
  'getCurrentUser',
  'getCurrentProfile',
  'getAuthSession'
];

actionFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  if (content.includes('createAdminClient')) {
    const guardsFound = GUARD_NAMES.filter(g => content.includes(g));
    auditResults.push({
      file: path.relative(process.cwd(), file),
      hasAuthGuard: guardsFound.length > 0,
      guardsFound
    });
  }
});

const unguarded = auditResults.filter(r => !r.hasAuthGuard);
console.log('Unguarded files count:', unguarded.length);
console.log('Unguarded details:', unguarded);
