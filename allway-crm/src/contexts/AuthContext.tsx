import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Role, UserProfile } from '@/types/database'

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(authUser: { id: string; email?: string; user_metadata?: Record<string, unknown> }) {
    // RLS-friendly primary lookup: most policies are keyed by auth.uid() = users.id.
    const byId = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle()

    if (byId.data) {
      setProfile(byId.data)
      return
    }

    // RLS fallback: use security-definer RPC to fetch profile by username.
    const usernameFromMeta = authUser.user_metadata?.username as string | undefined
    const usernameFromEmail = authUser.email?.split('@')[0]
    const username = usernameFromMeta ?? usernameFromEmail

    if (!username) {
      setProfile(null)
      return
    }

    const byRpc = await (supabase as any)
      .rpc('get_user_login', { p_username: username })
      .maybeSingle()

    if (byRpc.data) {
      const rpcProfile = byRpc.data as Pick<UserProfile, 'id' | 'name' | 'username' | 'role' | 'station' | 'active'>
      setProfile({
        ...rpcProfile,
        created_at: new Date().toISOString(),
      })
      return
    }

    // Last fallback: legacy direct read by username if policy allows it.
    const byUsername = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .maybeSingle()

    setProfile(byUsername.data ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session?.user) fetchProfile(session.user).finally(() => setLoading(false))
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) fetchProfile(session.user).finally(() => setLoading(false))
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }
    return { error: null }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

// ─── Permissions ────────────────────────────────────────────────────────────
const PERMISSIONS: Record<Role, string[]> = {
  admin: ['dashboard','daily-balance','sales','clients','products','purchasing','suppliers','expenses','whish','recharge','internet','taxi','inventory','returns','settings','shift','audit','users'],
  staff: ['dashboard','daily-balance','sales','clients','products','purchasing','suppliers','expenses','whish','recharge','internet','taxi','inventory','returns','shift'],
}

export function useCan(module: string): boolean {
  const { profile } = useAuth()
  if (!profile) return false
  return PERMISSIONS[profile.role]?.includes(module) ?? false
}

export function useRole(): Role | null {
  return useAuth().profile?.role ?? null
}
