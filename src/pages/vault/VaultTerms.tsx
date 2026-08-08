import { Link } from 'react-router-dom';
import { VaultLayout } from '@/components/vault/VaultLayout';
import { VAULT_ANTI_SNIPE_MINUTES } from '@/lib/vault';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-b border-border py-6">
    <h2 className="vault-serif mb-2 text-xl uppercase tracking-[0.12em]">{title}</h2>
    <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">{children}</div>
  </section>
);

const VaultTerms = () => (
  <VaultLayout
    title="Vault Terms & Bidding Rules"
    description="How bidding, payment, shipping and returns work in The Vault — binding bids, hidden reserves, and automatic card charging on win."
  >
    <Link to="/vault" className="vault-kicker mb-4 inline-block text-[10px] text-muted-foreground hover:text-primary">
      ← Back to the drop
    </Link>

    <h1 className="vault-serif mb-2 text-3xl uppercase tracking-[0.14em]">Terms &amp; Bidding Rules</h1>
    <p className="mb-4 text-sm text-muted-foreground">
      Short version: bid like you mean it, because the bid is a contract and the card gets charged.
    </p>

    <Section title="Bids are binding">
      <p>
        Every bid you place is a binding commitment to buy that lot at that price. Bids cannot be retracted, lowered or
        cancelled. If you are the high bidder when the lot closes, you have bought the ski.
      </p>
      <p>
        Bidding is proxy-based: you enter your maximum and we bid on your behalf in set increments, only as high as needed
        to keep you in front. Any bid in the final {VAULT_ANTI_SNIPE_MINUTES} minutes extends the lot by{' '}
        {VAULT_ANTI_SNIPE_MINUTES} minutes, so nothing is won by sniping.
      </p>
    </Section>

    <Section title="Your card is charged automatically when you win">
      <p>
        Before your first bid we save a card on file through Stripe. We never see or store your full card number. When a lot
        closes in your favour, that card is charged automatically for the hammer price plus shipping — you do not need to do
        anything.
      </p>
      <p>
        If your bank asks you to authenticate the payment, we email you a link to confirm it and hold the lot for you. If the
        card declines we retry automatically and email you so you can update it.
      </p>
    </Section>

    <Section title="Shipping is added at close">
      <p>
        Lots are priced ex-shipping. Your shipping cost is set by the zone your address falls in and is added to the hammer
        price at close. Local pickup in Winter Garden, FL is free. We ship within the US only.
      </p>
    </Section>

    <Section title="Sold as described — no general returns">
      <p>
        Gear is used unless stated otherwise, and every lot is described and photographed honestly, including flaws. Because
        each lot is one of one, there are no change-of-mind returns.
      </p>
      <p>
        If an item arrives materially different from its description, tell us within 3 days of delivery and we will make it
        right — repair, partial refund, or full refund with return shipping covered. That guarantee is not negotiable.
      </p>
    </Section>

    <Section title="The seller cannot bid">
      <p>
        Shill bidding is bidding on your own lots to push the price up. It is dishonest and, in most US jurisdictions,
        illegal. We do not do it, and we have made it impossible to do by accident: the seller and every admin account is
        blocked from placing a bid <strong className="text-foreground">at the database level</strong>. Any attempt is
        rejected before it is recorded.
      </p>
    </Section>

    <Section title="Reserves are hidden — and some lots have none">
      <p>
        Some lots carry a reserve: a confidential minimum the bidding must reach for the ski to sell. You will always be told
        whether a reserve exists and whether it has been met, but never the number itself — the reserve price is not readable
        by anyone but us, including through the site's API.
      </p>
      <p>
        Lots marked <strong className="text-foreground">NO RESERVE</strong> sell to the high bidder at whatever the price
        lands, no floor. If a reserve is not met, the lot goes unsold and nobody is charged.
      </p>
    </Section>

    <Section title="The Vault is separate from Waterski Predictor tokens">
      <p>
        Vault purchases are real money in US dollars, settled by card through Stripe. They are entirely separate from
        Waterski Predictor tokens. Tokens cannot be used to bid, cannot be used to pay, and no tokens are earned, spent or
        involved in any auction. Nothing in The Vault touches your token balance.
      </p>
    </Section>

    <p className="py-6 text-xs text-muted-foreground">
      Questions before you bid? Reach out first — we would rather answer than unwind a sale.
    </p>
  </VaultLayout>
);

export default VaultTerms;