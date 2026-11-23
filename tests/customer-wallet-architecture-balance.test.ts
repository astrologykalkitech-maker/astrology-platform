import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 6.1: Customer Wallet Architecture, Balance & Isolation', () => {
  it('should verify customer_wallets schema enforces multi-bucket paise balances and non-negativity', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/076_customer_wallet_and_reservation_ledger.sql'
    );
    assert.ok(fs.existsSync(migrationPath), 'Migration 076 must exist');

    const content = fs.readFileSync(migrationPath, 'utf8');

    // Multi-bucket accounting in integer paise
    assert.match(content, /paid_balance_paise\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*paid_balance_paise\s*>=\s*0\s*\)/i);
    assert.match(content, /promotional_balance_paise\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*promotional_balance_paise\s*>=\s*0\s*\)/i);
    assert.match(content, /refund_balance_paise\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*refund_balance_paise\s*>=\s*0\s*\)/i);
    assert.match(content, /reserved_balance_paise\s+BIGINT\s+NOT\s+NULL\s+DEFAULT\s+0\s+CHECK\s*\(\s*reserved_balance_paise\s*>=\s*0\s*\)/i);
    assert.match(content, /is_frozen\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+false/i);
  });

  it('should verify strict customer row-level security isolation on wallet tables', () => {
    const migrationPath = path.resolve(
      process.cwd(),
      'supabase/migrations/076_customer_wallet_and_reservation_ledger.sql'
    );
    const content = fs.readFileSync(migrationPath, 'utf8');

    // RLS enabled
    assert.match(content, /ALTER\s+TABLE\s+public\.customer_wallets\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    assert.match(content, /ALTER\s+TABLE\s+public\.wallet_reservations\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);
    assert.match(content, /ALTER\s+TABLE\s+public\.wallet_transactions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i);

    // Customer isolation policies
    assert.match(content, /CREATE\s+POLICY\s+"Customers can view own wallet"[\s\S]*?USING\s*\(\s*customer_id\s*=\s*auth\.uid\(\)\s*\)/i);
    assert.match(content, /CREATE\s+POLICY\s+"Customers can view own reservations"[\s\S]*?USING\s*\(\s*customer_id\s*=\s*auth\.uid\(\)\s*\)/i);
    assert.match(content, /CREATE\s+POLICY\s+"Customers can view own transactions"[\s\S]*?USING\s*\(\s*customer_id\s*=\s*auth\.uid\(\)\s*\)/i);
  });

  it('should verify wallet engine computes unified total available balance correctly', () => {
    const enginePath = path.resolve(process.cwd(), 'lib/financial/wallet-engine.ts');
    assert.ok(fs.existsSync(enginePath), 'lib/financial/wallet-engine.ts must exist');

    const content = fs.readFileSync(enginePath, 'utf8');

    // Total available calculation: paid + promo + refund
    assert.match(content, /total_available_paise:\s*paid\s*\+\s*promo\s*\+\s*refund/i);
    assert.match(content, /is_frozen:\s*!!wallet\.is_frozen/i);
    assert.match(content, /getCustomerWallet/i);
    assert.match(content, /creditCustomerWallet/i);
    assert.match(content, /holdWalletReservation/i);
    assert.match(content, /captureWalletReservation/i);
    assert.match(content, /releaseWalletReservation/i);
  });

  it('should verify CustomerWalletOverviewCard and API endpoint isolate customer identity', () => {
    const apiRoutePath = path.resolve(process.cwd(), 'app/api/customer/wallet/route.ts');
    assert.ok(fs.existsSync(apiRoutePath), 'Wallet API route must exist');

    const apiContent = fs.readFileSync(apiRoutePath, 'utf8');
    assert.match(apiContent, /getCurrentUser\(\)/i, 'API route must authenticate current user');
    assert.match(apiContent, /getCustomerWallet\(user\.id\)/i, 'API route must pass authenticated user ID only');

    const componentPath = path.resolve(
      process.cwd(),
      'components/customer/CustomerWalletOverviewCard.tsx'
    );
    assert.ok(fs.existsSync(componentPath), 'CustomerWalletOverviewCard.tsx must exist');

    const compContent = fs.readFileSync(componentPath, 'utf8');
    assert.match(compContent, /\/api\/customer\/wallet/i, 'Component must fetch from authenticated /api/customer/wallet');
    assert.match(compContent, /totalRupees/i, 'Component must format total paise to rupees');
  });
});
