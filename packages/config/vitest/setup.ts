import '@testing-library/jest-dom/vitest';

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Same reasoning as ResizeObserver above — Embla (the shadcn/ui Carousel's
// engine) also watches slide visibility via IntersectionObserver, which
// jsdom doesn't implement either.
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    root = null;
    rootMargin = '';
    thresholds: ReadonlyArray<number> = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

// jsdom has no layout engine, so it never implements matchMedia — needed by
// Embla (the shadcn/ui Carousel's engine), which reads it on init regardless
// of whether a consumer actually sets a `breakpoints` option.
if (typeof globalThis.matchMedia === 'undefined') {
  globalThis.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
