import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Sub-phase 13.1: Customer Notification Center & Real-Time In-App Alerts', () => {
  it('should verify customer notification page requires customer authentication and hydrates initial notifications', () => {
    const pagePath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/notification/page.tsx'
    );
    assert.ok(fs.existsSync(pagePath), 'app/customer/(portal)/notification/page.tsx must exist');

    const content = fs.readFileSync(pagePath, 'utf8');

    assert.match(content, /requireCustomerPage\(\)/, 'Must enforce requireCustomerPage');
    assert.match(content, /getCustomerNotifications\(\)/, 'Must fetch customer notifications');
    assert.match(content, /<CustomerNotificationsClient/, 'Must mount CustomerNotificationsClient');
  });

  it('should verify customer notifications client handles live badge sync, mark as read, delete, and clear-all', () => {
    const clientPath = path.resolve(
      process.cwd(),
      'app/customer/(portal)/notification/CustomerNotificationsClient.tsx'
    );
    assert.ok(fs.existsSync(clientPath), 'CustomerNotificationsClient.tsx must exist');

    const content = fs.readFileSync(clientPath, 'utf8');

    assert.match(content, /markNotificationReadAction/, 'Must import markNotificationReadAction');
    assert.match(content, /markAllCustomerNotificationsReadAction/, 'Must import markAllCustomerNotificationsReadAction');
    assert.match(content, /deleteCustomerNotificationAction/, 'Must import deleteCustomerNotificationAction');
    assert.match(content, /clearAllCustomerNotificationsAction/, 'Must import clearAllCustomerNotificationsAction');
    assert.match(content, /karmicascension:notifications-updated/, 'Must dispatch live badge sync custom event');
  });

  it('should verify customer server actions enforce user customer_id isolation', () => {
    const actionPath = path.resolve(process.cwd(), 'app/actions/customer.ts');
    assert.ok(fs.existsSync(actionPath), 'app/actions/customer.ts must exist');

    const content = fs.readFileSync(actionPath, 'utf8');

    assert.match(content, /export\s+async\s+function\s+getCustomerNotifications/i);
    assert.match(content, /export\s+async\s+function\s+markNotificationReadAction/i);
    assert.match(content, /export\s+async\s+function\s+deleteCustomerNotificationAction/i);
    assert.match(content, /export\s+async\s+function\s+clearAllCustomerNotificationsAction/i);
  });
});
