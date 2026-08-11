import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { sendVaultEmail, usd, esc } from '../_shared/vaultEmail.ts';

/**
 * THE VAULT — notification flywheel.
 * action=outbid       → instant sweep of un-notified outbids (fired by DB trigger on every bid)
 * action=schedule     → cron sweep: teaser Wed, live Fri, one-hour warning, sold Sunday
 * Every non-outbid send is logged in vault_notify_log so nothing goes twice.
 */

const SITE = 'https://waterskipredictor.com/vault';
const lotNo = (n: number | null) => `Lot ${String(n ?? 0).padStart(2, '0')}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const body = await req.json().catch(() => ({}));
  const action = (body as { action?: string }).action ?? 'schedule';
  const sent: Record<string, number> = {};

  const already = async (kind: string, skiId: string) => {
    const { error } = await supabase.from('vault_notify_log').insert({ kind, ski_id: skiId });
    return !!error; // unique violation → already sent
  };

  try {
    // ---- instant outbid -------------------------------------------------
    if (action === 'outbid' || action === 'schedule') {
      const { data: bids } = await supabase
        .from('vault_bids')
        .select('id, user_id, ski_id, max_bid')
        .not('outbid_at', 'is', null)
        .is('outbid_notified_at', null)
        .limit(200);

      const seen = new Set<string>();
      for (const b of bids ?? []) {
        const key = `${b.user_id}:${b.ski_id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const { data: lot } = await supabase
          .from('vault_skis')
          .select('title, lot_number, current_price, id')
          .eq('id', b.ski_id)
          .maybeSingle();
        if (!lot) continue;
        await sendVaultEmail(supabase, {
          userId: b.user_id,
          subject: `You've been outbid — ${lotNo(lot.lot_number)} ${lot.title}`,
          title: 'You have been outbid',
          body: `<p>Someone just went higher on <strong>${esc(lot.title)}</strong>.</p>
                 <p>Current bid: <strong>${usd(Number(lot.current_price))}</strong></p>
                 <p><a href="${SITE}/ski/${lot.id}">Raise your max bid →</a></p>`,
        });
      }
      if (bids?.length) {
        await supabase
          .from('vault_bids')
          .update({ outbid_notified_at: new Date().toISOString() })
          .in('id', bids.map((b: { id: string }) => b.id));
      }
      sent.outbid = seen.size;
      if (action === 'outbid') {
        return new Response(JSON.stringify({ ok: true, sent }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // ---- scheduled lifecycle mails --------------------------------------
    const nowIso = new Date().toISOString();
    const inHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { data: lotRows } = await supabase
      .from('vault_public_skis')
      .select(
        'id, title, lot_number, status, teaser_at, drop_opens_at, drop_closes_at, closes_at, current_price, bid_count, teaser_headline, teaser_clues, highest_bidder_id'
      )
      .not('drop_id', 'is', null)
      .order('lot_number');

    const lots = (lotRows ?? []).map((l) => ({
      ...l,
      opens_at: l.drop_opens_at as string | null,
      closes_at: (l.closes_at ?? l.drop_closes_at) as string | null,
    }));

    const reminders = async (skiId: string, col: 'notify_open' | 'notify_closing') => {
      const { data } = await supabase
        .from('vault_lot_reminders')
        .select('user_id, email')
        .eq('ski_id', skiId)
        .eq(col, true);
      return data ?? [];
    };

    for (const lot of lots ?? []) {
      const label = `${lotNo(lot.lot_number)} ${lot.title}`;

      // Wednesday teaser → everyone on the list for this lot
      if (lot.teaser_at && lot.teaser_at <= nowIso && (!lot.opens_at || lot.opens_at > nowIso)) {
        if (!(await already('teaser', lot.id))) {
          const clue = (lot.teaser_clues as string[] | null)?.[0];
          for (const r of await reminders(lot.id, 'notify_open')) {
            await sendVaultEmail(supabase, {
              userId: r.user_id ?? undefined,
              to: r.email ?? undefined,
              subject: `${lotNo(lot.lot_number)} is in the vault`,
              title: `${lotNo(lot.lot_number)} is in the vault`,
              body: `<p>${esc(lot.teaser_headline ?? 'A new lot has been sealed in.')}</p>
                     ${clue ? `<p><em>Clue one: ${esc(clue)}</em></p>` : ''}
                     <p>Bidding opens Friday, 7:00 PM ET.</p><p><a href="${SITE}">See the silhouette →</a></p>`,
            });
          }
          sent.teaser = (sent.teaser ?? 0) + 1;
        }
      }

      // Friday open
      if (lot.opens_at && lot.opens_at <= nowIso && lot.closes_at && lot.closes_at > nowIso) {
        if (!(await already('live', lot.id))) {
          for (const r of await reminders(lot.id, 'notify_open')) {
            await sendVaultEmail(supabase, {
              userId: r.user_id ?? undefined,
              to: r.email ?? undefined,
              subject: `${lotNo(lot.lot_number)} is live`,
              title: `${esc(lot.title)} is live`,
              body: `<p>Full reveal. Bidding is open until Sunday, 8:00 PM ET.</p>
                     <p><a href="${SITE}/ski/${lot.id}">Place your bid →</a></p>`,
            });
          }
          sent.live = (sent.live ?? 0) + 1;
        }
      }

      // One hour to close → every bidder who is not currently winning
      if (lot.closes_at && lot.closes_at <= inHour && lot.closes_at > nowIso) {
        if (!(await already('closing', lot.id))) {
          const { data: bidders } = await supabase.from('vault_bids').select('user_id').eq('ski_id', lot.id);
          const ids = [...new Set((bidders ?? []).map((b: { user_id: string }) => b.user_id))].filter(
            (id) => id !== lot.highest_bidder_id
          );
          for (const id of ids) {
            await sendVaultEmail(supabase, {
              userId: id,
              subject: `One hour left — ${label}`,
              title: 'One hour left',
              body: `<p><strong>${esc(lot.title)}</strong> closes in under an hour at <strong>${usd(
                Number(lot.current_price)
              )}</strong>, and you are not the high bidder.</p>
                     <p><a href="${SITE}/ski/${lot.id}">Raise your max →</a></p>`,
            });
          }
          sent.closing = (sent.closing ?? 0) + 1;
        }
      }

      // Sunday result → everyone who bid or asked to be told
      if (['sold', 'ended_met', 'ended_no_reserve_met'].includes(lot.status)) {
        if (!(await already('sold', lot.id))) {
          // badges are awarded once, at close
          await supabase.rpc('vault_award_badges', { p_ski_id: lot.id });
          const { data: guessRes } = await supabase.rpc('vault_guess_results', { p_ski_id: lot.id });
          const guess = guessRes as { winner?: { handle: string; guess: number } | null; total?: number } | null;
          const { data: guessers } = await supabase
            .from('vault_price_guesses')
            .select('user_id')
            .eq('ski_id', lot.id);
          const { data: bidders } = await supabase.from('vault_bids').select('user_id').eq('ski_id', lot.id);
          const watchers = await reminders(lot.id, 'notify_open');
          const recipients = new Map<string, { user_id?: string; email?: string }>();
          for (const b of bidders ?? []) recipients.set(b.user_id, { user_id: b.user_id });
          for (const g of guessers ?? []) recipients.set(g.user_id, { user_id: g.user_id });
          for (const w of watchers) recipients.set(w.user_id ?? w.email, { user_id: w.user_id ?? undefined, email: w.email ?? undefined });
          const nextLot = lots.find((l) => (l.lot_number ?? 0) > (lot.lot_number ?? 0));
          const soldOk = lot.status !== 'ended_no_reserve_met';
          for (const r of recipients.values()) {
            await sendVaultEmail(supabase, {
              userId: r.user_id,
              to: r.email,
              subject: soldOk
                ? `${lotNo(lot.lot_number)} sold for ${usd(Number(lot.current_price))}`
                : `${lotNo(lot.lot_number)} closed without a sale`,
              title: soldOk ? `Hammered at ${usd(Number(lot.current_price))}` : 'Closed — no sale',
              body: `<p><strong>${esc(lot.title)}</strong> — ${lot.bid_count} bids.</p>
                     ${
                       guess?.winner
                         ? `<p>Guess the hammer price: <strong>${esc(guess.winner.handle)}</strong> guessed ${usd(
                             Number(guess.winner.guess)
                           )} out of ${guess.total ?? 0} guesses — closest, and the WSP tokens are theirs.</p>`
                         : ''
                     }
                     ${nextLot ? `<p>${lotNo(nextLot.lot_number)} drops Wednesday at noon ET.</p>` : ''}
                     <p><a href="${SITE}">Back to the vault →</a></p>`,
            });
          }
          sent.sold = (sent.sold ?? 0) + 1;
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, sent }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[VAULT-NOTIFY]', (e as Error).message);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});