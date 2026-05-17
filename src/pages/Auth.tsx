import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { SEO } from '@/components/SEO';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Mail, Check, X } from 'lucide-react';
import logo from '@/assets/logo.png';

type AuthView = 'landing' | 'signin' | 'signup';

const Auth = () => {
  const navigate = useNavigate();
  const {
    user,
    loading: authLoading,
    signIn,
    signUp
  } = useAuth();
  const [view, setView] = useState<AuthView>('landing');
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  
  // Age and ToS consent states
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);
  
  // Marketing opt-in state
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  
  // Referral code states
  const [referralCode, setReferralCode] = useState('');
  const [referralCodeStatus, setReferralCodeStatus] = useState<'idle' | 'validating' | 'valid' | 'invalid'>('idle');
  
  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Loading skeleton while checking auth status
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 animate-fade-in">
        <SEO title="Sign In or Sign Up" description="Join WaterSki Predictor — make free picks on IWWF pro tour events, earn tokens, and compete with other waterski fans." path="/auth" />
        {/* Logo Skeleton */}
        <Skeleton className="w-20 h-20 rounded-full mb-12" />

        {/* Hero Text Skeleton */}
        <div className="text-center mb-16 space-y-3">
          <Skeleton className="h-12 w-64 mx-auto" />
          <Skeleton className="h-12 w-56 mx-auto" />
          <Skeleton className="h-8 w-48 mx-auto mt-4" />
        </div>

        {/* Action Buttons Skeleton */}
        <div className="w-full max-w-sm space-y-4">
          <Skeleton className="h-14 w-full rounded-full" />
          <Skeleton className="h-14 w-full rounded-full" />
        </div>
      </div>
    );
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    await signIn(signInEmail, signInPassword);
    setFormLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true);
    await signUp(signUpEmail, signUpPassword, username, country, {
      ageConfirmed,
      tosAccepted,
      tosVersion: '1.0',
      privacyVersion: '1.0'
    }, referralCodeStatus === 'valid' ? referralCode : undefined, marketingOptIn);
    setFormLoading(false);
  };

  const handleBack = () => {
    setView('landing');
    // Reset consent checkboxes when going back
    setAgeConfirmed(false);
    setTosAccepted(false);
    setMarketingOptIn(false);
    setReferralCode('');
    setReferralCodeStatus('idle');
  };

  const validateReferralCode = async (code: string) => {
    if (!code.trim()) {
      setReferralCodeStatus('idle');
      return;
    }
    
    setReferralCodeStatus('validating');
    
    try {
      const { data, error } = await supabase
        .from('referral_codes')
        .select('id, uses_count, max_uses_total')
        .eq('code', code.toUpperCase().trim())
        .eq('is_active', true)
        .single();
      
      if (error || !data) {
        setReferralCodeStatus('invalid');
        return;
      }
      
      // Check max uses
      if (data.max_uses_total && data.uses_count >= data.max_uses_total) {
        setReferralCodeStatus('invalid');
        return;
      }
      
      setReferralCodeStatus('valid');
    } catch {
      setReferralCodeStatus('invalid');
    }
  };

  // Landing View
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 animate-fade-in">
        <SEO title="Sign In or Sign Up" description="Join WaterSki Predictor — make free picks on IWWF pro tour events, earn tokens, and compete with other waterski fans." path="/auth" />
        {/* Logo */}
        <div className="w-64 h-64 mb-12 animate-scale-in">
          <img 
            alt="WaterSki Predictor" 
            className="w-full h-full object-contain drop-shadow-[0_0_15px_hsl(var(--primary)/0.1)]" 
            src="/lovable-uploads/f9f1dcf1-992d-434c-80c3-7cc815c9ecf9.png" 
          />
        </div>

        {/* Hero Text */}
        <div className="text-center mb-16 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tight leading-tight">
            <span className="text-primary">WHERE EVERY</span>
            <br />
            <span className="text-primary">PASS MATTERS</span>
          </h1>
          <p className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-foreground mt-2">
            PREDICT THE TOUR
          </p>
        </div>

        {/* Action Buttons */}
        <div className="w-full max-w-sm space-y-4 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <Button 
            onClick={() => setView('signup')} 
            className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Sign Up
          </Button>
          <Button 
            onClick={() => setView('signin')} 
            variant="outline" 
            className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full border-2 transition-transform hover:scale-[1.02] active:scale-[0.98]"
          >
            Log In
          </Button>
        </div>
      </div>
    );
  }

  // Sign In View
  if (view === 'signin') {
    return (
      <div className="min-h-screen bg-background flex flex-col px-6 py-8 animate-fade-in">
        <SEO title="Sign In" description="Sign in to WaterSki Predictor to continue making picks and tracking your predictions." path="/auth" />
        {/* Back Button */}
        <button 
          onClick={handleBack} 
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 hover:-translate-x-1 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>

        {/* Header */}
        <div className="mb-8 animate-fade-in" style={{ animationDelay: '50ms' }}>
          <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">
            LOG IN
          </h1>
          <p className="text-muted-foreground mt-2">
            Welcome back to WaterSki Predictor
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignIn} className="space-y-6 flex-1 animate-fade-in" style={{ animationDelay: '100ms' }}>
          <div className="space-y-2">
            <Label htmlFor="signin-email" className="flex items-center gap-2 text-sm font-medium">
              <Mail className="w-4 h-4" />
              Email Address
            </Label>
            <Input 
              id="signin-email" 
              type="email" 
              placeholder="your@email.com" 
              value={signInEmail} 
              onChange={e => setSignInEmail(e.target.value)} 
              required 
              className="h-12 rounded-xl transition-shadow focus:shadow-md" 
            />
            <p className="text-xs text-muted-foreground">
              Use the email you signed up with
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="signin-password" className="text-sm font-medium">Password</Label>
            <Input 
              id="signin-password" 
              type="password" 
              placeholder="••••••••" 
              value={signInPassword} 
              onChange={e => setSignInPassword(e.target.value)} 
              required 
              className="h-12 rounded-xl transition-shadow focus:shadow-md" 
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="remember-me" 
                checked={rememberMe} 
                onCheckedChange={checked => setRememberMe(checked === true)} 
              />
              <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                Remember me
              </Label>
            </div>
            <Link to="/reset-password" className="text-sm text-primary hover:underline transition-colors">
              Forgot password?
            </Link>
          </div>

          <Button 
            type="submit" 
            className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full mt-8 transition-transform hover:scale-[1.02] active:scale-[0.98]" 
            disabled={formLoading}
          >
            {formLoading ? 'Signing in...' : 'Log In'}
          </Button>
        </form>
      </div>
    );
  }

  // Sign Up View
  return (
    <div className="min-h-screen bg-background flex flex-col px-6 py-8 animate-fade-in">
      <SEO title="Create Account" description="Create your free WaterSki Predictor account to start picking winners on the IWWF pro tour." path="/auth" />
      {/* Back Button */}
      <button 
        onClick={handleBack} 
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 hover:-translate-x-1 transition-transform"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Back</span>
      </button>

      {/* Header */}
      <div className="mb-8 animate-fade-in" style={{ animationDelay: '50ms' }}>
        <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">
          SIGN UP
        </h1>
        <p className="text-muted-foreground mt-2">
          Create your WaterSki Predictor account
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSignUp} className="space-y-5 flex-1 animate-fade-in" style={{ animationDelay: '100ms' }}>
        <div className="space-y-2">
          <Label htmlFor="signup-email" className="flex items-center gap-2 text-sm font-medium">
            <Mail className="w-4 h-4" />
            Email Address
          </Label>
          <Input 
            id="signup-email" 
            type="email" 
            placeholder="your@email.com" 
            value={signUpEmail} 
            onChange={e => setSignUpEmail(e.target.value)} 
            required 
            className="h-12 rounded-xl transition-shadow focus:shadow-md" 
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-medium">Username</Label>
          <Input 
            id="username" 
            type="text" 
            placeholder="your_username" 
            value={username} 
            onChange={e => setUsername(e.target.value)} 
            required 
            className="h-12 rounded-xl transition-shadow focus:shadow-md" 
          />
          <p className="text-xs text-muted-foreground">
            This will be your display name
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="country" className="text-sm font-medium">Country (Optional)</Label>
          <Input 
            id="country" 
            type="text" 
            placeholder="USA" 
            value={country} 
            onChange={e => setCountry(e.target.value)} 
            className="h-12 rounded-xl transition-shadow focus:shadow-md" 
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-password" className="text-sm font-medium">Password</Label>
          <Input 
            id="signup-password" 
            type="password" 
            placeholder="••••••••" 
            value={signUpPassword} 
            onChange={e => setSignUpPassword(e.target.value)} 
            required 
            className="h-12 rounded-xl transition-shadow focus:shadow-md" 
          />
          <p className="text-xs text-muted-foreground">
            Minimum 6 characters
          </p>
        </div>

        {/* Referral Code */}
        <div className="space-y-2">
          <Label htmlFor="referral-code" className="text-sm font-medium">
            Have a referral code? (Optional)
          </Label>
          <div className="relative">
            <Input 
              id="referral-code" 
              type="text" 
              placeholder="Enter code"
              value={referralCode} 
              onChange={e => {
                const code = e.target.value.toUpperCase();
                setReferralCode(code);
                if (!code) setReferralCodeStatus('idle');
              }}
              onBlur={() => validateReferralCode(referralCode)}
              className="h-12 rounded-xl transition-shadow focus:shadow-md pr-10" 
            />
            {referralCodeStatus === 'valid' && (
              <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
            )}
            {referralCodeStatus === 'invalid' && (
              <X className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-red-500" />
            )}
          </div>
          {referralCodeStatus === 'valid' && (
            <p className="text-xs text-green-600">✓ Code applied</p>
          )}
          {referralCodeStatus === 'invalid' && (
            <p className="text-xs text-red-600">Invalid or expired code</p>
          )}
        </div>

        {/* Age Verification */}
        <div className="flex items-start space-x-3 pt-2">
          <Checkbox 
            id="age-confirm" 
            checked={ageConfirmed}
            onCheckedChange={(checked) => setAgeConfirmed(checked === true)}
          />
          <Label htmlFor="age-confirm" className="text-sm font-normal cursor-pointer leading-relaxed">
            I confirm I am 18 years or older.
          </Label>
        </div>

        {/* Terms & Privacy */}
        <div className="flex items-start space-x-3">
          <Checkbox 
            id="tos-accept" 
            checked={tosAccepted}
            onCheckedChange={(checked) => setTosAccepted(checked === true)}
          />
          <Label htmlFor="tos-accept" className="text-sm font-normal cursor-pointer leading-relaxed">
            I agree to the{' '}
            <Link to="/terms" className="text-primary underline hover:text-primary/80">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="text-primary underline hover:text-primary/80">Privacy Policy</Link>.
          </Label>
        </div>

        {/* Marketing Opt-In (Optional) */}
        <div className="flex items-start space-x-3">
          <Checkbox 
            id="marketing-optin" 
            checked={marketingOptIn}
            onCheckedChange={(checked) => setMarketingOptIn(checked === true)}
          />
          <Label htmlFor="marketing-optin" className="text-sm font-normal cursor-pointer leading-relaxed">
            Keep me updated on tournaments, promotions, and news (optional)
          </Label>
        </div>

        {/* Age Disclaimer */}
        <p className="text-xs text-muted-foreground text-center pt-2">
          This app is intended for users 18+.
        </p>

        <Button
          type="submit" 
          className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full mt-4 transition-transform hover:scale-[1.02] active:scale-[0.98]" 
          disabled={formLoading || !ageConfirmed || !tosAccepted}
        >
          {formLoading ? 'Creating account...' : 'Sign Up'}
        </Button>
      </form>
    </div>
  );
};

export default Auth;