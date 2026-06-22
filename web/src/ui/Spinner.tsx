interface SpinnerProps {
  size?: 'sm' | 'lg';
  /** Center the spinner in a padded block (good for full-page loading). */
  center?: boolean;
}

export function Spinner({ size = 'sm', center = false }: SpinnerProps) {
  const spinner = <span class={['spinner', size === 'lg' ? 'spinner--lg' : ''].filter(Boolean).join(' ')} role="status" aria-label="Loading" data-testid="spinner" />;
  return center ? <div class="spinner-center" data-testid="spinner-center">{spinner}</div> : spinner;
}
