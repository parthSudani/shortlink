import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthPage } from './AuthPage';

const { authenticate } = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('../features/auth/AuthContext', () => ({ useAuth: () => ({ authenticate }) }));

describe('authentication form', () => {
  it('shows field-specific validation and skips the request for empty registration', async () => {
    render(<MemoryRouter><AuthPage mode="register" /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('Enter your email address.')).toBeInTheDocument();
    expect(screen.getByText('Enter your password.')).toBeInTheDocument();
    expect(authenticate).not.toHaveBeenCalled();
  });
});
