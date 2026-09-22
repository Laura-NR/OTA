'use client';

import { Alert, Button, Input, Label, Select } from '@ota/ui';
import { useState } from 'react';
import type { FormEvent } from 'react';

type Status = 'idle' | 'sending' | 'sent' | 'error';

/** Public supplier recruitment form (spec §4.6). Creates a PENDING application. */
export function ApplicationForm() {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setStatus('sending');
    setError(null);

    const provinces = String(form.get('provincesActive') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    try {
      const response = await fetch('/api/ota/supplier-applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: form.get('fullName'),
          email: form.get('email'),
          phone: form.get('phone'),
          category: form.get('category'),
          provincesActive: provinces,
          rtnLicenseNumber: form.get('rtnLicenseNumber'),
          message: form.get('message') || undefined,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? 'Could not submit your application');
      }
      setStatus('sent');
    } catch (submitError) {
      setStatus('error');
      setError(submitError instanceof Error ? submitError.message : 'Could not submit');
    }
  }

  if (status === 'sent') {
    return (
      <Alert variant="success">
        Thank you — your application is in. Our operations team will review it and get
        back to you.
      </Alert>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="app-name">Full name</Label>
          <Input id="app-name" name="fullName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-email">Email</Label>
          <Input id="app-email" name="email" type="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-phone">Phone</Label>
          <Input id="app-phone" name="phone" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-category">Category</Label>
          <Select id="app-category" name="category" defaultValue="TOUR_GUIDE">
            <option value="TOUR_GUIDE">Tour guide</option>
            <option value="PRIVATE_DRIVER">Private driver</option>
            <option value="HOMESTAY_HOST">Homestay host</option>
            <option value="TRANSLATOR">Translator</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-provinces">Provinces (comma-separated)</Label>
          <Input
            id="app-provinces"
            name="provincesActive"
            required
            placeholder="La Habana, Matanzas"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="app-license">RTN licence number</Label>
          <Input id="app-license" name="rtnLicenseNumber" required />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="app-message">Tell us about your work (optional)</Label>
        <textarea
          id="app-message"
          name="message"
          rows={4}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {error ? <Alert variant="destructive">{error}</Alert> : null}

      <Button type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? 'Sending…' : 'Apply to join'}
      </Button>
    </form>
  );
}
