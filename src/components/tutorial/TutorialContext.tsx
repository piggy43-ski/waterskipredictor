import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { tutorialSteps, TutorialStep } from './tutorialSteps';

interface TutorialContextType {
  isActive: boolean;
  currentStep: number;
  currentStepData: TutorialStep | null;
  totalSteps: number;
  startTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipTutorial: () => void;
  completeTutorial: () => void;
  resetTutorial: () => void;
}

export const TutorialContext = createContext<TutorialContextType | null>(null);

export const useTutorial = () => {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorial must be used within a TutorialProvider');
  }
  return context;
};

export const TutorialProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCheckedTutorial, setHasCheckedTutorial] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const currentStepData = isActive ? tutorialSteps[currentStep] : null;

  // Check if tutorial should be shown on mount
  useEffect(() => {
    if (!user || hasCheckedTutorial) return;

    const checkTutorialStatus = async () => {
      // Check for URL param override
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('tutorial') === '1') {
        setHasCheckedTutorial(true);
        setCurrentStep(0);
        setIsActive(true);
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('tutorial_completed')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error checking tutorial status:', error);
        setHasCheckedTutorial(true);
        return;
      }

      setHasCheckedTutorial(true);
      
      if (!data?.tutorial_completed) {
        // Wait a moment for the UI to settle
        setTimeout(() => {
          setCurrentStep(0);
          setIsActive(true);
        }, 500);
      }
    };

    checkTutorialStatus();
  }, [user, hasCheckedTutorial]);

  const markTutorialComplete = useCallback(async () => {
    if (!user) return;

    await supabase
      .from('profiles')
      .update({
        tutorial_completed: true,
        tutorial_completed_at: new Date().toISOString(),
      })
      .eq('id', user.id);
  }, [user]);

  const startTutorial = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
    // Navigate to home for step 1
    if (location.pathname !== '/') {
      navigate('/');
    }
  }, [navigate, location.pathname]);

  const nextStep = useCallback(() => {
    if (currentStep < tutorialSteps.length - 1) {
      const nextStepData = tutorialSteps[currentStep + 1];
      
      // Navigate if needed
      if (nextStepData.route && location.pathname !== nextStepData.route) {
        navigate(nextStepData.route);
      }
      
      setCurrentStep(prev => prev + 1);
    } else {
      // Last step - complete tutorial
      completeTutorial();
    }
  }, [currentStep, location.pathname, navigate]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      const prevStepData = tutorialSteps[currentStep - 1];
      
      // Navigate if needed
      if (prevStepData.route && location.pathname !== prevStepData.route) {
        navigate(prevStepData.route);
      }
      
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep, location.pathname, navigate]);

  const skipTutorial = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    markTutorialComplete();
  }, [markTutorialComplete]);

  const completeTutorial = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    markTutorialComplete();
  }, [markTutorialComplete]);

  const resetTutorial = useCallback(async () => {
    if (!user) return;

    await supabase
      .from('profiles')
      .update({
        tutorial_completed: false,
        tutorial_completed_at: null,
      })
      .eq('id', user.id);
    
    setHasCheckedTutorial(false);
  }, [user]);

  return (
    <TutorialContext.Provider
      value={{
        isActive,
        currentStep,
        currentStepData,
        totalSteps: tutorialSteps.length,
        startTutorial,
        nextStep,
        prevStep,
        skipTutorial,
        completeTutorial,
        resetTutorial,
      }}
    >
      {children}
    </TutorialContext.Provider>
  );
};
