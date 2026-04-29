import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Client } from '@/types/database'

export const CLIENTS_CACHE_KEY = ['clients', 'all'] as const

interface UseClientsCacheOptions {
  enabled?: boolean
}

export function useClientsCache(options: UseClientsCacheOptions = {}) {
  const { enabled = true } = options

  return useQuery({
    queryKey: CLIENTS_CACHE_KEY,
    queryFn: async (): Promise<Client[]> => {
      const { data, error } = await supabase
        .from('clients')
        .select('id,full_name,mobile,debt_status,usd_balance,lbp_balance,notes,created_at')
        .order('full_name', { ascending: true })
        .limit(3000)

      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled,
  })
}
