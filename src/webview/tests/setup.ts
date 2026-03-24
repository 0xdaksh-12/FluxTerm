import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock acquireVsCodeApi
(global as any).acquireVsCodeApi = () => ({
  postMessage: vi.fn(),
  getState: vi.fn(),
  setState: vi.fn(),
});

// Mock codicons as they are not easily resolvable in JSDOM/Node
vi.mock('@vscode/codicons', () => ({}));
