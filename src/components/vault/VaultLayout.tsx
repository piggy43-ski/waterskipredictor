import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SEO } from '@/components/SEO';

interface Props {
  children: React.ReactNode;
  title: string;
  description: string;
}

export const VaultLayout = ({ children, title, description }: Props) => {
  const { pathname } = useLocation();

  return (
    <div className="vault-theme min-h-screen bg-background text-foreground">
      <SEO title={title} description={description} />

      <header className="sticky top-0 z-40 border-b border-border glass-header">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/vault" className="flex flex-col leading-none">
            <span className="vault-kicker text-[9px] text-primary">by Waterski Predictor</span>
            <span className="vault-serif text-2xl tracking-[0.18em] uppercase">The Vault</span>
          </Link>
          <nav className="flex items-center gap-4 text-[11px] vault-kicker">
            <Link
              to="/vault"
              className={pathname === '/vault' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
            >
              Drop
            </Link>
            <Link
              to="/vault/account"
              className={pathname.startsWith('/vault/account') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
            >
              My Bids
            </Link>
            <Link
              to="/vault/consign"
              className={pathname.startsWith('/vault/consign') ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}
            >
              Consign
            </Link>
            <Link to="/" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> App
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-8 text-center">
          <div className="vault-rule mx-auto mb-4 w-24" />
          <p className="vault-kicker text-[9px] text-muted-foreground">
            The Vault — by Waterski Predictor
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            All prices in USD. Payments processed securely. Ships from Central Florida; local pickup available
            (address sent after payment).
          </p>
          <p className="mt-2 text-[11px] text-muted-foreground">
            <Link to="/vault/terms" className="hover:text-primary">Terms &amp; bidding rules</Link>
          </p>
        </div>
      </footer>
    </div>
  );
};