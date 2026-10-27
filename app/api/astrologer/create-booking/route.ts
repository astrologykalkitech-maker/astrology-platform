import { NextRequest, NextResponse } from 'next/server';
import { requireAstrologer } from '@/lib/auth/session'; // corrected import for astrologer context
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export const runtime = 'nodejs'; // needed for supabase RPC if any

/**
 * POST /api/astrologer/create-booking
 * Allows an authenticated astrologer to schedule a booking for a specific customer.
 * Payload: {
 *   customer_id: string,
 *   service_type: string,
 *   consultation_mode: 'Video' | 'Voice' | 'Chat',
 *   scheduled_at: string (ISO datetime),
 *   duration_minutes?: number,
 *   notes?: string
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const { user, target } = await requireAstrologer();
    const payload = await req.json();

    const {
      customer_id,
      service_type,
      consultation_mode,
      scheduled_at,
      duration_minutes = 30,
      notes,
    } = payload as any;

    if (!customer_id || !service_type || !consultation_mode || !scheduled_at) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = await createClient(target);

    // Verify customer exists
    const { data: cust, error: custErr } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customer_id)
      .single();
    if (custErr || !cust) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 });
    }

    // Insert booking – price is derived server‑side, so omitted from client payload
    const { data: booking, error: insertErr } = await supabase
      .from('customer_bookings')
      .insert([
        {
          astrologer_id: user.id,
          customer_id,
          service_type,
          consultation_mode,
          scheduled_at,
          duration_minutes,
          notes: notes || null,
          status: 'confirmed', // astrologer directly confirms
        },
      ])
      .select()
      .single();

    if (insertErr || !booking) {
      return NextResponse.json({ error: insertErr?.message || 'Failed to create booking' }, { status: 500 });
    }

    // Revalidate both sides' bookings pages
    revalidatePath('/astrologer/bookings', 'page');
    revalidatePath('/customer/bookings', 'page');

    return NextResponse.json({ success: true, booking }, { status: 201 });
  } catch (err) {
    console.error('[astrologer/create-booking] error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
