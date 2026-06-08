import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy,
  MousePointerClick,
  Coins,
  Gift,
  Sparkles,
  Target,
  TrendingUp,
  ShoppingBag,
  GraduationCap,
  Users,
  Shirt,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { SEO } from '@/components/SEO';

type Screen = {
  id: string;
  render: () => JSX.Element;
};

const ScreenShell: React.FC<{
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, children }) => (
  <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
    {eyebrow && (
      <span className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-primary">
        {eyebrow}
      </span>
    )}
    <h1 className="font-display text-4xl font-extrabold uppercase leading-[1.05] tracking-tight text-foreground sm:text-5xl">
      {title}
    </h1>
    {subtitle && (
      <p className="mt-4 max-w-md text-base text-muted-foreground sm:text-lg">{subtitle}</p>
    )}
    {children && <div className="mt-10 w-full max-w-md">{children}</div>}
  </div>
);

const Onboarding = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [saving, setSaving] = useState(false);

  // Swipe handling
  const onDragEnd = (_: any, info: { offset: { x: number } }) => {
    if (info.offset.x < -60) next();
    else if (info.offset.x > 60) prev();
  };

  const screens: Screen[] = useMemo(
    () => [
      {
        id: 'welcome',
        render: () => (
          <div className="relative h-full w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-ocean" />
            <div
              className="absolute inset-0 opacity-40"
              style={{
                background:
                  'radial-gradient(circle at 20% 20%, hsl(186 100% 50% / 0.4), transparent 55%), radial-gradient(circle at 80% 70%, hsl(186 100% 50% / 0.25), transparent 60%)',
              }}
            />
            <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
              <Trophy className="mb-8 h-14 w-14 text-primary" />
              <h1 className="font-display text-5xl font-black uppercase leading-[0.95] tracking-tight text-foreground sm:text-6xl">
                Where every<br />pass matters.
              </h1>
              <p className="mt-5 max-w-md text-base text-muted-foreground sm:text-lg">
                Predict the world's top waterski tournaments.
              </p>
            </div>
          </div>
        ),
      },
      {
        id: 'how',
        render: () => (
          <ScreenShell eyebrow="How it works" title="Three steps. That's it.">
            <div className="space-y-4 text-left">
              {[
                { n: '1', icon: Target, title: 'Pick an event', body: 'Browse upcoming pro tournaments.' },
                { n: '2', icon: MousePointerClick, title: 'Enter your prediction', body: 'Enter tokens on who performs.' },
                { n: '3', icon: TrendingUp, title: 'Climb the leaderboard', body: 'Earn projected rewards on accurate calls.' },
              ].map(({ n, icon: Icon, title, body }) => (
                <div
                  key={n}
                  className="flex items-start gap-4 rounded-2xl border border-border/40 bg-card/60 p-4 backdrop-blur"
                >
                  <div className="flex h-12 w-12 flex-none items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary">STEP {n}</span>
                    </div>
                    <h3 className="text-base font-bold text-foreground">{title}</h3>
                    <p className="text-sm text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScreenShell>
        ),
      },
      {
        id: 'tokens',
        render: () => (
          <ScreenShell eyebrow="Tokens" title="Two kinds. One currency.">
            <div className="grid grid-cols-1 gap-3 text-left sm:grid-cols-2">
              <div className="rounded-2xl border border-border/40 bg-card/60 p-5 backdrop-blur">
                <Coins className="mb-3 h-7 w-7 text-primary" />
                <h3 className="text-base font-bold text-foreground">Purchased Tokens</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Buy with Stripe. Use for entries.
                </p>
              </div>
              <div className="rounded-2xl border border-primary/40 bg-gradient-water/10 p-5 backdrop-blur" style={{ background: 'linear-gradient(135deg, hsl(186 100% 50% / 0.15), hsl(186 100% 50% / 0.05))' }}>
                <Sparkles className="mb-3 h-7 w-7 text-primary" />
                <h3 className="text-base font-bold text-foreground">Earned Tokens</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Win from accurate predictions. Redeemable for rewards.
                </p>
              </div>
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Tokens have no cash value.
            </p>
          </ScreenShell>
        ),
      },
      {
        id: 'multipliers',
        render: () => (
          <ScreenShell
            eyebrow="Multipliers"
            title="Risk shapes the reward."
            subtitle="Favorites carry low multipliers. Riskier picks pay bigger projected rewards."
          >
            <div className="rounded-2xl border border-border/40 bg-card/70 p-5 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <span className="section-title">Sample Event · Slalom</span>
                <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
                  Winner
                </span>
              </div>
              <div className="space-y-2">
                {[
                  { name: 'Top-ranked favorite', mult: '2.5x', tone: 'text-muted-foreground' },
                  { name: 'Mid-tier contender', mult: '8x', tone: 'text-foreground' },
                  { name: 'Underdog', mult: '22x', tone: 'text-primary' },
                ].map((s) => (
                  <div
                    key={s.name}
                    className="flex items-center justify-between rounded-xl border border-border/30 bg-background/40 px-4 py-3"
                  >
                    <span className="text-sm text-foreground">{s.name}</span>
                    <span className={`text-lg font-bold ${s.tone}`}>{s.mult}</span>
                  </div>
                ))}
              </div>
            </div>
          </ScreenShell>
        ),
      },
      {
        id: 'rewards',
        render: () => (
          <ScreenShell
            eyebrow="Rewards"
            title="Turn predictions into pro-level rewards."
          >
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: ShoppingBag, label: 'Gear' },
                { icon: GraduationCap, label: 'Lessons' },
                { icon: Users, label: 'Coaching' },
                { icon: Shirt, label: 'Merch' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-border/40 bg-card/60 backdrop-blur transition hover:border-primary/40"
                >
                  <Icon className="h-8 w-8 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{label}</span>
                </div>
              ))}
            </div>
          </ScreenShell>
        ),
      },
      {
        id: 'airdrop',
        render: () => (
          <div className="relative h-full w-full overflow-hidden">
            <div className="absolute inset-0 bg-gradient-ocean" />
            <div
              className="absolute inset-0"
              style={{
                background:
                  'radial-gradient(circle at 50% 35%, hsl(186 100% 50% / 0.35), transparent 60%)',
              }}
            />
            <div className="relative flex h-full flex-col items-center justify-center px-6 text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 180, damping: 14 }}
                className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-primary/15 shadow-glow"
              >
                <Gift className="h-12 w-12 text-primary" />
              </motion.div>
              <h1 className="font-display text-5xl font-black uppercase tracking-tight text-foreground sm:text-6xl">
                100 tokens,<br />on us.
              </h1>
              <p className="mt-5 max-w-md text-base text-muted-foreground sm:text-lg">
                Welcome to the WSP beta. Your tokens are loaded — Moomba Masters is waiting.
              </p>
            </div>
          </div>
        ),
      },
    ],
    [],
  );

  const total = screens.length;
  const isLast = index === total - 1;

  const complete = async () => {
    if (!user || saving) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({
        onboarding_completed: true,
        onboarding_completed_at: new Date().toISOString(),
      })
      .eq('id', user.id);
    navigate('/', { replace: true });
  };

  const next = () => {
    if (isLast) return complete();
    setDirection(1);
    setIndex((i) => Math.min(i + 1, total - 1));
  };

  const prev = () => {
    if (index === 0) return;
    setDirection(-1);
    setIndex((i) => Math.max(i - 1, 0));
  };

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <SEO title="Welcome to WaterSki Predictor" description="Get started with WSP." />

      {/* Top bar: progress dots + skip */}
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),1rem)] pb-3">
        <div className="flex items-center gap-1.5">
          {screens.map((s, i) => (
            <button
              key={s.id}
              aria-label={`Go to step ${i + 1}`}
              onClick={() => {
                setDirection(i > index ? 1 : -1);
                setIndex(i);
              }}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? 'w-8 bg-primary' : 'w-1.5 bg-foreground/20 hover:bg-foreground/40'
              }`}
            />
          ))}
        </div>
        <button
          onClick={complete}
          className="text-sm font-medium text-muted-foreground transition hover:text-foreground"
        >
          Skip
        </button>
      </div>

      {/* Screen */}
      <div className="relative flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={screens[index].id}
            custom={direction}
            initial={{ opacity: 0, x: direction * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -direction * 40 }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={onDragEnd}
            className="absolute inset-0"
          >
            {screens[index].render()}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-between gap-3 px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3">
        <Button
          variant="ghost"
          onClick={prev}
          disabled={index === 0}
          className="text-muted-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <Button
          onClick={next}
          disabled={saving}
          size="lg"
          className="min-w-[180px] bg-gradient-water font-semibold text-primary-foreground shadow-glow"
        >
          {index === 0
            ? 'Get Started'
            : isLast
            ? 'Enter the App'
            : 'Next'}
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default Onboarding;