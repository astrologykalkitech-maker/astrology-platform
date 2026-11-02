const fs = require('fs');
const path = require('path');

function walk(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file === 'node_modules' || file === '.next' || file === '.git') continue;
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walk(filePath, fileList);
    } else {
      fileList.push(filePath.replace(/\\/g, '/'));
    }
  }
  return fileList;
}

const allFiles = walk('.');

// 1. App routes
const routes = allFiles.filter(f => f.startsWith('app/') && (f.endsWith('page.tsx') || f.endsWith('route.ts')));
const serverActions = allFiles.filter(f => f.startsWith('app/actions/') && f.endsWith('.ts'));
const components = allFiles.filter(f => f.startsWith('components/') && (f.endsWith('.tsx') || f.endsWith('.ts')));
const libs = allFiles.filter(f => f.startsWith('lib/') && f.endsWith('.ts'));
const migrations = allFiles.filter(f => (f.includes('migration') || f.endsWith('.sql')));
const tests = allFiles.filter(f => f.startsWith('tests/') && f.endsWith('.ts'));

console.log('--- PROJECT INVENTORY SUMMARY ---');
console.log('Total tracked files:', allFiles.length);
console.log('Total App Routes (Pages & APIs):', routes.length);
console.log('Total Server Actions files:', serverActions.length);
console.log('Total Components:', components.length);
console.log('Total Lib Modules:', libs.length);
console.log('Total Migrations / SQL:', migrations.length);
console.log('Total Tests:', tests.length);

console.log('\n--- ROUTES BREAKDOWN ---');
const customerRoutes = routes.filter(r => r.includes('customer') || r.includes('consultation'));
const astrologerRoutes = routes.filter(r => r.includes('astrologer'));
const superAdminRoutes = routes.filter(r => r.includes('super-admin') || r.includes('admin'));
const publicRoutes = routes.filter(r => !r.includes('customer') && !r.includes('astrologer') && !r.includes('admin') && !r.startsWith('app/api'));
const apiRoutes = routes.filter(r => r.startsWith('app/api'));

console.log('Customer routes:', customerRoutes.length);
console.log('Astrologer routes:', astrologerRoutes.length);
console.log('Admin routes:', superAdminRoutes.length);
console.log('Public / Root routes:', publicRoutes.length);
console.log('API routes:', apiRoutes.length);

fs.writeFileSync('scratch/inventory.json', JSON.stringify({
  routes,
  serverActions,
  components,
  libs,
  migrations,
  tests
}, null, 2));

console.log('Wrote scratch/inventory.json');

