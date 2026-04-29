import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export function useAuditLog() {
  const { profile } = useAuth()

  async function log(action: string, module: string, detail: string) {
    // Database typing is currently partial; cast this insert until generated types are in place.
    await (supabase as any).from('audit_log').insert({
      action,
      module,
      detail,
      user_name: profile?.name ?? 'system',
      station: profile?.station ?? '',
    })
  }

  return { log }
}
