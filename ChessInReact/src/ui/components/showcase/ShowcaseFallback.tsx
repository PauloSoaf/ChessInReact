import React from 'react';
import { KnightMaterialFinish } from './types';

export interface IShowcaseFallbackProps {
  finish?: KnightMaterialFinish;
  title?: string;
}

export const ShowcaseFallback: React.FC<IShowcaseFallbackProps> = ({
  finish = 'antique-brass',
  title = 'Staunton Knight 3D Showcase (Fallback)',
}) => {
  const getGradients = () => {
    switch (finish) {
      case 'obsidian':
        return {
          start: '#222B35',
          mid: '#141A21',
          end: '#090D11',
          accent: '#3E4C59',
        };
      case 'ivory-marble':
        return {
          start: '#FFFFFF',
          mid: '#EAE5DB',
          end: '#C7BFB2',
          accent: '#A89E8F',
        };
      case 'antique-brass':
      default:
        return {
          start: '#EAD7BA',
          mid: '#C4A77D',
          end: '#7C6038',
          accent: '#FFE5C2',
        };
    }
  };

  const grad = getGradients();

  return (
    <div
      data-testid="showcase-fallback-vector"
      role="img"
      aria-label={title}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <svg
        viewBox="0 0 240 280"
        style={{
          width: '85%',
          height: '85%',
          maxHeight: '380px',
          filter: 'drop-shadow(0 20px 30px rgba(0, 0, 0, 0.45))',
        }}
      >
        <defs>
          <linearGradient id={`sculptureGrad-${finish}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={grad.start} />
            <stop offset="45%" stopColor={grad.mid} />
            <stop offset="100%" stopColor={grad.end} />
          </linearGradient>
          <linearGradient id="pedestalGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={grad.start} />
            <stop offset="100%" stopColor={grad.end} />
          </linearGradient>
          <radialGradient id="contactShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(0,0,0,0.45)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>

        {/* Floor Contact Shadow */}
        <ellipse cx="120" cy="256" rx="90" ry="14" fill="url(#contactShadow)" />

        {/* Pedestal Base */}
        <path d="M45 250 L195 250 C195 240 180 234 170 234 L70 234 C60 234 45 240 45 250 Z" fill="url(#pedestalGrad)" />
        <ellipse cx="120" cy="234" rx="55" ry="6" fill={grad.mid} />
        <path d="M72 232 L168 232 L160 216 L80 216 Z" fill="url(#pedestalGrad)" opacity="0.9" />
        <ellipse cx="120" cy="216" rx="42" ry="5" fill={grad.start} opacity="0.8" />
        <path d="M82 216 L158 216 L154 200 L86 200 Z" fill="url(#pedestalGrad)" />
        <ellipse cx="120" cy="200" rx="36" ry="4" fill={grad.accent} opacity="0.5" />

        {/* Sculptural Knight Head & Mane Profile */}
        <path
          d="M86 200
             C80 165 72 135 96 100
             C106 86 118 78 126 60
             L130 50
             L136 34
             L146 52
             C158 64 172 74 186 84
             L204 96
             C208 100 206 108 200 114
             L182 124
             C170 122 164 126 166 136
             C178 152 174 178 154 200
             Z"
          fill={`url(#sculptureGrad-${finish})`}
        />

        {/* Snout Chin Indent Highlight */}
        <path
          d="M182 124 C172 123 166 128 168 136 C176 148 174 170 156 195"
          stroke={grad.accent}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          opacity="0.6"
        />

        {/* Inset Eye Sculpture */}
        <ellipse cx="162" cy="88" rx="4" ry="5" fill="#090D11" />
        <circle cx="163" cy="87" r="1.5" fill="#FFFFFF" opacity="0.8" />

        {/* Mane Sculptural Grooves */}
        <path d="M120 72 C114 90 112 110 128 130" stroke={grad.accent} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.5" />
        <path d="M106 100 C102 120 100 142 120 165" stroke={grad.accent} strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.4" />
        <path d="M96 135 C94 152 94 172 114 190" stroke={grad.accent} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.3" />
      </svg>
    </div>
  );
};
