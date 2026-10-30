export function LoadingScreen({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div role="status" className="flex h-full min-h-[120px] items-center justify-center px-margin-mobile text-mute">
      {label}
    </div>
  );
}
