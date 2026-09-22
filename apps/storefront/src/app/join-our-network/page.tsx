import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';

import { ApplicationForm } from '@/components/application-form';

export default function JoinOurNetworkPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Join our network</h1>
      <p className="mt-2 text-muted-foreground">
        Guides, drivers, homestay hosts, and translators — apply below. Our team reviews
        every application and will be in touch about compliance and onboarding.
      </p>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Supplier application</CardTitle>
          <CardDescription>
            We use these details only for onboarding and compliance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApplicationForm />
        </CardContent>
      </Card>
    </div>
  );
}
