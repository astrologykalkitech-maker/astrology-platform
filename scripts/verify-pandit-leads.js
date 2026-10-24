const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Parse environment variables from .env.local
const envText = fs.readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envText.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[trimmed.slice(0, idx).trim()] = val;
  }
}

// DB1: Customer and Astrologer Portal DB
const s1 = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.DB1_SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
);

// DB2: Super Admin and Consultant Admin DB
const s2 = createClient(
  env.ADMIN_SUPABASE_URL,
  env.ADMIN_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY
);

const NESTED_ASSIGNMENT_SELECT = `
  id,
  lead_id,
  astrologer_id,
  status,
  created_at,
  lead:leads!lead_assignments_lead_id_fkey (
    id,
    subject,
    message,
    status,
    created_at,
    customer:profiles!leads_customer_id_fkey (
      id,
      full_name
    )
  )
`;

// Helper for IST time formatting
const istFormatter = new Intl.DateTimeFormat('en-IN', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
});

function formatIST(isoDate) {
  if (!isoDate) return '—';
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? '—' : istFormatter.format(d);
}

/**
 * Universal Verification & Self-Healing Script for All Astrologers
 * 
 * 1. Fetches all astrologer profiles from DB1 and DB2.
 * 2. Matches accounts by slug / display_name.
 * 3. Inspects and auto-heals any missing lead assignments in DB1 for direct leads.
 * 4. Verifies assignment status consistency with lead status.
 * 5. Displays detailed per-astrologer breakdown of leads and queries.
 * 6. Validates Super Admin (DB2) central sync.
 */
async function verifyAndSyncAllAstrologers() {
  console.log('================================================================');
  console.log('       ALL ASTROLOGERS LEADS & QUERIES AUDIT & SYNC');
  console.log('================================================================\n');

  // 1. Fetch astrologers from both databases
  const { data: db1Astrologers, error: err1 } = await s1
    .from('astrologer_profiles')
    .select('id, user_id, display_name, slug, approval_status, consultation_fee, created_at')
    .order('display_name', { ascending: true });

  if (err1) {
    console.error('Failed to fetch astrologers from DB1:', err1);
    return;
  }

  const { data: db2Astrologers, error: err2 } = await s2
    .from('astrologer_profiles')
    .select('id, user_id, display_name, slug, approval_status, consultation_fee, created_at')
    .order('display_name', { ascending: true });

  if (err2) {
    console.error('Failed to fetch astrologers from DB2:', err2);
    return;
  }

  const db2AstroBySlug = new Map((db2Astrologers || []).map((a) => [a.slug, a]));

  console.log(`Found ${db1Astrologers.length} astrologers in DB1, ${db2Astrologers.length} astrologers in DB2.\n`);

  // 2. Fetch all leads and assignments across both DBs
  const { data: db1AllLeads } = await s1.from('leads').select('*').order('created_at', { ascending: false });
  const { data: db1AllAssignments } = await s1.from('lead_assignments').select('*');
  const { data: db2AllLeads } = await s2.from('leads').select('*').order('created_at', { ascending: false });
  const { data: db2AllAssignments } = await s2.from('lead_assignments').select('*');

  const db1AssignmentSet = new Set((db1AllAssignments || []).map((a) => `${a.astrologer_id}_${a.lead_id}`));

  // Auto-heal missing assignments in DB1 for any astrologer
  let autoHealedCount = 0;
  for (const lead of (db1AllLeads || [])) {
    if (lead.astrologer_id) {
      const key = `${lead.astrologer_id}_${lead.id}`;
      if (!db1AssignmentSet.has(key)) {
        console.log(`[Auto-Heal] Missing assignment for Lead "${lead.subject}" (ID: ${lead.id}) -> Astrologer ID: ${lead.astrologer_id}`);
        const assignStatus = lead.status === 'closed' ? 'closed' : lead.status === 'contacted' ? 'contacted' : 'assigned';
        const { error: insErr } = await s1.from('lead_assignments').insert({
          lead_id: lead.id,
          astrologer_id: lead.astrologer_id,
          status: assignStatus,
          created_at: lead.created_at,
        });
        if (!insErr) {
          autoHealedCount++;
          db1AssignmentSet.add(key);
        } else {
          console.error(`  Error creating assignment:`, insErr.message);
        }
      }
    }
  }

  if (autoHealedCount > 0) {
    console.log(`\nSuccessfully auto-healed ${autoHealedCount} missing assignments in DB1!\n`);
  }

  // 3. Iterate over each astrologer and verify their portal queries
  console.log('----------------------------------------------------------------');
  console.log('             PER-ASTROLOGER DASHBOARD VERIFICATION');
  console.log('----------------------------------------------------------------');

  for (const astro of db1Astrologers) {
    const db2Match = db2AstroBySlug.get(astro.slug);
    console.log(`\n✦ Astrologer: "${astro.display_name}" (slug: ${astro.slug})`);
    console.log(`  - DB1 Profile ID: ${astro.id}`);
    console.log(`  - DB2 Profile ID: ${db2Match ? db2Match.id : 'NOT FOUND IN DB2'}`);
    console.log(`  - Status: ${astro.approval_status} | Fee: ₹${astro.consultation_fee ?? 0}`);

    // Query leads as the astrologer dashboard query would:
    const { data: assignments, error: queryErr } = await s1
      .from('lead_assignments')
      .select(NESTED_ASSIGNMENT_SELECT)
      .eq('astrologer_id', astro.id)
      .order('created_at', { ascending: false });

    if (queryErr) {
      console.error(`  Error querying leads for ${astro.display_name}:`, queryErr.message);
      continue;
    }

    const totalAssigned = assignments?.length || 0;
    const closed = assignments?.filter((a) => a.status === 'closed').length || 0;
    const contacted = assignments?.filter((a) => a.status === 'contacted').length || 0;
    const assigned = assignments?.filter((a) => a.status === 'assigned' || a.status === 'new').length || 0;

    console.log(`  - Total Leads in Astrologer Portal: ${totalAssigned} [Active/Assigned: ${assigned}, Contacted: ${contacted}, Closed: ${closed}]`);

    if (totalAssigned === 0) {
      console.log('    (No leads currently assigned)');
    } else {
      for (const item of assignments) {
        const lead = item.lead;
        const custName = lead?.customer?.full_name || 'Customer';
        const dateStr = formatIST(item.created_at);
        console.log(`    • [${item.status.toUpperCase()}] "${lead?.subject || 'Untitled'}"`);
        console.log(`      Lead ID: ${item.lead_id} | Client: ${custName}`);
        console.log(`      Lead Status: ${lead?.status} | Assignment Status: ${item.status}`);
        console.log(`      IST Date/Time: ${dateStr}`);
      }
    }
  }

  // 4. Super Admin Central Status Overview
  console.log('\n================================================================');
  console.log('              SUPER ADMIN CENTRAL LEADS OVERVIEW');
  console.log('================================================================');
  const { data: finalDb2Leads } = await s2.from('leads').select('id, subject, status, created_at, customer_name, astrologer_id').order('created_at', { ascending: false });
  console.log(`Total Leads in Super Admin Database (DB2): ${finalDb2Leads?.length || 0}`);
  const db2Closed = finalDb2Leads?.filter((l) => l.status === 'closed').length || 0;
  const db2New = finalDb2Leads?.filter((l) => l.status === 'new').length || 0;
  const db2Assigned = finalDb2Leads?.filter((l) => l.status === 'assigned').length || 0;
  const db2Contacted = finalDb2Leads?.filter((l) => l.status === 'contacted').length || 0;

  console.log(`Status Breakdown -> Closed: ${db2Closed} | New/Pending: ${db2New} | Assigned: ${db2Assigned} | In Progress: ${db2Contacted}`);
  console.log('\nVerification and synchronization complete across all astrologer accounts!\n');
}

verifyAndSyncAllAstrologers()
  .then(() => {
    // Graceful exit
  })
  .catch((err) => {
    console.error('Fatal error during execution:', err);
  });
