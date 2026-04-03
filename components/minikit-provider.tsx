'use client';
import { useEffect, ReactNode } from 'react';
import { MiniKit } from '@worldcoin/minikit-js';

export const MiniKitProvider = ({ children }: { children: ReactNode }) => {
  useEffect(() => {
    MiniKit.install();
    console.log('MiniKit installed:', MiniKit.isInstalled());
  }, []);
  return <>{children}</>;
};
