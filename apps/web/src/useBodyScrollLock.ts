import { useEffect } from 'react';

const lockedClassName = 'modalBodyLocked';
let lockCount = 0;

export function useBodyScrollLock(isLocked: boolean) {
  useEffect(() => {
    if (!isLocked) return;

    lockCount += 1;
    document.documentElement.classList.add(lockedClassName);
    document.body.classList.add(lockedClassName);

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount > 0) return;
      document.documentElement.classList.remove(lockedClassName);
      document.body.classList.remove(lockedClassName);
    };
  }, [isLocked]);
}
