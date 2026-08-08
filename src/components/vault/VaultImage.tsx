import { useEffect, useState } from 'react';
import { resolveVaultImage } from '@/lib/vault';
import { cn } from '@/lib/utils';

interface Props {
  path?: string | null;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
}

export const VaultImage = ({ path, alt, className, loading = 'lazy' }: Props) => {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setSrc('');
      return;
    }
    resolveVaultImage(path).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [path]);

  if (!src) {
    return (
      <div
        className={cn('bg-secondary flex items-center justify-center', className)}
        aria-hidden="true"
      >
        <span className="vault-kicker text-[10px] text-muted-foreground">The Vault</span>
      </div>
    );
  }

  return <img src={src} alt={alt} loading={loading} className={cn('object-cover', className)} />;
};