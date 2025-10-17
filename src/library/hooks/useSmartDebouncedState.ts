import { useCallback, useEffect, useRef, useState } from "react";

type Equality<T> = (a: T, b: T) => boolean;

export interface UseSmartDebouncedStateOptions<T> {
  /** Fixed cooldown after a commit; calls inside fire once at lastCommit + interval */
  interval: number;
  /** Mini debounce when idle; 0 => commit immediately */
  immediate?: number;
  /** Custom equality; defaults to Object.is */
  isEqual?: Equality<T>;
}

export interface SmartDebouncedMeta {
  flush: () => void;
  cancel: () => void;
  pending: boolean;
  /** Epoch ms when the next commit is scheduled (or undefined if none) */
  nextCommitAt?: number;
}

export interface SetOptions {
  /**
   * If true, this call starts (or refreshes) the immediate mini-window and
   * LOCKS it so subsequent calls during that immediate window cannot reschedule/extend it.
   * Later calls still coalesce the value, but the deadline stays fixed.
   */
  noImmediateInterrupt?: boolean;
}

type Mode = "immediate" | "cooldown" | null;

export function useSmartDebouncedState<T>(
  initial: T,
  options: UseSmartDebouncedStateOptions<T>,
): [T, (next: T, opts?: SetOptions) => void, SmartDebouncedMeta] {
  const { interval, immediate = 0, isEqual = Object.is } = options;

  const [value, setValue] = useState<T>(initial);

  const lastCommitRef = useRef<number>(Number.NEGATIVE_INFINITY);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<Mode>(null);
  const pendingRef = useRef<T | undefined>(undefined);
  const lastRequestedRef = useRef<T>(initial);
  const nextCommitAtRef = useRef<number | undefined>(undefined);
  const immediateLockUntilRef = useRef<number | undefined>(undefined); // <-- NEW

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    modeRef.current = null;
    nextCommitAtRef.current = undefined;
    immediateLockUntilRef.current = undefined; // clear lock on timer clear
  }, []);

  const commit = useCallback(
    (next: T, at: number = Date.now()) => {
      clearTimer();
      pendingRef.current = undefined;
      if (!isEqual(value, next)) setValue(next);
      lastCommitRef.current = at;
    },
    [clearTimer, isEqual, value],
  );

  const scheduleAt = useCallback(
    (deadlineMs: number, asMode: Mode) => {
      clearTimer();
      modeRef.current = asMode;
      nextCommitAtRef.current = deadlineMs;
      const delay = Math.max(0, deadlineMs - Date.now());
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        modeRef.current = null;
        const pv = pendingRef.current;
        nextCommitAtRef.current = undefined;
        immediateLockUntilRef.current = undefined; // unlock at fire
        if (pv !== undefined) commit(pv, deadlineMs);
      }, delay);
    },
    [clearTimer, commit],
  );

  const set = useCallback(
    (next: T, opts?: SetOptions) => {
      // (5) No-op if same as previous *request* input
      if (isEqual(next, value)) return;
      lastRequestedRef.current = next;

      const now = Date.now();
      const cooldownDeadline = lastCommitRef.current + interval;
      const idle = now >= cooldownDeadline;

      // Always coalesce to the latest requested value
      pendingRef.current = next;

      if (idle) {
        if (immediate <= 0) {
          // No mini-window → commit immediately (unless same as state)
          if (!isEqual(value, next)) commit(next, now);
          else pendingRef.current = undefined;
          return;
        }

        // Immediate mini-window path
        const inImmediate = timerRef.current != null && modeRef.current === "immediate";
        const lockActive =
          inImmediate && immediateLockUntilRef.current !== undefined && now < immediateLockUntilRef.current;

        if (inImmediate && lockActive) {
          // A locked immediate window is running → DO NOT reschedule.
          // We only update the pending value (already done above).
          return;
        }

        const deadline = now + immediate;

        // Start/refresh immediate. If this call requests a lock, set/refresh the lock to this deadline.
        scheduleAt(deadline, "immediate");
        if (opts?.noImmediateInterrupt) {
          immediateLockUntilRef.current = deadline + (interval - immediate); // lock until end of cooldown after immediate
        } else {
          // If caller didn't request a lock, we clear any prior lock so future calls may reschedule
          immediateLockUntilRef.current = undefined;
        }
      } else {
        // Cooldown → fixed deadline (never extended)
        scheduleAt(cooldownDeadline, "cooldown");
        // Cooldown ignores immediate lock
        immediateLockUntilRef.current = undefined;
      }
    },
    [commit, immediate, interval, isEqual, scheduleAt, value],
  );

  const flush = useCallback(() => {
    const pv = pendingRef.current;
    if (pv !== undefined) commit(pv);
  }, [commit]);

  const cancel = useCallback(() => {
    pendingRef.current = undefined;
    clearTimer();
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return [
    value,
    set,
    {
      flush,
      cancel,
      pending: timerRef.current != null,
      nextCommitAt: nextCommitAtRef.current,
    },
  ];
}
