import React from 'react';

export const StudioEnvironment: React.FC = () => {
  return (
    <>
      {/* 1. Soft Ambient Light for shadow detail */}
      <ambientLight intensity={0.4} color="#F8FAFC" />

      {/* 2. Key Light (Main Photographic Illumination: Front-Left-High) */}
      <directionalLight
        position={[-3, 4, 3.5]}
        intensity={1.3}
        color="#FFF6E8"
        castShadow
      />

      {/* 3. Fill Light (Cool Slate Ambient Bounce: Right-EyeLevel) */}
      <directionalLight
        position={[3.5, 1.5, 2]}
        intensity={0.55}
        color="#A7B5C4"
      />

      {/* 4. Rim / Edge Light (High-Back-Right: Produces the sculptural silhouette highlight) */}
      <directionalLight
        position={[2, 4.5, -3.5]}
        intensity={1.75}
        color="#EADDC7"
      />

      {/* 5. Under-Chin Uplight bounce */}
      <pointLight
        position={[0, -0.8, 1.2]}
        intensity={0.25}
        color="#C4A77D"
      />
    </>
  );
};
