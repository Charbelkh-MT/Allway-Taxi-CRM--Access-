import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Supplier } from '@/types/database'

export const SUPPLIERS_CACHE_KEY = ['suppliers'] as const

export function useSuppliersCache() {
  return useQuery({
    queryKey: SUPPLIERS_CACHE_KEY,
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .order('name', { ascending: true })
      
      if (error) throw error
      return data ?? []
    },
    staleTime: 5 * 60 * 1000,
  })
}
