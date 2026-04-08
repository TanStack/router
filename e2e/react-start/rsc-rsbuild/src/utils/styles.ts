/**
 * Shared client-side styles for RSC E2E tests.
 * Green = Client Interactive
 */

export const clientStyles = {
  container: {
    backgroundColor: '#dcfce7',
    border: '2px solid #16a34a',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  badge: {
    display: 'inline-block',
    backgroundColor: '#16a34a',
    color: 'white',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 'bold' as const,
    letterSpacing: '0.5px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  button: {
    padding: '8px 16px',
    borderRadius: '6px',
    border: 'none',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
    fontSize: '13px',
  },
  primaryButton: {
    backgroundColor: '#16a34a',
    color: 'white',
  },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
    color: '#334155',
  },
}

export const pageStyles = {
  container: {
    padding: '20px',
    maxWidth: '800px',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '24px',
    color: '#1e293b',
  },
  description: {
    color: '#64748b',
    marginBottom: '20px',
    lineHeight: '1.5',
  },
}
