import React from 'react';
import { Disc3, Radio } from 'lucide-react';
import { useArtworkUrl } from '../../hooks/useArtworkUrl';
import type { TrackSourceType } from '../../types/music';

interface ArtworkThumbProps {
  artworkId: string | null | undefined;
  alt: string;
  sizeClass?: string;
  roundedClass?: string;
  sourceType?: TrackSourceType;
  iconSizeClass?: string;
}

export const ArtworkThumb: React.FC<ArtworkThumbProps> = ({
  artworkId,
  alt,
  sizeClass = 'w-11 h-11',
  roundedClass = 'rounded-lg',
  sourceType = 'local',
  iconSizeClass = 'w-5 h-5',
}) => {
  const url = useArtworkUrl(artworkId);

  if (url) {
    return (
      <div
        className={`${sizeClass} ${roundedClass} relative overflow-hidden bg-[#16181F] border border-white/[0.08] shrink-0`}
      >
        <img
          src={url}
          alt={alt}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  return (
    <div
      aria-label={alt}
      className={`${sizeClass} ${roundedClass} flex items-center justify-center bg-gradient-to-br from-[#191B23] to-[#0E0F14] border border-white/[0.07] text-gray-500 shrink-0`}
    >
      {sourceType === 'remote' ? (
        <Radio className={`${iconSizeClass} text-red-500/80`} />
      ) : (
        <Disc3 className={`${iconSizeClass} text-gray-500`} />
      )}
    </div>
  );
};
