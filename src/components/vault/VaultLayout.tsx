import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SEO } from '@/components/SEO';
import { captureVaultRef } from '@/lib/vault';

interface Props {
  children: React.ReactNode;
  title: string;
  description: string;
  /** e.g. "LOT 01" — sits beside the wordmark on the lot page. */
  lotLabel?: string;
  /** Live watcher count + sound toggle, owned by the live screen. */
  headerRight?: React.ReactNode;
}

export const VaultLayout = ({ children, title, description, lotLabel, headerRight }: Props) => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    captureVaultRef(search);
  }, [search]);

  return (
    <div className="vault-theme min-h-screen bg-background text-foreground">
      <SEO title={title} description={description} />

      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="mx-auto flex min-h-[72px] max-w-[1400px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:min-h-[96px] sm:px-10">
          <Link to="/vault" className="flex items-baseline gap-4 leading-none">
            <span className="vault-display text-xl uppercase tracking-[0.12em] text-foreground sm:text-[28px]">
              The Vault
            </span>
            {lotLabel ? <span className="vault-mono text-sm text-muted-foreground sm:text-[18px]">{lotLabel}</span> : null}
          </Link>
          <div className="flex items-center gap-4">
          <nav className="hidden items-center gap-4 vault-label sm:flex">
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
          {headerRight}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-5 pb-32 pt-8 sm:px-10">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-[1400px] px-5 py-10 text-center sm:px-10">
          <p className="vault-label">The Vault — by Waterski Predictor</p>
          <p className="mt-3 text-[13px] text-muted-foreground">
            All prices in USD. Payments processed securely. Ships from Central Florida; local pickup available
            (address sent after payment).
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">
            <Link to="/vault/terms" className="hover:text-primary">Terms &amp; bidding rules</Link>
          </p>
        </div>
      </footer>
    </div>
  );
};