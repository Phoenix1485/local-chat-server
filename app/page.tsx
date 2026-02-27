'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const TOKEN_KEY = 'chat_auth_token';

async function requestJson(path: string, init?: RequestInit, token?: string) {
  const headers = new Headers(init?.headers ?? {});
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('x-session-token', token);
  }

  const response = await fetch(path, {
    ...init,
    headers
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const serverError = payload && typeof payload === 'object' && 'error' in payload ? String(payload.error) : null;
    throw new Error(serverError ?? 'Request failed.');
  }

  return payload;
}

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      return;
    }

    void requestJson('/api/app/auth/session', undefined, token)
      .then(() => {
        router.replace('/chat');
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      });
  }, [router]);

  const onLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      const payload = await requestJson('/api/app/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password })
      });

      const token = String(payload.token ?? '');
      if (!token) {
        throw new Error('Login failed.');
      }

      localStorage.setItem(TOKEN_KEY, token);
      router.push('/chat');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const onRegister = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      const payload = await requestJson('/api/app/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, firstName, lastName, email })
      });

      const token = String(payload.token ?? '');
      if (!token) {
        throw new Error('Registration failed.');
      }

      localStorage.setItem(TOKEN_KEY, token);
      router.push('/chat');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const onForgot = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      const payload = await requestJson('/api/app/auth/forgot', {
        method: 'POST',
        body: JSON.stringify({ identifier })
      });

      const token = typeof payload.resetToken === 'string' ? payload.resetToken : '';
      setResetToken(token);
      setInfo(
        token
          ? `Reset-Token (lokale Demo): ${token}`
          : 'Falls der Account existiert, wurde ein Reset-Token erstellt.'
      );

      if (token) {
        setMode('reset');
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Reset request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const onReset = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      await requestJson('/api/app/auth/reset', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, password })
      });

      setInfo('Passwort aktualisiert. Bitte jetzt einloggen.');
      setMode('login');
      setPassword('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Password reset failed.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="py-2 sm:py-6">
      <motion.section
        className="auth-shell auth-shell-enhanced grid min-h-[74dvh] md:grid-cols-[1.05fr_1fr]"
        initial={{ opacity: 0, y: 20, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div className="auth-ambient auth-ambient-one" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12, duration: 0.7 }} />
        <motion.div className="auth-ambient auth-ambient-two" aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, duration: 0.8 }} />

        <motion.div
          className="auth-hero hidden p-7 md:flex md:flex-col md:justify-between"
          initial={{ opacity: 0, x: -22 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.52, delay: 0.08 }}
        >
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-200/80">Live Messaging</p>
            <h1 className="mt-2 text-4xl font-semibold leading-tight text-white">Discord-Style Chat fuer deinen lokalen Server.</h1>
            <p className="mt-4 max-w-md text-sm text-slate-200/90">
              Gruppen, DMs, Friends, Profile, Rollen und moderne Chat-UX in einem System.
            </p>
          </div>

          <div className="space-y-2 text-sm text-slate-100/90">
            <motion.p className="glass-card rounded-xl px-3 py-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18, duration: 0.38 }}>
              Server-Rail und Channel-Struktur wie Discord
            </motion.p>
            <motion.p className="glass-card rounded-xl px-3 py-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.24, duration: 0.38 }}>
              Klarer Fokus auf Chat, Members und Discover
            </motion.p>
            <motion.p className="glass-card rounded-xl px-3 py-2" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.38 }}>
              Persistente Session und lokale Profile
            </motion.p>
          </div>
        </motion.div>

        <motion.div
          className="p-4 sm:p-7"
          initial={{ opacity: 0, x: 22 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.52, delay: 0.1 }}
        >
          <div className="mb-6 md:hidden">
            <h1 className="text-2xl font-semibold text-white">LocalChat Login</h1>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <motion.button whileHover={{ y: -1.5, scale: 1.01 }} whileTap={{ scale: 0.98 }} className={`auth-tab rounded-lg px-3 py-2 text-sm ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Login</motion.button>
            <motion.button whileHover={{ y: -1.5, scale: 1.01 }} whileTap={{ scale: 0.98 }} className={`auth-tab rounded-lg px-3 py-2 text-sm ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Register</motion.button>
            <motion.button whileHover={{ y: -1.5, scale: 1.01 }} whileTap={{ scale: 0.98 }} className={`auth-tab rounded-lg px-3 py-2 text-sm ${mode === 'forgot' ? 'active' : ''}`} onClick={() => setMode('forgot')}>Forgot</motion.button>
            <motion.button whileHover={{ y: -1.5, scale: 1.01 }} whileTap={{ scale: 0.98 }} className={`auth-tab rounded-lg px-3 py-2 text-sm ${mode === 'reset' ? 'active' : ''}`} onClick={() => setMode('reset')}>Reset</motion.button>
          </div>

          <AnimatePresence mode="wait">
            {mode === 'login' ? (
              <motion.form key="login" onSubmit={onLogin} className="mt-6 space-y-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
                <label className="block space-y-1">
                  <span className="surface-muted text-xs uppercase tracking-wide">Username oder Email</span>
                  <input className="glass-input" placeholder="dein.name oder mail@example.com" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
                </label>
                <label className="block space-y-1">
                  <span className="surface-muted text-xs uppercase tracking-wide">Passwort</span>
                  <input className="glass-input" placeholder="Passwort" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </label>
                <motion.button whileHover={{ y: -1.5 }} whileTap={{ scale: 0.985 }} disabled={isLoading} className="btn-primary w-full">{isLoading ? 'Einloggen...' : 'Einloggen'}</motion.button>
              </motion.form>
            ) : null}

            {mode === 'register' ? (
              <motion.form key="register" onSubmit={onRegister} className="mt-6 grid gap-3 sm:grid-cols-2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
                <label className="block space-y-1 sm:col-span-2">
                  <span className="surface-muted text-xs uppercase tracking-wide">Username</span>
                  <input className="glass-input" placeholder="z.B. lenfox" value={username} onChange={(event) => setUsername(event.target.value)} required />
                </label>
                <label className="block space-y-1">
                  <span className="surface-muted text-xs uppercase tracking-wide">Vorname</span>
                  <input className="glass-input" placeholder="Lena" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
                </label>
                <label className="block space-y-1">
                  <span className="surface-muted text-xs uppercase tracking-wide">Nachname</span>
                  <input className="glass-input" placeholder="Muster" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
                </label>
                <label className="block space-y-1 sm:col-span-2">
                  <span className="surface-muted text-xs uppercase tracking-wide">Email optional</span>
                  <input className="glass-input" placeholder="mail@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
                </label>
                <label className="block space-y-1 sm:col-span-2">
                  <span className="surface-muted text-xs uppercase tracking-wide">Passwort</span>
                  <input className="glass-input" placeholder="Mindestens 8 Zeichen" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </label>
                <motion.button whileHover={{ y: -1.5 }} whileTap={{ scale: 0.985 }} disabled={isLoading} className="btn-primary sm:col-span-2 w-full">{isLoading ? 'Erstelle Account...' : 'Account erstellen'}</motion.button>
              </motion.form>
            ) : null}

            {mode === 'forgot' ? (
              <motion.form key="forgot" onSubmit={onForgot} className="mt-6 space-y-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
                <label className="block space-y-1">
                  <span className="surface-muted text-xs uppercase tracking-wide">Username oder Email</span>
                  <input className="glass-input" placeholder="dein.name / mail@example.com" value={identifier} onChange={(event) => setIdentifier(event.target.value)} required />
                </label>
                <motion.button whileHover={{ y: -1.5 }} whileTap={{ scale: 0.985 }} disabled={isLoading} className="btn-primary w-full">{isLoading ? 'Sende...' : 'Reset anfragen'}</motion.button>
              </motion.form>
            ) : null}

            {mode === 'reset' ? (
              <motion.form key="reset" onSubmit={onReset} className="mt-6 space-y-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28 }}>
                <label className="block space-y-1">
                  <span className="surface-muted text-xs uppercase tracking-wide">Reset Token</span>
                  <input className="glass-input" placeholder="Token einfuegen" value={resetToken} onChange={(event) => setResetToken(event.target.value)} required />
                </label>
                <label className="block space-y-1">
                  <span className="surface-muted text-xs uppercase tracking-wide">Neues Passwort</span>
                  <input className="glass-input" placeholder="Neues Passwort" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </label>
                <motion.button whileHover={{ y: -1.5 }} whileTap={{ scale: 0.985 }} disabled={isLoading} className="btn-primary w-full">{isLoading ? 'Setze zurueck...' : 'Passwort zuruecksetzen'}</motion.button>
              </motion.form>
            ) : null}
          </AnimatePresence>

          {error ? <motion.p className="alert-error mt-4 rounded-lg px-3 py-2 text-sm" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{error}</motion.p> : null}
          {info ? <motion.p className="alert-info mt-4 rounded-lg px-3 py-2 text-sm" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>{info}</motion.p> : null}
        </motion.div>
      </motion.section>
    </main>
  );
}
