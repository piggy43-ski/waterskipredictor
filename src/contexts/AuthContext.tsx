import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ConsentData {
  ageConfirmed: boolean;
  tosAccepted: boolean;
  tosVersion: string;
  privacyVersion: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (email: string, password: string, username: string, country?: string, consent?: ConsentData, referralCode?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state change:', event);
        
        // Handle token refresh errors silently
        if (event === 'TOKEN_REFRESHED' && !session) {
          console.log('Token refresh failed, clearing session');
          setSession(null);
          setUser(null);
          return;
        }
        
        // Handle sign out or session expiry
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
      }
    );

    // Then check for existing session
    const initSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        // Handle invalid/expired session errors silently
        if (error) {
          console.log('Session error, clearing:', error.message);
          // Clear any stale tokens from localStorage
          await supabase.auth.signOut({ scope: 'local' });
          setSession(null);
          setUser(null);
        } else {
          setSession(session);
          setUser(session?.user ?? null);
        }
      } catch (err) {
        console.log('Session init error:', err);
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    
    initSession();

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, username: string, country?: string, consent?: ConsentData, referralCode?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          username,
          country,
          // Store consent data in user metadata for the trigger to use
          age_confirmed: consent?.ageConfirmed ?? false,
          tos_accepted: consent?.tosAccepted ?? false,
          tos_version: consent?.tosVersion ?? '1.0',
          privacy_version: consent?.privacyVersion ?? '1.0'
        }
      }
    });

    if (error) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive"
      });
    } else {
      // Update the profile with consent data after signup
      if (data.user) {
        const now = new Date().toISOString();
        
        // Prepare profile update data
        const profileUpdate: Record<string, any> = {
          age_confirmed: consent?.ageConfirmed ?? false,
          age_confirmed_at: consent?.ageConfirmed ? now : null,
          tos_accepted: consent?.tosAccepted ?? false,
          tos_accepted_at: consent?.tosAccepted ? now : null,
          tos_version: consent?.tosVersion ?? '1.0',
          privacy_version: consent?.privacyVersion ?? '1.0'
        };
        
        // If referral code provided, validate and attach it
        if (referralCode) {
          const { data: codeData } = await supabase
            .from('referral_codes')
            .select('id, uses_count, max_uses_total')
            .eq('code', referralCode.toUpperCase().trim())
            .eq('is_active', true)
            .or('start_at.is.null,start_at.lte.now()')
            .or('end_at.is.null,end_at.gt.now()')
            .single();
          
          if (codeData) {
            // Check max uses
            if (!codeData.max_uses_total || codeData.uses_count < codeData.max_uses_total) {
              profileUpdate.referred_by_code_id = codeData.id;
              
              // Increment uses_count on the referral code
              await supabase
                .from('referral_codes')
                .update({ uses_count: codeData.uses_count + 1 })
                .eq('id', codeData.id);
              
              console.log('Referral code attached:', referralCode);
            }
          }
        }
        
        // Update profile with consent fields and referral code
        await supabase
          .from('profiles')
          .update(profileUpdate)
          .eq('id', data.user.id);
      }
      
      toast({
        title: "Success!",
        description: "Your account has been created. You can now sign in.",
      });
      
      // Send welcome email
      if (data.user) {
        try {
          await supabase.functions.invoke('send-email', {
            body: {
              type: 'welcome',
              to: email,
              userId: data.user.id,
              data: {
                username: username || email.split('@')[0],
              }
            }
          });
          console.log('Welcome email sent successfully');
        } catch (emailError) {
          console.error('Failed to send welcome email:', emailError);
          // Don't block signup if email fails
        }
      }
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive"
      });
    }

    return { error };
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        // If sign out fails due to network/token issues, clear local state anyway
        console.log('Sign out error:', error.message);
      }
      
      // Always clear local state
      setSession(null);
      setUser(null);
      
      toast({
        title: "Signed out",
        description: "You have been signed out successfully.",
      });
    } catch (err) {
      // Clear local state even on errors
      setSession(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};