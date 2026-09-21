export interface SameMountedTransitionEvidence { mountIdBefore: string; mountIdAfter: string; queryBefore: string; queryAfter: string; candidateIdBefore: string; candidateIdAfter: string; groupIdBefore: string; groupIdAfter: string; focusedIdBefore: string; focusedIdAfter: string; writesBefore: number; writesAfter: number; zoomReads: number[]; }
export interface EnvironmentEvidence { normalTextContrast: number; largeTextContrast: number; controlContrast: number; focusContrast: number; borderContrast: number; firstResultReachable: boolean; lastResultReachable: boolean; manyMemberLastReachable: boolean; longNameReachable: boolean; }
export function assertSameMountedTransition(value: SameMountedTransitionEvidence): void;
export function assertEnvironmentEvidence(value: EnvironmentEvidence): void;
export function contrastRatio(foreground: string, background: string): number;
