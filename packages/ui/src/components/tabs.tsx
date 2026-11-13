'use client';

import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

import { cn } from '../cn';

/**
 * The tab a key moves to (WAI-ARIA tabs): arrows wrap around, Home and End jump
 * to the ends; any other key leaves the selection where it is.
 */
export function nextTabIndex(current: number, key: string, count: number): number {
  switch (key) {
    case 'ArrowRight':
      return (current + 1) % count;
    case 'ArrowLeft':
      return (current - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return current;
  }
}

export interface TabItem {
  id: string;
  label: ReactNode;
  panel: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onValueChange: (id: string) => void;
  /** Names the tab list for assistive technology. */
  label: string;
  className?: string;
}

/**
 * DS 03 tabs: a 48 px row with a 3 px primary underline on the selected tab,
 * scrolling sideways on a phone. Arrow keys, Home and End move between tabs and
 * select them (automatic activation); only the selected tab is in the tab order.
 */
export function Tabs({ items, value, onValueChange, label, className }: TabsProps) {
  const baseId = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const next = nextTabIndex(selected, event.key, items.length);
    if (next === selected) {
      return;
    }
    event.preventDefault();
    onValueChange(items[next]!.id);
    tabs.current[next]?.focus();
  }

  return (
    <div className={className}>
      <div
        role="tablist"
        aria-label={label}
        className="flex gap-6 overflow-x-auto border-b"
      >
        {items.map((item, index) => {
          const isSelected = index === selected;
          return (
            <button
              key={item.id}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${item.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${item.id}`}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => onValueChange(item.id)}
              onKeyDown={onKeyDown}
              className={cn(
                '-mb-px h-12 shrink-0 whitespace-nowrap border-b-[3px] px-1 text-body font-medium transition-colors',
                isSelected
                  ? 'border-primary-600 font-semibold text-primary-700'
                  : 'border-transparent text-secondary hover:text-default',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item, index) => (
        <div
          key={item.id}
          role="tabpanel"
          id={`${baseId}-panel-${item.id}`}
          aria-labelledby={`${baseId}-tab-${item.id}`}
          hidden={index !== selected}
          tabIndex={0}
          className="pt-6"
        >
          {item.panel}
        </div>
      ))}
    </div>
  );
}
