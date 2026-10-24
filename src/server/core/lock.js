let writeLockHeld_ = false;
function requireWriteLock_() {
  if (!writeLockHeld_)
    throw new AppError("lock_required", "書込にはロックが必要です。");
}
function withLock_(fn) {
  if (writeLockHeld_) return fn();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(Settings.lockWaitMs()))
    throw new AppError("busy", "処理中です。同じ要求で再試行してください。");
  writeLockHeld_ = true;
  try {
    return fn();
  } finally {
    writeLockHeld_ = false;
    lock.releaseLock();
  }
}
