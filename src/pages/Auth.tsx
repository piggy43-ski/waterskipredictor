import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Mail } from 'lucide-react';
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
  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  // Loading skeleton while checking auth status
  if (authLoading) {
    return <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 animate-fade-in">
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
      </div>;
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
    await signUp(signUpEmail, signUpPassword, username, country);
    setFormLoading(false);
  };
  const handleBack = () => {
    setView('landing');
  };

  // Landing View
  if (view === 'landing') {
    return <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 animate-fade-in">
        {/* Logo */}
        <div className="w-64 h-64 mb-12 animate-scale-in">
          <img 
            alt="WaterSki Predictor" 
            className="w-full h-full object-contain drop-shadow-[0_0_15px_hsl(var(--primary)/0.1)]" 
            src="/lovable-uploads/f9f1dcf1-992d-434c-80c3-7cc815c9ecf9.png" 
          />
        </div>

        {/* Hero Text */}
        <div className="text-center mb-16 animate-fade-in" style={{
        animationDelay: '100ms'
      }}>
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
        <div className="w-full max-w-sm space-y-4 animate-fade-in" style={{
        animationDelay: '200ms'
      }}>
          <Button onClick={() => setView('signup')} className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full transition-transform hover:scale-[1.02] active:scale-[0.98]">
            Sign Up
          </Button>
          <Button onClick={() => setView('signin')} variant="outline" className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full border-2 transition-transform hover:scale-[1.02] active:scale-[0.98]">
            Log In
          </Button>
        </div>
      </div>;
  }

  // Sign In View
  if (view === 'signin') {
    return <div className="min-h-screen bg-background flex flex-col px-6 py-8 animate-fade-in">
        {/* Back Button */}
        <button onClick={handleBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 hover:-translate-x-1 transition-transform">
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>

        {/* Header */}
        <div className="mb-8 animate-fade-in" style={{
        animationDelay: '50ms'
      }}>
          <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">
            LOG IN
          </h1>
          <p className="text-muted-foreground mt-2">
            Welcome back to WaterSki Predictor
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignIn} className="space-y-6 flex-1 animate-fade-in" style={{
        animationDelay: '100ms'
      }}>
          <div className="space-y-2">
            <Label htmlFor="signin-email" className="flex items-center gap-2 text-sm font-medium">
              <Mail className="w-4 h-4" />
              Email Address
            </Label>
            <Input id="signin-email" type="email" placeholder="your@email.com" value={signInEmail} onChange={e => setSignInEmail(e.target.value)} required className="h-12 rounded-xl transition-shadow focus:shadow-md" />
            <p className="text-xs text-muted-foreground">
              Use the email you signed up with
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="signin-password" className="text-sm font-medium">Password</Label>
            <Input id="signin-password" type="password" placeholder="••••••••" value={signInPassword} onChange={e => setSignInPassword(e.target.value)} required className="h-12 rounded-xl transition-shadow focus:shadow-md" />
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Checkbox id="remember-me" checked={rememberMe} onCheckedChange={checked => setRememberMe(checked === true)} />
              <Label htmlFor="remember-me" className="text-sm font-normal cursor-pointer">
                Remember me
              </Label>
            </div>
            <Link to="/reset-password" className="text-sm text-primary hover:underline transition-colors">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full mt-8 transition-transform hover:scale-[1.02] active:scale-[0.98]" disabled={formLoading}>
            {formLoading ? 'Signing in...' : 'Log In'}
          </Button>
        </form>
      </div>;
  }

  // Sign Up View
  return <div className="min-h-screen bg-background flex flex-col px-6 py-8 animate-fade-in">
      {/* Back Button */}
      <button onClick={handleBack} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8 hover:-translate-x-1 transition-transform">
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Back</span>
      </button>

      {/* Header */}
      <div className="mb-8 animate-fade-in" style={{
      animationDelay: '50ms'
    }}>
        <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">
          SIGN UP
        </h1>
        <p className="text-muted-foreground mt-2">
          Create your WaterSki Predictor account
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSignUp} className="space-y-5 flex-1 animate-fade-in" style={{
      animationDelay: '100ms'
    }}>
        <div className="space-y-2">
          <Label htmlFor="signup-email" className="flex items-center gap-2 text-sm font-medium">
            <Mail className="w-4 h-4" />
            Email Address
          </Label>
          <Input id="signup-email" type="email" placeholder="your@email.com" value={signUpEmail} onChange={e => setSignUpEmail(e.target.value)} required className="h-12 rounded-xl transition-shadow focus:shadow-md" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="username" className="text-sm font-medium">Username</Label>
          <Input id="username" type="text" placeholder="your_username" value={username} onChange={e => setUsername(e.target.value)} required className="h-12 rounded-xl transition-shadow focus:shadow-md" />
          <p className="text-xs text-muted-foreground">
            This will be your display name
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="country" className="text-sm font-medium">Country (Optional)</Label>
          <Input id="country" type="text" placeholder="USA" value={country} onChange={e => setCountry(e.target.value)} className="h-12 rounded-xl transition-shadow focus:shadow-md" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="signup-password" className="text-sm font-medium">Password</Label>
          <Input id="signup-password" type="password" placeholder="••••••••" value={signUpPassword} onChange={e => setSignUpPassword(e.target.value)} required className="h-12 rounded-xl transition-shadow focus:shadow-md" />
        </div>

        <Button type="submit" className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full mt-4 transition-transform hover:scale-[1.02] active:scale-[0.98]" disabled={formLoading}>
          {formLoading ? 'Creating account...' : 'Sign Up'}
        </Button>
      </form>
    </div>;
};
export default Auth;