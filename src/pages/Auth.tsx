import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { Waves, Mail } from 'lucide-react';
const Auth = () => {
  const navigate = useNavigate();
  const {
    user,
    signIn,
    signUp
  } = useAuth();
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
  return <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="relative w-full max-w-md">
        {/* Top wave */}
        <svg className="absolute -top-3 left-0 w-full h-6 z-10" viewBox="0 0 400 24" preserveAspectRatio="none">
          <path d="M0,12 Q25,4 50,12 T100,12 T150,12 T200,12 T250,12 T300,12 T350,12 T400,12" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        
        {/* Bottom wave */}
        <svg className="absolute -bottom-3 left-0 w-full h-6 z-10" viewBox="0 0 400 24" preserveAspectRatio="none">
          <path d="M0,12 Q25,20 50,12 T100,12 T150,12 T200,12 T250,12 T300,12 T350,12 T400,12" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        
        {/* Left wave */}
        <svg className="absolute top-0 -left-3 w-6 h-full z-10" viewBox="0 0 24 400" preserveAspectRatio="none">
          <path d="M12,0 Q4,25 12,50 T12,100 T12,150 T12,200 T12,250 T12,300 T12,350 T12,400" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        
        {/* Right wave */}
        <svg className="absolute top-0 -right-3 w-6 h-full z-10" viewBox="0 0 24 400" preserveAspectRatio="none">
          <path d="M12,0 Q20,25 12,50 T12,100 T12,150 T12,200 T12,250 T12,300 T12,350 T12,400" fill="none" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>

        <Card className="w-full p-8 border-transparent bg-card">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mb-4">
              <Waves className="w-8 h-8 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">WaterSki Predictor</h1>
            <p className="text-muted-foreground text-center mt-2">Where every pass matters</p>
          </div>

          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="signup">Sign Up</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Address
                  </Label>
                  <Input id="signin-email" type="email" placeholder="your@email.com" value={signInEmail} onChange={e => setSignInEmail(e.target.value)} required />
                  <p className="text-xs text-muted-foreground">
                    Use the email you signed up with, not your username
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input id="signin-password" type="password" placeholder="••••••••" value={signInPassword} onChange={e => setSignInPassword(e.target.value)} required />
                </div>
                <div className="text-right">
                  <Link to="/reset-password" className="text-sm text-primary hover:underline">
                    Forgot your password?
                  </Link>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-email" className="flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Address
                  </Label>
                  <Input id="signup-email" type="email" placeholder="your@email.com" value={signUpEmail} onChange={e => setSignUpEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Username</Label>
                  <Input id="username" type="text" placeholder="your_username" value={username} onChange={e => setUsername(e.target.value)} required />
                  <p className="text-xs text-muted-foreground">
                    This will be your display name in the app
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country (Optional)</Label>
                  <Input id="country" type="text" placeholder="USA" value={country} onChange={e => setCountry(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input id="signup-password" type="password" placeholder="••••••••" value={signUpPassword} onChange={e => setSignUpPassword(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Creating account...' : 'Sign Up'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>;
};
export default Auth;