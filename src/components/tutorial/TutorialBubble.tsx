import React, { useEffect, useState, useRef, useContext } from 'react';
import { createPortal } from 'react-dom';
import { TutorialContext } from './TutorialContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

interface BubblePosition {
  top: number;
  left: number;
  arrowPosition: 'top' | 'bottom' | 'left' | 'right';
}

export const TutorialBubble: React.FC = () => {
  const context = useContext(TutorialContext);
  
  const [position, setPosition] = useState<BubblePosition | null>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [showAsFallbackModal, setShowAsFallbackModal] = useState(false);

  const isActive = context?.isActive ?? false;
  const currentStep = context?.currentStep ?? 0;
  const currentStepData = context?.currentStepData;
  const totalSteps = context?.totalSteps ?? 0;
  const nextStep = context?.nextStep ?? (() => {});
  const prevStep = context?.prevStep ?? (() => {});
  const skipTutorial = context?.skipTutorial ?? (() => {});
  const completeTutorial = context?.completeTutorial ?? (() => {});

  useEffect(() => {
    setShowAsFallbackModal(false);
    
    if (!isActive || !currentStepData?.target) {
      setPosition(null);
      return;
    }

    let attempts = 0;
    const maxAttempts = 10;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const updatePosition = () => {
      const element = document.querySelector(currentStepData.target!);
      const bubble = bubbleRef.current;
      
      if (!element) {
        // Retry up to maxAttempts times
        if (attempts < maxAttempts) {
          attempts++;
          console.log(`Tutorial: Retry ${attempts}/${maxAttempts} finding ${currentStepData.target}`);
          retryTimeout = setTimeout(updatePosition, 200);
        } else {
          console.warn(`Tutorial: Could not find element ${currentStepData.target} after ${maxAttempts} attempts - showing as modal`);
          // Show as fallback modal instead of hiding
          setShowAsFallbackModal(true);
          setPosition(null);
        }
        return;
      }

      if (!bubble) {
        setPosition(null);
        return;
      }

      const elementRect = element.getBoundingClientRect();
      const bubbleRect = bubble.getBoundingClientRect();
      const padding = 16;
      const arrowSize = 12;

      let top = 0;
      let left = 0;
      let arrowPosition: 'top' | 'bottom' | 'left' | 'right' = 'top';

      const placement = currentStepData.placement;

      switch (placement) {
        case 'bottom':
          top = elementRect.bottom + arrowSize + padding + window.scrollY;
          left = elementRect.left + elementRect.width / 2 - bubbleRect.width / 2;
          arrowPosition = 'top';
          break;
        case 'top':
          top = elementRect.top - bubbleRect.height - arrowSize - padding + window.scrollY;
          left = elementRect.left + elementRect.width / 2 - bubbleRect.width / 2;
          arrowPosition = 'bottom';
          break;
        case 'left':
          top = elementRect.top + elementRect.height / 2 - bubbleRect.height / 2 + window.scrollY;
          left = elementRect.left - bubbleRect.width - arrowSize - padding;
          arrowPosition = 'right';
          break;
        case 'right':
          top = elementRect.top + elementRect.height / 2 - bubbleRect.height / 2 + window.scrollY;
          left = elementRect.right + arrowSize + padding;
          arrowPosition = 'left';
          break;
      }

      // Clamp to viewport
      const viewportPadding = 16;
      left = Math.max(viewportPadding, Math.min(left, window.innerWidth - bubbleRect.width - viewportPadding));

      setPosition({ top, left, arrowPosition });
    };

    const timeout = setTimeout(updatePosition, 300);
    window.addEventListener('resize', updatePosition);

    return () => {
      clearTimeout(timeout);
      clearTimeout(retryTimeout);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isActive, currentStepData, currentStep]);

  if (!context || !isActive || !currentStepData) return null;

  // Modal content for welcome/complete steps OR fallback when element not found
  if (currentStepData.isModal || showAsFallbackModal) {
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === totalSteps - 1;
    
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <Card className="max-w-sm w-full p-6 bg-card border-border shadow-2xl animate-in fade-in zoom-in duration-300">
          <div className="text-center">
            <h2 className="text-2xl font-display font-bold mb-3 text-foreground">
              {currentStepData.title}
            </h2>
            <p className="text-muted-foreground mb-6 whitespace-pre-line">
              {currentStepData.content}
            </p>
            
            {isFirstStep ? (
              <div className="flex flex-col gap-3">
                <Button onClick={nextStep} className="w-full">
                  Start Tutorial
                </Button>
                <Button variant="ghost" onClick={skipTutorial} className="w-full text-muted-foreground">
                  Skip
                </Button>
              </div>
            ) : isLastStep ? (
              <Button onClick={completeTutorial} className="w-full">
                Done
              </Button>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {currentStep + 1} of {totalSteps}
                </div>
                <div className="flex gap-2">
                  {currentStep > 0 && (
                    <Button size="sm" variant="ghost" onClick={prevStep}>
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Back
                    </Button>
                  )}
                  <Button size="sm" onClick={nextStep}>
                    Next
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>,
      document.body
    );
  }

  // Bubble tooltip for targeted steps
  const arrowClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-card',
    bottom: 'top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-card',
    left: 'right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-card',
    right: 'left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-card',
  };

  return createPortal(
    <div
      ref={bubbleRef}
      className="fixed z-[9999] max-w-sm w-[calc(100vw-32px)] animate-in fade-in slide-in-from-bottom-2 duration-300"
      style={position ? { top: position.top, left: position.left } : { visibility: 'hidden', top: 0, left: 0 }}
    >
      <Card className="p-4 bg-card border-border shadow-2xl relative">
        {/* Arrow */}
        {position && (
          <div
            className={`absolute w-0 h-0 border-[8px] ${arrowClasses[position.arrowPosition]}`}
          />
        )}
        
        {/* Close button */}
        <button
          onClick={skipTutorial}
          className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Content */}
        <div className="pr-6">
          <h3 className="font-display font-bold text-lg mb-2 text-foreground">
            {currentStepData.title}
          </h3>
          <p className="text-sm text-muted-foreground whitespace-pre-line">
            {currentStepData.content}
          </p>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border">
          <div className="text-xs text-muted-foreground">
            {currentStep + 1} of {totalSteps}
          </div>
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button size="sm" variant="ghost" onClick={prevStep}>
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            )}
            <Button size="sm" onClick={nextStep}>
              {currentStep === totalSteps - 2 ? 'Finish' : 'Next'}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </Card>
    </div>,
    document.body
  );
};
