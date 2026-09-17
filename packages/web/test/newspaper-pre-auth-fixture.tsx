import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';

import { PreAuthScreen, type PreAuthScreenId } from '../src/auth/PreAuthScreen.js';

declare global {
  interface Window {
    authRequests: Array<{ nameLength: number; passwordLength: number; screen: string }>;
  }
}

const parameters = new URLSearchParams(location.search);
const initialScreen = parameters.get('screen') === 'signup' ? 'signup' : 'login';
const state = parameters.get('state') ?? 'initial';
window.authRequests = [];

function Fixture() {
  const [screen, setScreen] = useState<PreAuthScreenId>(initialScreen);
  const submit = (current: 'login' | 'signup') => async (input: { name: string; password: string }) => {
    window.authRequests.push({ nameLength: input.name.length, passwordLength: input.password.length, screen: current });
    if (state === 'pending') return new Promise<string | undefined>(() => undefined);
    if (state === 'error') return '승인 대기 중 — 아주 긴 한글 상태 설명이 줄바꿈되어도 마지막 조작을 가리지 않아야 합니다.';
    return undefined;
  };

  return (
    <PreAuthScreen
      screen={screen}
      onLogin={submit('login')}
      onSignup={submit('signup')}
      onScreen={setScreen}
    />
  );
}

createRoot(document.querySelector('#root')!).render(<StrictMode><Fixture /></StrictMode>);
