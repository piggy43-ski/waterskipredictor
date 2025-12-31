import { useNavigate } from 'react-router-dom';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/PageHeader';
import { BottomNav } from '@/components/BottomNav';

const PaymentCanceled = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background pb-20">
      <PageHeader title="Payment Canceled" showBack />
      
      <div className="container max-w-md mx-auto px-4 py-8">
        <Card className="text-center">
          <CardContent className="pt-8 pb-8">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-destructive/20 rounded-full flex items-center justify-center">
                <XCircle className="w-12 h-12 text-destructive" />
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-foreground mb-2">
              Payment Canceled
            </h2>
            
            <p className="text-muted-foreground mb-6">
              Your payment was not completed. No charges have been made to your account.
            </p>
            
            <div className="space-y-3">
              <Button 
                onClick={() => navigate('/wallet')} 
                className="w-full"
              >
                Try Again
              </Button>
              
              <Button 
                onClick={() => navigate('/')} 
                variant="outline"
                className="w-full"
              >
                Go Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <BottomNav />
    </div>
  );
};

export default PaymentCanceled;
