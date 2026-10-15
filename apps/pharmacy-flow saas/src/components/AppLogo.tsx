import React, { useId } from 'react';

interface AppLogoProps {
  size?: number;
  className?: string;
}

export default function AppLogo({ 
  size = 20, 
  className = "" 
}: AppLogoProps) {
  const maskId = useId();

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 transition-all duration-300 ${className}`}
    >
      <defs>
        <mask id={maskId}>
          <rect width="100" height="100" fill="white" />
          <text 
            x="50" 
            y="62" 
            textAnchor="middle" 
            fill="black" 
            fontSize="48" 
            fontWeight="900" 
            style={{ fontFamily: 'system-ui, sans-serif' }}
          >
            PF
          </text>
        </mask>
      </defs>
      <path 
        d="M30 0H70L100 30V70L70 100H30L0 70V30L30 0Z" 
        fill="currentColor"
        mask={`url(#${maskId})`}
      />
    </svg>
  );
}
