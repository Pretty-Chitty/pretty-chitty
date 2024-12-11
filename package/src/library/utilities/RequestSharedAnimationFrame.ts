let cbs: (() => void)[] = [];
let hasRequestedAnimationFrame = false;
function frameCb() {
  hasRequestedAnimationFrame = false;
  const oldCbs = cbs;
  cbs = [];
  oldCbs.forEach((cb) => cb());
}

export function requestSharedAnimationFrame(cb: () => void) {
  cbs.push(cb);
  if (!hasRequestedAnimationFrame) {
    hasRequestedAnimationFrame = true;
    requestAnimationFrame(frameCb);
  }
}
