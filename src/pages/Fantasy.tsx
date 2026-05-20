import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Crown } from 'lucide-react';

const Fantasy = () => {
  return (
    <div className="min-h-screen bg-background pb-20 flex flex-col">
      <SEO
        title="Fantasy — Coming Soon"
        description="Fantasy leagues are coming to WaterSki Predictor on future tournaments."
        path="/fantasy"
      />
      <PageHeader title="Fantasy" showBack />

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full border border-primary/30 flex items-center justify-center">
            <Crown className="w-8 h-8 text-primary" />
          </div>

          <h1
            className="text-5xl md:text-6xl tracking-wide text-primary uppercase leading-none"
            style={{ fontFamily: "'Bebas Neue', 'Impact', sans-serif" }}
          >
            Fantasy Coming Soon
          </h1>

          <p className="text-base text-muted-foreground leading-relaxed">
            Fantasy isn't available for Masters. Watch for it on future tournaments
            — free to play, real rewards.
          </p>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Fantasy;
