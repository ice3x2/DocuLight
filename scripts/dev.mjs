#!/usr/bin/env node
/**
 * DocuLight 2.0 개발 기동 — API(Express)와 web(Vite)을 함께 띄운다.
 *
 * **로직이 이 파일 하나에만 있는 이유.** 진입점은 `dev.sh` · `dev.bat` ·
 * `npm run dev:all` 셋이지만 전부 이 파일을 부르기만 한다. 각자 같은 일을
 * 적으면 하나만 고쳐지고 나머지가 조용히 어긋난다.
 *
 * **개발에서 볼 주소는 web 포트 하나다.** API 포트를 브라우저로 열면
 * 서버가 `packages/web/dist` 의 **빌드 산출물**을 답한다 — 소스를 고쳐도
 * 바뀌지 않는 옛 화면이다. 그래서 이 스크립트는 web 주소만 안내한다.
 * (그 자리가 아직 빌드된 적 없는 클론에서는 오류가 돌아온다. 어느 쪽이든
 * 그 포트를 브라우저로 열 이유가 없다는 결론은 같다.)
 */

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readFileSync, writeSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IS_WINDOWS = process.platform === 'win32';
const COLOR = process.stdout.isTTY === true;

// 날 ESC 바이트를 소스에 두지 않는다 — 편집기와 diff 에서 보이지 않고,
// 이 저장소는 날 NUL 이 `git diff` 를 죽인 일을 이미 겪었다(커밋 14b3675).
const ESC = String.fromCharCode(27);

function paint(code, text) {
  return COLOR ? `${ESC}[${code}m${text}${ESC}[0m` : text;
}

/**
 * 기동을 포기하고 사유를 남긴다.
 *
 * **`process.stderr.write` 가 아니라 `writeSync` 를 쓴다.** Windows 의 TTY
 * 쓰기는 비동기라, 그 뒤에 바로 `process.exit` 를 부르면 메시지가 다 나가기
 * 전에 프로세스가 끝날 수 있다. 이 함수가 모든 진단의 유일한 통로이므로
 * 잘리면 사용자에게 남는 것이 없다.
 */
function die(message, hint) {
  writeSync(2, `${paint('31', '기동할 수 없다')} — ${message}\n`);
  if (hint !== undefined) writeSync(2, `  ${hint}\n`);
  process.exit(2);
}

/**
 * 포트 번호를 이 파일에 적지 않는다.
 *
 * 두 값의 정의 지점은 각각 하나뿐이고(`packages/server/.env.development`
 * 와 `packages/web/vite.config.ts`), `vite.config.ts` 자신도 API 포트를
 * 앞의 파일에서 읽는다. 여기에 번호를 다시 적으면 정의 지점을 옮겼을 때
 * 기동 스크립트만 옛 번호를 가리켜, 프록시는 맞는데 안내가 틀린다.
 *
 * **API 포트를 이렇게 읽는 자리는 여기가 둘째다** — `vite.config.ts` 의
 * `devApiPort()` 가 같은 파일에 같은 정규식을 건다. 공용 모듈로 빼지 않은
 * 이유는 그쪽이 `.ts` 설정 파일이고 이쪽이 저장소 루트의 `.mjs` 라, 한 줄
 * 정규식을 공유하려고 언어 경계를 넘는 모듈을 새로 세우는 편이 더 비싸기
 * 때문이다. 대신 그 사실을 여기 적어 둔다 — `.env.development` 의 `PORT` 를
 * 옮기는 사람이 고칠 자리가 **둘**이다.
 *
 * **후보가 둘 이상이면 고르지 않고 멈춘다.** 첫 매치를 잡으면 나중에
 * `preview.port` 나 `server.hmr.port` 가 위에 붙었을 때 조용히 다른 번호를
 * 읽어, 서버는 제자리에 뜨는데 안내만 틀린 상태가 된다.
 */
function readPort(relativePath, pattern, label) {
  const file = join(ROOT, relativePath);
  if (!existsSync(file)) die(`${relativePath} 이 없어 ${label} 포트를 읽을 수 없다.`);

  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const found = [...readFileSync(file, 'utf8').matchAll(new RegExp(pattern.source, flags))];

  if (found.length === 0) die(`${relativePath} 에서 ${label} 포트를 찾지 못했다.`);
  if (found.length > 1) {
    die(
      `${relativePath} 에 ${label} 포트 후보가 ${found.length} 개 있어 어느 것인지 정할 수 없다.`,
      `찾은 값: ${found.map((m) => m[1]).join(', ')}`,
    );
  }
  return Number(found[0][1]);
}

/** `.env` 형식 파일에서 키 하나를 읽는다. 없으면 `undefined` 다. */
function readEnvValue(relativePath, key) {
  const file = join(ROOT, relativePath);
  if (!existsSync(file)) return undefined;
  const found = new RegExp(`^\\s*${key}\\s*=\\s*(.+)$`, 'm').exec(readFileSync(file, 'utf8'));
  return found?.[1].trim();
}

/** 그 주소에 붙어 보고 `EADDRINUSE` 가 나는지 본다. */
function bindConflicts(port, host) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', (error) => done(error.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => done(false)));
    if (host === undefined) probe.listen(port);
    else probe.listen(port, host);
  });
}

/**
 * 포트가 이미 쓰이는지 본다.
 *
 * **와일드카드 하나로는 부족하다.** Vite 의 기본 host 는 `localhost` 라
 * 루프백에만 붙는데(`vite` 의 `resolveServerOptions`), Windows 에서 와일드카드
 * 바인드는 그것과 충돌하지 않는다 — 2026-09-04 실측에서 `127.0.0.1` 전용과
 * `::1` 전용 리스너를 와일드카드 탐침이 **둘 다 놓쳤다**. 그래서 세 주소를
 * 모두 본다.
 *
 * **이 검사가 필요한 정도는 Vite 쪽이 더 크다.** API 는 포트가 막히면 죽어서
 * 눈에 띄지만, Vite 는 `strictPort` 가 없어 **조용히 다음 빈 포트로 옮겨
 * 뜬다** — 그러면 우리가 안내한 주소에 엉뚱한 서버가 앉아 있다.
 *
 * IPv6 가 없는 기계에서 `::1` 바인드는 `EADDRNOTAVAIL` 로 실패하는데, 그것은
 * `EADDRINUSE` 가 아니므로 「비었다」로 접힌다.
 */
async function portInUse(port) {
  for (const host of [undefined, '127.0.0.1', '::1']) {
    if (await bindConflicts(port, host)) return true;
  }
  return false;
}

/**
 * 자식이 남긴 손자까지 정리한다.
 *
 * `npm run dev` 는 자기 아래에 `tsx` 나 `vite` 를 하나 더 만들고, 셸을
 * 거치므로 그 위에 셸이 하나 더 있다. 맨 위만 죽이면 아래가 포트를 쥔 채
 * 살아남아 다음 기동이 EADDRINUSE 로 죽는다 — 2026-09-04 실측에서 Vite 가
 * 실제로 그렇게 남아 `taskkill /t` 로 걷어내야 했다.
 *
 * **맨 위가 이미 죽었는지 보고 되돌아가지 않는다.** 이 함수가 트리를 겨누는
 * 이유가 바로 「맨 위가 죽어도 아래가 남는다」이므로, 맨 위의 종료를 근거로
 * 건너뛰면 그 이유를 스스로 지운다. 되돌아가는 유일한 경우는 붙일 프로세스가
 * 애초에 없을 때다.
 *
 * **동기로 죽인다.** `process.on('exit')` 는 비동기 작업을 기다려 주지 않아,
 * 여기서 `spawn` 을 쓰면 마지막 방어가 예약만 되고 실행되지 않는다.
 */
function killTree(child) {
  if (child.pid === undefined) return;
  if (IS_WINDOWS) {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }
  try {
    // 음수 PID = 그 프로세스 그룹 전체. `detached: true` 로 띄웠기에 성립한다.
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

/**
 * 그 포트를 쥔 프로세스를 찾아 준다.
 *
 * 「누가 쓰고 있다」까지만 말하면 사람이 다시 `netstat` 을 돌려 PID 를
 * 찾아야 한다. 그 한 단계가 흔하게 반복되므로 여기서 미리 세어 준다.
 * 찾지 못하면 `null` 이고, 그때는 조회 명령만 안내한다.
 */
function findPortHolder(port) {
  if (!IS_WINDOWS) return null;
  const probe = spawnSync('netstat', ['-ano'], { encoding: 'utf8' });
  const listening = (probe.stdout ?? '')
    .split('\n')
    .find((line) => line.includes('LISTENING') && new RegExp(`:${port}\\s`).test(line));
  const pid = listening?.trim().split(/\s+/).pop();
  return pid !== undefined && /^\d+$/.test(pid) ? pid : null;
}

function prefixLines(stream, prefix, sink, onLine) {
  let carry = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    carry += chunk;
    const lines = carry.split('\n');
    carry = lines.pop() ?? '';
    for (const line of lines) {
      sink.write(`${prefix} ${line}\n`);
      if (onLine !== undefined) onLine(line);
    }
  });
  stream.on('end', () => {
    if (carry.length > 0) sink.write(`${prefix} ${carry}\n`);
  });
  // 자식이 죽으면 파이프가 끊긴다. 그것은 정상 경로에서도 일어나는데,
  // 받아 두지 않으면 미처리 예외로 올라가 종료 사유를 가린다.
  stream.on('error', () => {});
}

async function main() {
  if (process.argv.length > 2) {
    die(
      `이 스크립트는 인자를 받지 않는다 — 받은 것: ${process.argv.slice(2).join(' ')}`,
      '포트와 데이터 경로는 저장소 파일에서 읽는다. 그 값을 바꾸려면 그 파일을 고쳐라.',
    );
  }

  if (!existsSync(join(ROOT, 'node_modules'))) {
    die('의존성이 설치돼 있지 않다.', '저장소 루트에서 `npm install` 을 먼저 실행하라.');
  }

  const apiPort = readPort('packages/server/.env.development', /^\s*PORT\s*=\s*(\d+)/m, 'API');
  const webPort = readPort('packages/web/vite.config.ts', /^\s*port:\s*(\d+)/m, 'web');

  for (const [port, label] of [
    [apiPort, 'API'],
    [webPort, 'web'],
  ]) {
    if (await portInUse(port)) {
      const holder = findPortHolder(port);
      die(
        holder === null
          ? `${label} 포트 ${port} 를 다른 프로세스가 쓰고 있다.`
          : `${label} 포트 ${port} 를 PID ${holder} 가 쓰고 있다.`,
        holder !== null
          ? `그것이 앞선 개발 서버가 남긴 것이라면: taskkill /PID ${holder} /T /F`
          : IS_WINDOWS
            ? `누구인지 보려면: netstat -ano | findstr :${port}`
            : `누구인지 보려면: lsof -i :${port}`,
      );
    }
  }

  /**
   * 데이터 자리를 못박는다.
   *
   * 서버는 이 값이 없으면 `process.cwd()` 아래를 쓴다. 그러면 어디서
   * 띄웠느냐에 따라 데이터가 다른 곳에 생겨 「어제 만든 문서가 사라졌다」가
   * 된다.
   *
   * **`PORT` 와 같은 순서로 읽는다** — 셸에 있으면 그것, 없으면
   * `.env.development`, 그것도 없으면 기본값이다. 이 자리에서 `.env` 를
   * 건너뛰면 그 파일에 값을 적은 사람이 `npm run dev --workspace` 로는 먹고
   * 이 스크립트로는 무시되는 비대칭을 겪는다.
   */
  const dataDir =
    process.env.DOCULIGHT_DATA_DIR ??
    readEnvValue('packages/server/.env.development', 'DOCULIGHT_DATA_DIR') ??
    join(ROOT, 'packages/server/.doculight-data');

  /**
   * 셸에 박힌 `PORT` 를 덮는다.
   *
   * Node 의 `--env-file` 은 **이미 있는 환경변수를 덮어쓰지 않는다**. 그래서
   * 셸에 `PORT` 가 박힌 기계에서는 `.env.development` 의 값이 무시되고 서버가
   * 엉뚱한 포트로 뜬다 — 2026-09-04 실측에서 `PORT=2002` 가 박혀 있어 기동이
   * EADDRINUSE 로 죽었다. 여기서 명시하면 그 오염이 닿지 않는다.
   */
  const apiEnv = { ...process.env, PORT: String(apiPort), DOCULIGHT_DATA_DIR: dataDir };

  /**
   * web 에는 셸의 `PORT` 와 `NODE_ENV` 를 물려주지 않는다.
   *
   * `NODE_ENV` 쪽이 중요하다. Vite 는 그 값이 **이미 있으면 자기 기본값으로
   * 덮지 않으므로**, 셸에 `production` 이 박힌 기계에서는 `vite dev` 인데도
   * `isProduction` 이 참이 된다. 그러면 `@vitejs/plugin-react` 가
   * `skipFastRefresh` 를 세워 React Fast Refresh 를 아예 끄고, 아래에서
   * 우리가 인쇄하는 「web 은 HMR」이 거짓이 된다. 이 저장소의 셸에는 실제로
   * `production` 이 박혀 있다 — `packages/web/vite.config.ts` 가 같은 오염을
   * 시험 경로에서 덮고 있는 것이 그 증거다.
   *
   * `PORT` 는 Vite 가 보지 않지만, 오염된 값을 굳이 물려줄 이유도 없다.
   */
  const webEnv = { ...process.env };
  delete webEnv.PORT;
  delete webEnv.NODE_ENV;

  process.stdout.write(`${paint('1', 'DocuLight 2.0 개발 서버')}\n`);
  process.stdout.write(`  화면   ${paint('36', `http://localhost:${webPort}/`)}  ← 여기를 연다\n`);
  process.stdout.write(`  API    http://localhost:${apiPort}/  (web 이 /api 를 여기로 넘긴다)\n`);
  process.stdout.write(`  데이터 ${dataDir}\n`);
  process.stdout.write(
    `  ${paint('2', '소스를 고치면 그대로 반영된다 — API 는 재기동, web 은 HMR.')}\n`,
  );
  process.stdout.write(
    `  ${paint('2', `API 포트를 브라우저로 열면 낡은 빌드 산출물이 나온다. 화면은 ${webPort} 다.`)}\n\n`,
  );

  const children = [];
  let shuttingDown = false;

  function shutdown(code) {
    if (shuttingDown) {
      // 두 번째 신호는 「더 기다리지 않겠다」는 뜻이다. 첫 정리에 걸린 자식을
      // 두고라도 나간다 — 그러지 않으면 빠져나갈 길이 없다.
      writeSync(2, `${paint('31', '기다리지 않고 나간다.')} 남은 프로세스가 있을 수 있다.\n`);
      process.exit(1);
    }
    shuttingDown = true;
    for (const child of children) killTree(child);
    process.exitCode = code;
  }

  function start(name, colorCode, command, env) {
    /**
     * 셸을 거쳐 부른다.
     *
     * Windows 의 `npm` 은 `npm.cmd` 인데, Node 는 CVE-2024-27980 대응 이후
     * `.cmd` 를 `shell: false` 로 띄우면 `EINVAL` 을 던진다(2026-09-04 실측).
     * 셸을 거치면 계층이 하나 깊어지지만 `killTree` 가 트리를 겨누므로
     * 정리에는 영향이 없다.
     *
     * 인자를 배열이 아니라 **한 문자열**로 넘긴다. `shell: true` 에 배열을
     * 주면 Node 가 `DEP0190`(인자가 이스케이프되지 않는다) 경고를 내는데,
     * 그 경고가 매 기동마다 사용자 눈에 뜬다. 여기 명령은 이 파일에 박힌
     * 리터럴이고 바깥 입력이 섞이지 않으므로 합쳐도 그 위험이 없다.
     *
     * POSIX 에서는 `detached` 로 자기 프로세스 그룹을 갖게 한다 — 그래야
     * `killTree` 가 그룹째 정리할 수 있다. Windows 에서 켜면 새 콘솔 창이
     * 뜨므로 켜지 않는다.
     */
    const child = spawn(command, {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      detached: !IS_WINDOWS,
      windowsHide: true,
    });
    const prefix = paint(colorCode, `[${name}]`);

    let installHinted = false;
    function watchForInstall(line) {
      /**
       * 서버의 설치 안내를 개발용으로 바로잡는다.
       *
       * 설치 전이면 서버가 토큰을 내고 이어서 「이 서버의 {API 포트}로
       * /install 을 여십시오」라고 안내한다. 그 안내는 운영에서는 맞지만
       * 개발에서는 틀리다 — 그 주소는 `packages/web/dist` 의 **낡은 빌드
       * 산출물**을 답한다.
       *
       * 그래서 토큰 줄이 아니라 **그 안내 줄**을 신호로 삼는다. 토큰 줄에
       * 붙이면 정정이 서버의 틀린 안내보다 **앞**에 나와, 마지막으로 눈에
       * 남는 주소가 여전히 틀린 쪽이 된다.
       *
       * 이 문구는 `packages/server/src/main.ts` 의 안내문과 결합돼 있다.
       * 그쪽이 바뀌면 이 정정이 조용히 사라지므로 함께 고쳐야 한다.
       */
      if (installHinted || !line.includes('설치를 마치려면')) return;
      installHinted = true;
      process.stdout.write(
        `\n  ${paint('33', '개발에서는 그 주소가 아니다')} — 위 토큰을 들고 ` +
          `${paint('36', `http://localhost:${webPort}/install`)} 을 열어라.\n` +
          `  ${paint('2', `${apiPort} 포트는 낡은 빌드 산출물을 답한다.`)}\n` +
          `  ${paint('2', '서버 소스를 고치면 재기동하면서 토큰이 새로 발급된다. 그때는 새 값을 쓴다.')}\n\n`,
      );
    }

    prefixLines(child.stdout, prefix, process.stdout, name === 'api' ? watchForInstall : undefined);
    prefixLines(child.stderr, prefix, process.stderr);

    child.on('error', (error) => {
      process.stderr.write(`${prefix} 실행할 수 없다: ${error.message}\n`);
      shutdown(2);
    });
    child.on('exit', (code, signal) => {
      if (shuttingDown) return;
      const how = signal !== null ? `신호 ${signal}` : `종료 코드 ${code}`;
      process.stderr.write(
        `\n${prefix} ${paint('31', `먼저 끝났다 (${how}).`)} 나머지도 정리한다.\n`,
      );
      shutdown(code === 0 ? 1 : (code ?? 1));
    });

    children.push(child);
  }

  start('api', '36', 'npm run dev --workspace @doculight/server', apiEnv);
  start('web', '35', 'npm run dev --workspace @doculight/web', webEnv);

  /**
   * 마지막 방어.
   *
   * 아래 신호 핸들러가 정상 경로이고, 이 `exit` 는 그것이 돌지 못한 채
   * 프로세스가 끝나는 경우를 받는다 — 예외로 죽는 경우다. 그때 정리하지
   * 않으면 자식이 포트를 쥔 채 남아 다음 기동이 막힌다(2026-09-04 실측에서
   * 실제로 둘 다 남았다).
   *
   * 창을 강제로 닫거나 밖에서 강제 종료하면 이 핸들러도 돌지 않는다 —
   * Windows 에는 그 경로에 신호가 없다. 그렇게 남은 것은 다음 기동의 포트
   * 검사가 PID 와 함께 안내한다.
   *
   * `exit` 안에서는 비동기가 돌지 않으므로 `killTree` 가 동기여야 한다.
   */
  process.on('exit', () => {
    for (const child of children) killTree(child);
  });

  // `SIGBREAK` 는 Windows 전용이다. 다른 플랫폼에서 등록해도 예외는 나지
  // 않는다 — Node 는 모르는 이름을 평범한 이벤트로 받으므로 그저 발화하지
  // 않는다. 그래서 방어를 두지 않는다.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    process.on(signal, () => {
      process.stdout.write(`\n${paint('2', '정리하는 중…')}\n`);
      shutdown(0);
    });
  }
}

await main();
