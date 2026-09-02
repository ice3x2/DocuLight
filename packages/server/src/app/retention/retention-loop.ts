/**
 * 보존 기간 일소의 주기 작업 (`R84-a` · `REL-AUDIT-003` · `FR-STORAGE-006`).
 *
 * 감사 일소와 휴지통 일소를 **한 자리에서** 돈다. 같은 성질의 조작이고
 * (사람의 조작이 아니라 권한 판정도 감사 기록도 없다) 같은 주기로 충분하다 —
 * 나누면 타이머가 둘이 되고, 한쪽만 배선이 빠져도 그 사실이 드러나지 않는다.
 *
 * **일소 함수를 직접 받는다.** 두 저장소 타입을 여기서 합치면 이 모듈이
 * 감사와 휴지통 양쪽의 계약에 묶여, 어느 한쪽이 바뀔 때마다 함께 흔들린다 —
 * 이 모듈이 아는 것은 「주기로 두 가지를 돌린다」뿐이다.
 */
export interface RetentionSweeps {
  /** 보존 기간이 지난 감사 행을 소멸시킨다 (`REL-AUDIT-003`). */
  sweepAudit: () => { purged: number };
  /** 보존 기간이 지난 휴지통 항목을 영구 삭제한다 (`FR-STORAGE-006`). */
  sweepTrash: () => Promise<{ purged: number }>;
}

export interface RetentionLoop {
  stop(): Promise<void>;
}

/**
 * 운영 기본 간격 — 한 시간.
 *
 * 보존 기간의 단위가 **일**이므로 분 단위로 돌 이유가 없다. 짧게 잡으면
 * 큰 인스턴스에서 일소 질의가 계속 돌면서 얻는 것이 없다.
 */
export const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

/** 던져진 것이 `Error` 라는 보장이 없다 — 무엇이든 던질 수 있다. */
const reasonOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export function startRetentionLoop(
  sweeps: RetentionSweeps,
  options: {
    /**
     * 실패한 회차를 운영자에게 내는 자리.
     *
     * **선택 인자로 두지 않는다.** 이 인자가 생긴 이유가 바로 「아무도
     * 구독하지 않는 선택적 관측 자리」였다 — 아래 `onRun` 이 실패를 실어
     * 보낼 수 있었는데 제품 조립이 그것을 넘기지 않아, 일소가 한 건도
     * 지우지 못하는 전면 장애가 배포 주기 내내 로그 한 줄 없이 가려졌다.
     * 필수로 두면 배선을 빠뜨린 조립이 컴파일되지 않는다
     * (선례: `AuditRetentionStores.transaction`). 다만 그것이 막는 것은
     * **빠뜨림**뿐이라 **바꿔치기**는 조립 시험이 따로 잰다
     * (`test/app/retention/retention-assembly.test.ts`).
     *
     * **이 함수가 던지는 경우를 막지 않는다.** 던지면 회차가 거부되고 그
     * 거부를 받는 자리가 없어 프로세스가 내려간다. 그런데 제품이 넘기는
     * 것은 전역 `console.log` 이고, 그것은 출력이 실패해도 던지지 않는다
     * (전역 console 의 `ignoreErrors` 기본값이 참이다. Node v24.16.0 에서
     * 실측했다). 그 경로를 막겠다고 여기에 `catch` 를 두면 이번에 없앤
     * 빈 `catch` 가 한 층 위에 그대로 되살아난다.
     */
    announce: (line: string) => void;
    intervalMs?: number;
    /** 한 회차가 끝났다. 실패한 쪽은 `undefined` 로 온다. */
    onRun?: (result: { audit?: number; trash?: number }) => void;
  },
): RetentionLoop {
  let stopped = false;
  let inFlight: Promise<void> | undefined;

  const once = async () => {
    const result: { audit?: number; trash?: number } = {};

    // **한쪽 실패가 다른 쪽을 막지 않는다.** 막으면 감사 일소의 오류
    // 하나로 휴지통 보존이 통째로 멈추고, 멈춘 사실은 아무 데도 드러나지
    // 않는다 — 다음 회차도 같은 자리에서 죽기 때문이다.
    //
    // **삼키되 남긴다.** 삼키는 이유는 그대로다 — 이 조작에는 보고할
    // 사용자가 없고, 감사 기록을 남기면 그 행이 다시 만료 대상이 되어
    // 끝없이 자기를 참조한다. 그러나 아무 데도 남기지 않으면 일소가 한
    // 건도 지우지 못하는 상태와 정상이 **구별되지 않는다.** 성공한 회차는
    // 조용하다 — 회차마다 한 줄씩 쌓이면 정작 실패한 줄이 그 안에 묻힌다.
    try {
      result.audit = sweeps.sweepAudit().purged;
    } catch (error) {
      options.announce(`감사 보존 일소가 실패했습니다: ${reasonOf(error)}`);
    }
    try {
      result.trash = (await sweeps.sweepTrash()).purged;
    } catch (error) {
      options.announce(`휴지통 보존 일소가 실패했습니다: ${reasonOf(error)}`);
    }

    if (!stopped) options.onRun?.(result);
  };

  const run = () => {
    // 앞 회차가 아직 돌고 있으면 건너뛴다 — 겹치면 같은 항목을 둘이
    // 지우려 들고, 뒤엣것은 없는 것을 지운다.
    if (stopped || inFlight !== undefined) return;
    inFlight = once().finally(() => {
      inFlight = undefined;
    });
  };

  const first = setTimeout(run, 0);
  const timer = setInterval(run, options.intervalMs ?? RETENTION_INTERVAL_MS);

  // 타이머가 이벤트 루프를 잡지 않게 한다. 잡으면 할 일이 끝난 프로세스가
  // `close()` 를 부르기 전까지 종료하지 못한다.
  first.unref?.();
  timer.unref?.();

  return {
    async stop() {
      stopped = true;
      clearTimeout(first);
      clearInterval(timer);
      await inFlight;
    },
  };
}
