import React from 'react';
import { UIThemeId } from '../../theme/types';
import { THEME_LIGHTING } from './lightingConfig';

export interface IStudioEnvironmentProps {
  theme?: UIThemeId;
}

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
