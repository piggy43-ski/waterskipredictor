import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';
import { Card } from '@/components/ui/card';

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background pb-20">
      <SEO title="Privacy Policy" description="How WaterSki Predictor collects, uses, and protects your personal information." path="/privacy" />
      <PageHeader title="Privacy Policy" showBalance={false} />
      
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <Card className="p-6 rounded-2xl">
          <h1 className="text-2xl font-display font-bold mb-4">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground mb-4">
            Last updated: January 2026
          </p>
          
          <div className="space-y-4 text-sm">
            <section>
              <h2 className="font-bold mb-2">1. Information We Collect</h2>
              <p className="text-muted-foreground">
                We collect information you provide when creating an account, including your email address, 
                username, and country. We also collect usage data to improve our service.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">2. How We Use Your Information</h2>
              <p className="text-muted-foreground">
                We use your information to provide and improve our services, process transactions, 
                send notifications, and comply with legal obligations.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">3. Data Security</h2>
              <p className="text-muted-foreground">
                We implement appropriate security measures to protect your personal information 
                against unauthorized access, alteration, disclosure, or destruction.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">4. Data Sharing</h2>
              <p className="text-muted-foreground">
                We do not sell your personal information. We may share data with service providers 
                who assist in operating our platform, subject to confidentiality agreements.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">5. Cookies</h2>
              <p className="text-muted-foreground">
                We use cookies and similar technologies to enhance your experience and analyze usage patterns.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">6. Your Rights</h2>
              <p className="text-muted-foreground">
                You have the right to access, correct, or delete your personal information. 
                Contact us through the Help Center to exercise these rights.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">7. Children's Privacy</h2>
              <p className="text-muted-foreground">
                Our service is not intended for users under 18 years of age. We do not knowingly 
                collect information from children.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">8. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy from time to time. We will notify you of any 
                changes by posting the new policy on this page.
              </p>
            </section>
            
            <section>
              <h2 className="font-bold mb-2">9. Contact</h2>
              <p className="text-muted-foreground">
                For questions about this Privacy Policy, please contact us through the Help Center.
              </p>
            </section>
          </div>
        </Card>
      </div>

      <BottomNav />
    </div>
  );
};

export default Privacy;