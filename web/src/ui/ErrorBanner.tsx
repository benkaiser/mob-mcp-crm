interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div class="error-banner" role="alert" data-testid="error-banner">
      <span>{message}</span>
      {onDismiss && (
        <button class="error-banner__close" onClick={onDismiss} aria-label="Dismiss" data-testid="error-banner-dismiss">
          ×
        </button>
      )}
    </div>
  );
}
