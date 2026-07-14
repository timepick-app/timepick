import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { Typography } from '@/components/ui/typography';
import { AuthBrand, AuthShell } from './AuthShell';

interface MagicLinkErrorCardProps {
  title: string;
  description: string;
  onBackToLogin: () => void;
}

export function MagicLinkErrorCard({ title, description, onBackToLogin }: MagicLinkErrorCardProps) {
  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <AuthBrand />
          <Typography variant="h3" as="h2" className="tracking-tight">{title}</Typography>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" className="w-full" onClick={onBackToLogin}>
            <ArrowLeft />
            Retour à la connexion
          </Button>
        </CardFooter>
      </Card>
    </AuthShell>
  );
}
