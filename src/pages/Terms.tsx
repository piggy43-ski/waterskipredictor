import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';

const Terms = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <SEO title="Terms of Service" description="Terms of Service for WaterSki Predictor — token rules, age requirements, and account responsibilities." path="/terms" />
      <PageHeader title="Terms of Service" showBalance={false} />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Card className="p-6 rounded-2xl">
          <h1 className="text-2xl font-display font-bold mb-4">Terms of Service</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Last updated: January 2026
          </p>
          
          <div className="space-y-4 text-sm">
            <section>
              <h2 className="font-bold mb-2">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By accessing and using WaterSki Predictor, you agree to be bound by these Terms of Service. 
                If you do not agree to these terms, please do not use our service.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">2. Age Requirement</h2>
              <p className="text-muted-foreground">
                You must be at least 18 years of age to use this service. By creating an account, 
                you confirm that you meet this age requirement.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">3. Token System</h2>
              <p className="text-muted-foreground">
                Tokens purchased or earned through WaterSki Predictor are for entertainment purposes only. 
                Tokens have no cash value and cannot be exchanged for real currency. Tokens may only be 
                redeemed for rewards offered through our platform.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">4. Predictions</h2>
              <p className="text-muted-foreground">
                WaterSki Predictor offers skill-based prediction markets. Entry amounts and rewards 
                are denominated in tokens only. All prediction results are final once settled by our system.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">5. Account Responsibility</h2>
              <p className="text-muted-foreground">
                You are responsible for maintaining the confidentiality of your account credentials 
                and for all activities that occur under your account.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">6. Prohibited Activities</h2>
              <p className="text-muted-foreground">
                Users may not engage in fraudulent activity, create multiple accounts, or attempt 
                to manipulate the platform in any way.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">7. Modifications</h2>
              <p className="text-muted-foreground">
                We reserve the right to modify these terms at any time. Continued use of the service 
                after changes constitutes acceptance of the new terms.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">8. Contact</h2>
              <p className="text-muted-foreground">
                For questions about these Terms, please contact us through the Help Center.
              </p>
            </section>
          </div>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default Terms;