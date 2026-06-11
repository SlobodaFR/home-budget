export function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-margin-mobile">
      <div className="w-full max-w-sm flex flex-col items-center gap-xl">
        <h1 className="font-display-campaign text-display-campaign-mobile uppercase tracking-tighter text-ink text-center">
          EQUITY
        </h1>

        <a
          href="/api/auth/login"
          className="bg-ink text-surface px-xl py-md rounded-full font-button-md text-center"
        >
          Se connecter
        </a>
      </div>
    </main>
  );
}
