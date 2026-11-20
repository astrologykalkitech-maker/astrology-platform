const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

const objects = {
  tables: new Map(), // name -> { file, rlsEnabled, rlsForced, policies: [] }
  views: new Map(), // name -> { file, isMaterialized, securityInvoker }
  functions: new Map(), // name -> { file, secDefiner, searchPath }
  triggers: new Map() // name -> { file, table }
};

files.forEach(file => {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

  // Tables
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)/gi;
  let match;
  while ((match = tableRegex.exec(content)) !== null) {
    const t = match[1].toLowerCase();
    if (!objects.tables.has(t)) {
      objects.tables.set(t, { file, rlsEnabled: false, rlsForced: false, policies: [] });
    }
  }

  // RLS Enabled
  const rlsRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/gi;
  while ((match = rlsRegex.exec(content)) !== null) {
    const t = match[1].toLowerCase();
    if (objects.tables.has(t)) {
      objects.tables.get(t).rlsEnabled = true;
    }
  }

  // RLS Forced
  const rlsForcedRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi;
  while ((match = rlsForcedRegex.exec(content)) !== null) {
    const t = match[1].toLowerCase();
    if (objects.tables.has(t)) {
      objects.tables.get(t).rlsForced = true;
    }
  }

  // Policies: CREATE POLICY "name" ON table ...
  // Note: match policy name in quotes or bare
  const policyRegex = /CREATE\s+POLICY\s+(?:\"([^\"]+)\"|([a-zA-Z0-9_]+))\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  while ((match = policyRegex.exec(content)) !== null) {
    const pName = match[1] || match[2];
    const t = match[3].toLowerCase();
    if (objects.tables.has(t)) {
      objects.tables.get(t).policies.push({ name: pName, file });
    }
  }

  // Views & Materialized Views
  const viewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(MATERIALIZED\s+)?VIEW\s+(?:public\.)?([a-zA-Z0-9_]+)/gi;
  while ((match = viewRegex.exec(content)) !== null) {
    const isMat = !!match[1];
    const v = match[2].toLowerCase();
    const hasSecInvoker = content.includes('security_invoker = true') || content.includes('security_invoker=true');
    objects.views.set(v, { file, isMaterialized: isMat, securityInvoker: hasSecInvoker });
  }

  // Functions
  const funcRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(/gi;
  while ((match = funcRegex.exec(content)) !== null) {
    const fn = match[1].toLowerCase();
    // find slice around function to detect SECURITY DEFINER and search_path
    const idx = match.index;
    const slice = content.slice(idx, idx + 2000);
    const isSecDef = /SECURITY\s+DEFINER/i.test(slice);
    const hasSearchPath = /SET\s+search_path/i.test(slice);
    objects.functions.set(fn, { file, secDefiner: isSecDef, searchPath: hasSearchPath });
  }
});

console.log('=== Database Catalog Object Summary ===');
console.log('Total Tables Discovered:', objects.tables.size);
console.log('Total Views Discovered:', objects.views.size);
console.log('Total Functions Discovered:', objects.functions.size);

const tablesArray = Array.from(objects.tables.entries()).map(([name, data]) => ({
  name,
  file: data.file,
  rlsEnabled: data.rlsEnabled,
  rlsForced: data.rlsForced,
  policyCount: data.policies.length,
  policies: data.policies
}));

const noRls = tablesArray.filter(t => !t.rlsEnabled);
console.log('\nTables with RLS NOT enabled:', noRls.length);
noRls.forEach(t => console.log(' - ' + t.name + ' (' + t.file + ')'));

const noPolicies = tablesArray.filter(t => t.policyCount === 0);
console.log('\nTables with ZERO policies:', noPolicies.length);
noPolicies.forEach(t => console.log(' - ' + t.name + ' (' + t.file + ')'));

console.log('\nViews Discovered:');
objects.views.forEach((v, name) => {
  console.log(' - ' + name + ' (Mat: ' + v.isMaterialized + ', SecInvoker: ' + v.securityInvoker + ', File: ' + v.file + ')');
});

fs.writeFileSync(
  path.join(__dirname, '..', 'docs', 'audits', 'catalog_dump.json'),
  JSON.stringify({ tables: tablesArray, views: Array.from(objects.views.entries()), functions: Array.from(objects.functions.entries()) }, null, 2)
);
console.log('\nWrote catalog_dump.json successfully.');
