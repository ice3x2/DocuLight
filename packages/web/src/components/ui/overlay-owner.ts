import { createContext, useContext } from 'react';

export type OverlayOwner =
  | { kind: 'page'; id?: undefined }
  | { kind: 'dialog' | 'alert'; id: string };

export const OverlayOwnerContext = createContext<OverlayOwner>({ kind: 'page' });

export function useOverlayOwner() {
  return useContext(OverlayOwnerContext);
}
