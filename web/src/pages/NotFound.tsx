import { Link } from 'wouter-preact';
import { EmptyState } from '../ui';

export function NotFound() {
  return (
    <div data-testid="not-found">
      <EmptyState title="Page not found" description="The page you're looking for doesn't exist.">
        <p>
          <Link href="/">← Back to dashboard</Link>
        </p>
      </EmptyState>
    </div>
  );
}
