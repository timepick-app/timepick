import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from '../ErrorBoundary';

function Boom(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('affiche le fallback quand un enfant lève une erreur', () => {
    // Supprime le bruit console attendu de React + ErrorBoundary
    vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );

    expect(screen.getByText(/erreur est survenue/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recharger la page/i })).toBeInTheDocument();
  });

  it('rend les enfants normaux sans afficher le fallback', () => {
    render(
      <ErrorBoundary>
        <div>ok</div>
      </ErrorBoundary>,
    );

    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(screen.queryByText(/erreur est survenue/i)).not.toBeInTheDocument();
  });
});
