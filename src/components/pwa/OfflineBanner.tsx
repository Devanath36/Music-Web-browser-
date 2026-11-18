import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export const OfflineBanner: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-red-500/25 bg-red-500/10 px-4 py-1.5 text-xs font-medium text-red-200"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0 text-red-400" />
      <span>Device offline — playing from local IndexedDB storage</span>
    </div>
  );
};
