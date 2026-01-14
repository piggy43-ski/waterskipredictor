import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTutorial } from './TutorialContext';

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export const TutorialOverlay: React.FC = () => {
  const { isActive, currentStepData } = useTutorial();
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);

  useEffect(() => {
    if (!isActive || !currentStepData?.target) {
      setSpotlight(null);
      return;
    }

    const updateSpotlight = () => {
      const element = document.querySelector(currentStepData.target!);
      if (element) {
        const rect = element.getBoundingClientRect();
        const padding = 8;
        setSpotlight({
          top: rect.top - padding + window.scrollY,
          left: rect.left - padding,
          width: rect.width + padding * 2,
          height: rect.height + padding * 2,
        });

        // Scroll element into view
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        setSpotlight(null);
      }
    };

    // Initial update
    const timeout = setTimeout(updateSpotlight, 100);

    // Update on resize
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight);

    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight);
    };
  }, [isActive, currentStepData]);

  if (!isActive) return null;

  // For modal steps (no target), just show a dark overlay
  if (currentStepData?.isModal) {
    return createPortal(
      <div className="fixed inset-0 bg-black/70 z-[9998] transition-opacity duration-300" />,
      document.body
    );
  }

  // For targeted steps, show spotlight
  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none">
      {/* Dark overlay with spotlight cutout */}
      <svg className="w-full h-full absolute inset-0">
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlight && (
              <rect
                x={spotlight.left}
                y={spotlight.top}
                width={spotlight.width}
                height={spotlight.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.7)"
          mask="url(#spotlight-mask)"
          className="pointer-events-auto"
        />
      </svg>
      
      {/* Spotlight highlight ring */}
      {spotlight && (
        <div
          className="absolute rounded-xl ring-2 ring-primary ring-offset-2 ring-offset-transparent pointer-events-none animate-pulse"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
          }}
        />
      )}
    </div>,
    document.body
  );
};
