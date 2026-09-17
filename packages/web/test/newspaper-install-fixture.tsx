import { StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import { ApiError } from '../src/api/client.js';
import { PreAuthScreen } from '../src/auth/PreAuthScreen.js';

function Fixture() {
  const commitAttempts = useRef(0);
  const fixtureState = window as typeof window & {
    __installFixture?: {
      verifyCalls: number;
      verifiedTokens: string[];
      commitCalls: number;
      committedInputs: Array<{ superuserName: string; signupMode: string; defaultGroupLevel: string; workspaceName: string }>;
      startCalls: number;
    };
  };
  fixtureState.__installFixture ??= { verifyCalls: 0, verifiedTokens: [], commitCalls: 0, committedInputs: [], startCalls: 0 };

  return (
    <PreAuthScreen
      screen="install"
      onInstallVerify={async (token) => {
        fixtureState.__installFixture!.verifyCalls += 1;
        fixtureState.__installFixture!.verifiedTokens.push(token);
        if (token === 'invalid-token') throw new ApiError(401);
        return 'fixture-session';
      }}
      onInstallCommit={async (input) => {
        commitAttempts.current += 1;
        fixtureState.__installFixture!.commitCalls += 1;
        fixtureState.__installFixture!.committedInputs.push({
          superuserName: input.superuserName,
          signupMode: input.signupMode,
          defaultGroupLevel: input.defaultGroupLevel,
          workspaceName: input.workspaceName,
        });
        if (commitAttempts.current === 1) {
          throw new ApiError(400, undefined, { rule: 'workspace-failed' });
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }}
      onInstallStart={() => {
        fixtureState.__installFixture!.startCalls += 1;
        document.documentElement.dataset.installStarted = 'true';
      }}
    />
  );
}

createRoot(document.querySelector('#root')!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
