import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../components/ui/dialog';

afterEach(cleanup);

it('retains Radix focus wrapping, Escape and trigger restoration after the motion redesign', async () => {
  render(<Dialog>
    <DialogTrigger>Open details</DialogTrigger>
    <DialogContent>
      <DialogHeader><DialogTitle>Service details</DialogTitle><DialogDescription>Read-only fixture</DialogDescription></DialogHeader>
      <button>First action</button><button>Last action</button>
    </DialogContent>
  </Dialog>);
  const trigger = screen.getByRole('button', { name: 'Open details' });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Service details' });
  expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
  const first = screen.getByRole('button', { name: 'First action' });
  const close = screen.getByRole('button', { name: 'Close' });
  await waitFor(() => expect(document.activeElement).toBe(first));
  close.focus();
  fireEvent.keyDown(close, { key: 'Tab' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(close);
  fireEvent.keyDown(close, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});
