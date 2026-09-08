import { useState } from 'react';
import { COLOR, RADIUS, TYPE } from '../design/tokens';
import { AdminPrimaryButton, DANGER, Label, inp } from './adminKit';
import { login } from '../api/catalog';
import { ApiError } from '../api/http';

/**
 * The bench's front door.
 *
 * The catalogue used to live in this browser, so anyone who typed the address
 * could rewrite it. It lives on a server now and every write is behind a
 * session, which means the bench needs somewhere to start one. Read-only
 * showroom traffic never comes through here.
 */
export function BenchLogin({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
      onDone();
    } catch (e) {
      // Laravel throttles per email+IP and says so in the message, which is
      // worth showing verbatim — "try again in 47 seconds" is the answer.
      setError(e instanceof ApiError ? e.message : 'Kirib bo‘lmadi');
      setBusy(false);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: COLOR.studio, padding: 24 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); void submit(); }}
        style={{ width: '100%', maxWidth: 360, background: '#fff', border: `1px solid ${COLOR.line}`, borderRadius: RADIUS, padding: 26 }}
      >
        <div style={{ ...TYPE.h2, color: COLOR.ink }}>Ustaxona</div>
        <div style={{ ...TYPE.small, color: COLOR.inkSoft, marginTop: 4 }}>Katalogni o‘zgartirish uchun kiring.</div>

        <Label>Email</Label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" style={inp} />
        <Label>Parol</Label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" style={inp} />

        {error && <div style={{ fontSize: 12, color: DANGER.text, lineHeight: 1.5, marginTop: 10 }}>{error}</div>}

        <div style={{ marginTop: 18 }}>
          <AdminPrimaryButton onClick={() => void submit()} disabled={busy || !email || !password}>
            {busy ? 'Tekshirilmoqda…' : 'Kirish'}
          </AdminPrimaryButton>
        </div>
      </form>
    </div>
  );
}
