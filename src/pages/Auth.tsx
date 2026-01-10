import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { Waves, ArrowLeft, Mail } from 'lucide-react';

type AuthView = 'landing' | 'signin' | 'signup';

// Google Icon Component
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

const Auth = () => {
  const navigate = useNavigate();
  const { user, signIn, signUp, signInWithGoogle } = useAuth();
  
  const [view, setView] = useState<AuthView>('landing');
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [username, setUsername] = useState('');
  const [country, setCountry] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await signIn(signInEmail, signInPassword);
    setLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await signUp(signUpEmail, signUpPassword, username, country);
    setLoading(false);
  };

  const handleBack = () => {
    setView('landing');
  };

  // Landing View
  if (view === 'landing') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6">
        {/* Logo */}
        <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-12">
          <Waves className="w-10 h-10 text-primary-foreground" />
        </div>

        {/* Hero Text */}
        <div className="text-center mb-16">
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
        <div className="w-full max-w-sm space-y-4">
          <Button 
            onClick={() => setView('signup')} 
            className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full"
          >
            Sign Up
          </Button>
          <Button 
            onClick={() => setView('signin')} 
            variant="outline"
            className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full border-2"
          >
            Log In
          </Button>

          {/* Divider */}
          <div className="flex items-center gap-4 py-2">
            <Separator className="flex-1" />
            <span className="text-sm text-muted-foreground">or</span>
            <Separator className="flex-1" />
          </div>

          {/* Google Sign In */}
          <Button 
            onClick={signInWithGoogle}
            variant="secondary"
            className="w-full h-14 text-base font-semibold rounded-full gap-3"
          >
            <GoogleIcon />
            Continue with Google
          </Button>
        </div>
      </div>
    );
  }

  // Sign In View
  if (view === 'signin') {
    return (
      <div className="min-h-screen bg-background flex flex-col px-6 py-8">
        {/* Back Button */}
        <button 
          onClick={handleBack}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="font-medium">Back</span>
        </button>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">
            LOG IN
          </h1>
          <p className="text-muted-foreground mt-2">
            Welcome back to WaterSki Predictor
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSignIn} className="space-y-6 flex-1">
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
              className="h-12 rounded-xl"
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
              className="h-12 rounded-xl"
            />
          </div>

          <div className="text-right">
            <Link to="/reset-password" className="text-sm text-primary hover:underline">
              Forgot your password?
            </Link>
          </div>

          <Button 
            type="submit" 
            className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full mt-8" 
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Log In'}
          </Button>
        </form>
      </div>
    );
  }

  // Sign Up View
  return (
    <div className="min-h-screen bg-background flex flex-col px-6 py-8">
      {/* Back Button */}
      <button 
        onClick={handleBack}
        className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="w-5 h-5" />
        <span className="font-medium">Back</span>
      </button>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black uppercase tracking-tight text-foreground">
          SIGN UP
        </h1>
        <p className="text-muted-foreground mt-2">
          Create your WaterSki Predictor account
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSignUp} className="space-y-5 flex-1">
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
            className="h-12 rounded-xl"
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
            className="h-12 rounded-xl"
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
            className="h-12 rounded-xl"
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
            className="h-12 rounded-xl"
          />
        </div>

        <Button 
          type="submit" 
          className="w-full h-14 text-lg font-bold uppercase tracking-wide rounded-full mt-4" 
          disabled={loading}
        >
          {loading ? 'Creating account...' : 'Sign Up'}
        </Button>
      </form>
    </div>
  );
};

export default Auth;
