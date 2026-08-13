/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.jsx';

vi.mock('./visualization/Visualization3D.jsx', () => ({
  default: function Visualization3DStub() {
    return <main aria-label="Drone path-planning workspace" />;
  }
}));

afterEach(cleanup);

describe('App', () => {
  it('mounts the 3D visualization workspace without creating WebGL', () => {
    render(<App />);

    expect(
      screen.getByRole('main', { name: 'Drone path-planning workspace' })
    ).toBeInTheDocument();
  });
});
