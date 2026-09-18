export function waitForOwnedChildAfterInvariant(child, originalError, graceMs = 5_000, exitConfirmMs = 5_000) {
  return new Promise((_, reject) => {
    let terminationTimer;
    let exitConfirmationTimer;
    const finish = () => {
      clearTimeout(terminationTimer);
      clearTimeout(exitConfirmationTimer);
      child.off('exit', finish);
      reject(originalError);
    };
    child.once('exit', finish);
    if (child.exitCode !== null || child.signalCode !== null) {
      finish();
      return;
    }
    terminationTimer = setTimeout(() => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill();
      exitConfirmationTimer = setTimeout(() => {
        child.off('exit', finish);
        reject(new AggregateError([
          originalError,
          new Error(`owned checker PID ${child.pid} did not exit after invariant cleanup`),
        ]));
      }, exitConfirmMs);
    }, graceMs);
  });
}
