// Vitest setup — runs before each test file
import { vi, beforeEach } from 'vitest';

// Mock @tauri-apps/api/core so tests don't require Tauri runtime
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (_cmd: string, _args?: unknown) => {
    return {};
  }),
}));

// Mock @tauri-apps/api/event (in case any code imports it)
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async () => ({ unsubscribe: () => {} })),
  emit: vi.fn(async () => {}),
}));

// Mock matchMedia (jsdom doesn't implement it)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});
