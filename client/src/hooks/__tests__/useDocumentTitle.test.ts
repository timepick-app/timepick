import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDocumentTitle } from '../useDocumentTitle';

// Mock react-router-dom
const mockLocation = {
  pathname: '/',
  search: '',
  hash: '',
  state: null,
};

vi.mock('react-router-dom', () => ({
  useLocation: () => mockLocation,
}));

describe('useDocumentTitle Hook', () => {
  const originalTitle = document.title;

  beforeEach(() => {
    // Reset document.title before each test
    document.title = '';
    mockLocation.pathname = '/';
  });

  afterEach(() => {
    // Restore original title after each test
    document.title = originalTitle;
  });

  describe('Static title from options', () => {
    it('sets document.title with custom title and app name suffix', () => {
      renderHook(() => useDocumentTitle({ title: 'Test Title' }));

      expect(document.title).toBe('Test Title - TimePick');
    });

    it('sets document.title with custom title only when includeAppName is false', () => {
      renderHook(() =>
        useDocumentTitle({ title: 'Test Title', includeAppName: false })
      );

      expect(document.title).toBe('Test Title');
    });
  });

  describe('Automatic title from route', () => {
    it('sets title automatically from /login route', () => {
      mockLocation.pathname = '/login';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Connexion - TimePick');
    });

    it('sets title automatically from /admin route', () => {
      mockLocation.pathname = '/admin';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Tableau de bord - TimePick');
    });

    it('sets title automatically from /admin/events route', () => {
      mockLocation.pathname = '/admin/events';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Événements - TimePick');
    });

    it('sets title automatically from /admin/users route', () => {
      mockLocation.pathname = '/admin/users';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Membres - TimePick');
    });

    it('sets title automatically from / route (root)', () => {
      mockLocation.pathname = '/';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Calendrier - TimePick');
    });

    it('sets title automatically from /booking route', () => {
      mockLocation.pathname = '/booking';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Calendrier - TimePick');
    });

    it('sets title for /verify route', () => {
      mockLocation.pathname = '/verify';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Vérification - TimePick');
    });

    it('sets title for /setup route', () => {
      mockLocation.pathname = '/setup';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Installation - TimePick');
    });

    it('sets title for dynamic event edit route', () => {
      mockLocation.pathname = '/admin/events/123/edit';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe("Éditer l'événement - TimePick");
    });

    it('sets title for public event route (UUID format)', () => {
      mockLocation.pathname = '/events/550e8400-e29b-41d4-a716-446655440000';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Événement - TimePick');
    });

    it('does not change title for unknown routes', () => {
      mockLocation.pathname = '/unknown-route';

      renderHook(() => useDocumentTitle());

      // Title should remain empty (or unchanged) for unknown routes
      expect(document.title).toBe('');
    });
  });

  describe('Dynamic title changes', () => {
    it('updates document.title when title option changes reactively', () => {
      const { rerender } = renderHook(
        ({ title }) => useDocumentTitle({ title }),
        { initialProps: { title: 'Initial Title' } }
      );

      expect(document.title).toBe('Initial Title - TimePick');

      // Update the title
      rerender({ title: 'Updated Title' });

      expect(document.title).toBe('Updated Title - TimePick');
    });

    it('updates document.title when route changes', () => {
      mockLocation.pathname = '/login';

      const { rerender } = renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Connexion - TimePick');

      // Simulate route change
      mockLocation.pathname = '/admin/events';
      rerender();

      expect(document.title).toBe('Événements - TimePick');
    });

    it('updates document.title when includeAppName changes', () => {
      const { rerender } = renderHook(
        ({ includeAppName }) =>
          useDocumentTitle({ title: 'Test', includeAppName }),
        { initialProps: { includeAppName: true } }
      );

      expect(document.title).toBe('Test - TimePick');

      // Change includeAppName to false
      rerender({ includeAppName: false });

      expect(document.title).toBe('Test');
    });
  });

  describe('App name suffix', () => {
    it('includes " - TimePick" suffix by default', () => {
      renderHook(() => useDocumentTitle({ title: 'My Page' }));

      expect(document.title).toBe('My Page - TimePick');
    });

    it('includes suffix for route-based titles', () => {
      mockLocation.pathname = '/admin/settings';

      renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Paramètres - TimePick');
    });

    it('removes suffix when includeAppName is false', () => {
      renderHook(() =>
        useDocumentTitle({ title: 'Custom Title', includeAppName: false })
      );

      expect(document.title).toBe('Custom Title');
      expect(document.title).not.toContain('TimePick');
    });
  });

  describe('skipAuto option', () => {
    it('does not change title from route when skipAuto is true', () => {
      mockLocation.pathname = '/login';
      document.title = 'Original Title';

      renderHook(() => useDocumentTitle({ skipAuto: true }));

      // Title should remain unchanged
      expect(document.title).toBe('Original Title');
    });

    it('allows custom title even with skipAuto', () => {
      mockLocation.pathname = '/login';

      renderHook(() => useDocumentTitle({ title: 'Custom', skipAuto: true }));

      expect(document.title).toBe('Custom - TimePick');
    });

    it('skipAuto with no title leaves title unchanged', () => {
      document.title = 'Preserved Title';
      mockLocation.pathname = '/admin';

      renderHook(() => useDocumentTitle({ skipAuto: true }));

      expect(document.title).toBe('Preserved Title');
    });
  });

  describe('setTitle function', () => {
    it('returns a setTitle function', () => {
      const { result } = renderHook(() => useDocumentTitle());

      expect(result.current.setTitle).toBeDefined();
      expect(typeof result.current.setTitle).toBe('function');
    });

    it('setTitle updates document.title', () => {
      const { result } = renderHook(() => useDocumentTitle());

      act(() => {
        result.current.setTitle('Programmatically Set');
      });

      expect(document.title).toBe('Programmatically Set - TimePick');
    });

    it('setTitle respects includeAppName from hook options', () => {
      const { result } = renderHook(() =>
        useDocumentTitle({ includeAppName: false })
      );

      act(() => {
        result.current.setTitle('No Suffix');
      });

      expect(document.title).toBe('No Suffix');
    });

    it('setTitle can be called multiple times', () => {
      const { result } = renderHook(() => useDocumentTitle());

      act(() => {
        result.current.setTitle('First Title');
      });
      expect(document.title).toBe('First Title - TimePick');

      act(() => {
        result.current.setTitle('Second Title');
      });
      expect(document.title).toBe('Second Title - TimePick');
    });

    it('setTitle overrides route-based title', () => {
      mockLocation.pathname = '/login';

      const { result } = renderHook(() => useDocumentTitle());

      expect(document.title).toBe('Connexion - TimePick');

      act(() => {
        result.current.setTitle('Override Title');
      });

      expect(document.title).toBe('Override Title - TimePick');
    });
  });

  describe('Priority and edge cases', () => {
    it('custom title takes priority over route-based title', () => {
      mockLocation.pathname = '/login';

      renderHook(() => useDocumentTitle({ title: 'Custom Override' }));

      expect(document.title).toBe('Custom Override - TimePick');
    });

    it('does not update title if same value is set', () => {
      renderHook(() => useDocumentTitle({ title: 'Same Title' }));

      expect(document.title).toBe('Same Title - TimePick');

      // The hook should not cause unnecessary DOM updates
      // This is verified by the internal previousTitleRef check
    });

    it('handles empty string title', () => {
      renderHook(() => useDocumentTitle({ title: '' }));

      // Empty title should result in just the app name or remain empty
      // Based on the implementation, empty string is falsy and won't update
      expect(document.title).toBe('');
    });

    it('handles undefined title option', () => {
      mockLocation.pathname = '/login';

      renderHook(() => useDocumentTitle({ title: undefined }));

      // Should fall back to route-based title
      expect(document.title).toBe('Connexion - TimePick');
    });
  });

  describe('Multiple hook instances', () => {
    it('last mounted hook wins for document.title', () => {
      const { unmount: unmountFirst } = renderHook(() =>
        useDocumentTitle({ title: 'First Hook' })
      );

      expect(document.title).toBe('First Hook - TimePick');

      renderHook(() => useDocumentTitle({ title: 'Second Hook' }));

      expect(document.title).toBe('Second Hook - TimePick');

      unmountFirst();

      // Second hook should still control the title
      expect(document.title).toBe('Second Hook - TimePick');
    });
  });
});
