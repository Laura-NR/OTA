import { createElement } from 'react';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { AccordionItem } from '../src/components/accordion';
import { Alert } from '../src/components/alert';
import { Button } from '../src/components/button';
import { Counter, clampCount } from '../src/components/counter';
import { CrisisBanner } from '../src/components/crisis-banner';
import { Dialog } from '../src/components/dialog';
import { Field } from '../src/components/field';
import { Input } from '../src/components/input';
import { Stepper } from '../src/components/stepper';
import { Tabs, nextTabIndex } from '../src/components/tabs';

const html = (element: ReactElement) => renderToStaticMarkup(element);
const noop = () => undefined;

describe('Field (T-Forms §00)', () => {
  it('ties the helper to the control', () => {
    const markup = html(
      createElement(Field, {
        id: 'email',
        label: 'Email',
        hint: 'We send your confirmation here.',
        children: (control) => createElement(Input, control),
      }),
    );
    expect(markup).toContain('for="email"');
    expect(markup).toContain('aria-describedby="email-hint"');
    expect(markup).not.toContain('aria-invalid');
  });

  it('replaces the helper with an announced error and marks the control invalid', () => {
    const markup = html(
      createElement(Field, {
        id: 'email',
        label: 'Email',
        hint: 'We send your confirmation here.',
        error: 'Check it ends with a domain.',
        required: true,
        children: (control) => createElement(Input, control),
      }),
    );
    expect(markup).toContain('aria-describedby="email-error"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain('We send your confirmation here.');
  });
});

describe('Button', () => {
  it('is busy and disabled while loading, keeping its in-progress label', () => {
    const markup = html(createElement(Button, { loading: true }, 'Sending request…'));
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('Sending request…');
    expect(markup).toContain('href="#icon-loader"');
  });
});

describe('Alert', () => {
  it('interrupts for warnings and errors only', () => {
    expect(html(createElement(Alert, { variant: 'destructive' }, 'x'))).toContain(
      'role="alert"',
    );
    expect(html(createElement(Alert, { variant: 'warning' }, 'x'))).toContain(
      'role="alert"',
    );
    expect(html(createElement(Alert, { variant: 'success' }, 'x'))).toContain(
      'role="status"',
    );
    expect(html(createElement(Alert, { variant: 'info' }, 'x'))).toContain(
      'role="status"',
    );
  });
});

describe('Counter', () => {
  it('clamps to its bounds', () => {
    expect(clampCount(-1, 0, 8)).toBe(0);
    expect(clampCount(9, 0, 8)).toBe(8);
    expect(clampCount(3, 0, 8)).toBe(3);
  });

  it('disables the button of a reached bound and announces the value', () => {
    const markup = html(
      createElement(Counter, {
        label: 'Adults',
        value: 1,
        min: 1,
        max: 12,
        onValueChange: noop,
        decrementLabel: 'Remove one adult',
        incrementLabel: 'Add one adult',
      }),
    );
    expect(markup).toMatch(/aria-label="Remove one adult" disabled=""/);
    expect(markup).not.toMatch(/aria-label="Add one adult" disabled=""/);
    expect(markup).toContain('aria-live="polite"');
  });
});

describe('Tabs', () => {
  it('wraps with the arrows and jumps with Home and End', () => {
    expect(nextTabIndex(0, 'ArrowRight', 3)).toBe(1);
    expect(nextTabIndex(2, 'ArrowRight', 3)).toBe(0);
    expect(nextTabIndex(0, 'ArrowLeft', 3)).toBe(2);
    expect(nextTabIndex(1, 'Home', 3)).toBe(0);
    expect(nextTabIndex(1, 'End', 3)).toBe(2);
    expect(nextTabIndex(1, 'a', 3)).toBe(1);
  });

  it('selects one tab, keeps only it in the tab order, and hides the other panels', () => {
    const markup = html(
      createElement(Tabs, {
        label: 'Package',
        value: 'days',
        onValueChange: noop,
        items: [
          { id: 'overview', label: 'Overview', panel: 'A' },
          { id: 'days', label: 'Day by day', panel: 'B' },
        ],
      }),
    );
    expect(markup).toContain('role="tablist" aria-label="Package"');
    expect(markup.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(markup).toMatch(/aria-selected="true"[^>]*tabindex="0"/);
    expect(markup).toMatch(/aria-selected="false"[^>]*tabindex="-1"/);
    expect(markup.match(/role="tabpanel"[^>]*hidden=""/g)).toHaveLength(1);
  });
});

describe('AccordionItem', () => {
  it('starts collapsed with its region hidden, inside a heading', () => {
    const markup = html(
      createElement(AccordionItem, { title: 'Cancellation', level: 3 }, 'Body'),
    );
    expect(markup).toMatch(/^<div[^>]*><h3/);
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toMatch(/role="region"[^>]*hidden=""/);
  });
});

describe('Stepper', () => {
  it('marks the current step and gives phones a progress line', () => {
    const markup = html(
      createElement(Stepper, {
        progressLabel: 'Step 2 of 3 · Stays',
        steps: [
          { id: 'dates', label: 'Dates', state: 'done' },
          { id: 'stays', label: 'Stays', state: 'current' },
          { id: 'review', label: 'Review', state: 'upcoming' },
        ],
      }),
    );
    expect(markup.match(/aria-current="step"/g)).toHaveLength(1);
    expect(markup).toContain('Step 2 of 3 · Stays');
    expect(markup).toContain('width:66.66666666666666%');
  });
});

describe('CrisisBanner', () => {
  it('is a named region; a critical one offers acknowledgement, not a close', () => {
    const markup = html(
      createElement(CrisisBanner, {
        severity: 'critical',
        label: 'Travel advisory',
        title: 'Hurricane warning',
        acknowledgeLabel: 'I understand',
      }),
    );
    expect(markup).toContain('role="region" aria-label="Travel advisory"');
    expect(markup).toContain('I understand');
    expect(markup).not.toContain('icon-x');
  });
});

describe('Dialog', () => {
  it('renders closed, labelled by its title, with a named close button', () => {
    const markup = html(
      createElement(Dialog, {
        open: false,
        onClose: noop,
        title: 'Cancel booking?',
        closeLabel: 'Close',
      }),
    );
    expect(markup).toMatch(/^<dialog/);
    expect(markup).not.toMatch(/<dialog[^>]* open/);
    expect(markup).toMatch(/aria-labelledby="([^"]+)-title"/);
    expect(markup).toContain('aria-label="Close"');
  });
});
