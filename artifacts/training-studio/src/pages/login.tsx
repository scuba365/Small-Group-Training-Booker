import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function Login() {
  const { login, createOwner } = useAuth();
  const [isSetup, setIsSetup] = useState(false);
  const [setupStatusLoaded, setSetupStatusLoaded] = useState(false);
  const [name, setName] = useState("");
  const [studioName, setStudioName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/setup-status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.needsSetup) setIsSetup(true);
      })
      .catch(() => {})
      .finally(() => setSetupStatusLoaded(true));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isSetup) {
        await createOwner(name, studioName, email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      setError((err as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center pb-2">
          <p className="text-xs uppercase tracking-widest font-semibold text-muted-foreground">Command Center</p>
          <h1 className="text-xl font-display font-bold tracking-tight uppercase mt-1">
            {isSetup ? "Set Up Your Studio" : "Sign In"}
          </h1>
          {isSetup && (
            <p className="mt-2 text-sm text-muted-foreground">
              Create the first owner account to get your studio running.
            </p>
          )}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              {isSetup && (
                <>
                  <Input
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="name"
                  />
                  <Input
                    type="text"
                    placeholder="Studio name"
                    value={studioName}
                    onChange={(e) => setStudioName(e.target.value)}
                    required
                    autoComplete="organization"
                  />
                </>
              )}
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
              <Input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (isSetup ? "Creating studio…" : "Signing in…") : isSetup ? "Create studio" : "Sign In"}
            </Button>
          </form>
          {setupStatusLoaded && (
            <button
              type="button"
              className="mt-4 w-full text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              onClick={() => {
                setError(null);
                setIsSetup((value) => !value);
              }}
              disabled={loading}
            >
              {isSetup ? "Already have an account? Sign in" : "First time here? Set up your studio"}
            </button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
