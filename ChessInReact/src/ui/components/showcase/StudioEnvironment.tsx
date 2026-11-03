import React from 'react';
import { UIThemeId } from '../../theme/types';

export interface IStudioEnvironmentProps {
  theme?: UIThemeId;
}

interface ILightingConfig {
  ambient: { intensity: number; color: string };
  key: { intensity: number; color: string; position: [number, number, number] };
  fill: { intensity: number; color: string; position: [number, number, number] };
  rim: { intensity: number; color: string; position: [number, number, number] };
  chin: { intensity: number; color: string; position: [number, number, number] };
}

const THEME_LIGHTING: Record<UIThemeId, ILightingConfig> = {
  midnight: {
    ambient: { intensity: 0.45, color: '#F8FAFC' },
    key: { intensity: 1.35, color: '#FFF6E8', position: [-3, 4, 3.5] },
    fill: { intensity: 0.55, color: '#A7B5C4', position: [3.5, 1.5, 2] },
    rim: { intensity: 1.75, color: '#EADDC7', position: [2, 4.5, -3.5] },
    chin: { intensity: 0.25, color: '#C4A77D', position: [0, -0.8, 1.2] },
  },
  ivory: {
    ambient: { intensity: 0.8, color: '#FFFFFF' },
    key: { intensity: 1.5, color: '#FFFBF0', position: [-3, 4, 3.5] },
    fill: { intensity: 0.85, color: '#CBD5E1', position: [3.5, 1.5, 2] },
    rim: { intensity: 1.25, color: '#94A3B8', position: [2, 4.5, -3.5] },
    chin: { intensity: 0.35, color: '#E2E8F0', position: [0, -0.8, 1.2] },
  },
  synthwave: {
    ambient: { intensity: 0.55, color: '#3B0764' },
    key: { intensity: 1.8, color: '#FB7185', position: [-3, 4, 3.5] },
    fill: { intensity: 1.3, color: '#22D3EE', position: [3.5, 1.5, 2] },
    rim: { intensity: 2.4, color: '#C084FC', position: [2, 4.5, -3.5] },
    chin: { intensity: 0.7, color: '#60A5FA', position: [0, -0.8, 1.2] },
  },
};

export const StudioEnvironment: React.FC<IStudioEnvironmentProps> = ({
  theme = 'midnight',
}) => {
  const lights = THEME_LIGHTING[theme] ?? THEME_LIGHTING.midnight;

  return (
    <>
      {/* 1. Ambient Light */}
      <ambientLight intensity={lights.ambient.intensity} color={lights.ambient.color} />

      {/* 2. Key Light (Main Photographic Illumination) */}
      <directionalLight
        position={lights.key.position}
        intensity={lights.key.intensity}
        color={lights.key.color}
        castShadow
      />

      {/* 3. Fill Light (Color-balanced Ambient Bounce) */}
      <directionalLight
        position={lights.fill.position}
        intensity={lights.fill.intensity}
        color={lights.fill.color}
      />

      {/* 4. Rim / Edge Light (Produces sculptural silhouette highlight) */}
      <directionalLight
        position={lights.rim.position}
        intensity={lights.rim.intensity}
        color={lights.rim.color}
      />

      {/* 5. Under-Chin Uplight bounce */}
      <pointLight
        position={lights.chin.position}
        intensity={lights.chin.intensity}
        color={lights.chin.color}
      />
    </>
  );
};
