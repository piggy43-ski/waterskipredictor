import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';

const PaymentSuccess = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-redirect after 5 seconds
    const timer = setTimeout(() => {
      navigate('/wallet');
    }, 5000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Payment Successful" showBack />
      
      <div className="container max-w-md mx-auto px-4 py-8">
        <Card className="text-center">
          <CardContent className="pt-8 pb-8">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center">
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Payment Successful!
            </h2>
            
            <p className="text-muted-foreground mb-6">
              Your tokens have been added to your wallet. Thank you for your purchase!
            </p>
            
            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/wallet')} 
                className="w-full"
              >
                View Wallet
              </Button>
              
              <Button 
                onClick={() => navigate('/tournaments')} 
                variant="outline"
                className="w-full"
              >
                Browse Tournaments
              </Button>
            </div>
            
            <p className="text-xs text-muted-foreground mt-6">
              Redirecting to wallet in 5 seconds...
            </p>
          </CardContent>
        </Card>
      </div>
      
      <BottomNav />
    </div>
  );
};

export default PaymentSuccess;
