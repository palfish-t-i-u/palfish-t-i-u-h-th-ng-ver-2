import { lazy } from "react";

function retryImport<T>(load: () => Promise<T>, retries: number): Promise<T> {
  return load().catch((err) => {
    if (retries <= 0) throw err;
    return new Promise<T>((resolve) =>
      setTimeout(() => resolve(retryImport(load, retries - 1)), 1000),
    );
  });
}

export function lazyRetry<P extends object = object>(load: () => Promise<{ default: React.ComponentType<P> }>) {
  return lazy(() => retryImport(load, 2));
}
