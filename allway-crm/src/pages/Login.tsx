import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Accept either a real email or a legacy username format.
    // If user types only a username, map it to our internal auth domain.
    const normalizedInput = username.trim().toLowerCase()
    const email = normalizedInput.includes('@')
      ? normalizedInput
      : `${normalizedInput}@allway.local`
    const { error } = await signIn(email, password)

    setLoading(false)
    if (error) {
      setError('Invalid username or password.')
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div
      className="flex flex-col items-center justify-center min-h-screen"
      style={{ background: 'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(184,120,10,0.06), transparent), hsl(var(--background))' }}
    >
      {/* Logo */}
      <p className="font-display text-[34px] font-semibold tracking-tight mb-1">
        All<span style={{ color: 'var(--color-gold)' }}>Way</span>
      </p>
      <p className="font-mono text-[10px] text-muted-foreground mb-9 tracking-[2px] uppercase">
        Services CRM
      </p>

      <Card className="w-[360px] shadow-lg border-border">
        <CardContent className="pt-8 pb-8 px-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="font-mono text-[10px] tracking-[1px] uppercase text-muted-foreground">
                Username or Email
              </Label>
              <Input
                id="username"
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
                required
                className="bg-secondary focus-visible:ring-[var(--color-gold)]"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="font-mono text-[10px] tracking-[1px] uppercase text-muted-foreground">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="bg-secondary focus-visible:ring-[var(--color-gold)]"
              />
            </div>

            {error && (
              <p className="text-destructive text-[11px] font-mono text-center">{error}</p>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full font-display tracking-wide mt-2"
              style={{ background: loading ? undefined : 'hsl(var(--foreground))' }}
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
