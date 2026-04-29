import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Product } from '@/types/database'

export const PRODUCTS_CACHE_KEY = ['products', 'active'] as const

interface UseProductsCacheOptions {
  enabled?: boolean
}

export function useProductsCache(options: UseProductsCacheOptions = {}) {
  const { enabled = true } = options

  return useQuery({
    queryKey: PRODUCTS_CACHE_KEY,
    queryFn: async (): Promise<Product[]> => {
      let allData: Product[] = []
      let from = 0
      const step = 1000
      
      while (true) {
        const { data, error } = await supabase
          .from('products')
          .select('id,description,category,sub_category,brand,currency,cost,selling,quantity,active,created_at')
          .eq('active', true)
          .order('description', { ascending: true })
          .range(from, from + step - 1)
        
        if (error) throw error
        if (!data || data.length === 0) break
        
        allData = [...allData, ...data]
        if (data.length < step) break
        from += step
      }
      return allData
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled,
  })
}
