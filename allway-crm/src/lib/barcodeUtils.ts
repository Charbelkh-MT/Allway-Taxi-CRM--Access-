/**
 * Barcode lookup utilities
 *
 * Central place for all product lookups by barcode.
 * Used by Sales, Purchasing, Inventory, and Products pages.
 */
import { supabase } from '@/lib/supabase'

export interface BarcodeProduct {
  id: number
  description: string
  barcode: string
  category: string
  brand: string
  currency: 'USD' | 'LBP'
  cost: number
  selling: number
  quantity: number
  active: boolean
}

export type BarcodeLookupResult =
  | { found: true; product: BarcodeProduct }
  | { found: false; barcode: string; reason: 'not_found' | 'inactive' }

/**
 * Look up a product by barcode.
 * Returns the product if found and active, or a typed not-found result.
 */
export async function lookupBarcode(barcode: string): Promise<BarcodeLookupResult> {
  const clean = barcode.trim()
  if (!clean) return { found: false, barcode: clean, reason: 'not_found' }

  const { data, error } = await supabase
    .from('products')
    .select('id, description, barcode, category, brand, currency, cost, selling, quantity, active')
    .eq('barcode', clean)
    .limit(1)

  if (error || !data || data.length === 0) {
    return { found: false, barcode: clean, reason: 'not_found' }
  }

  const prod = data[0] as any
  if (!prod.active) {
    return { found: false, barcode: clean, reason: 'inactive' }
  }

  return { found: true, product: prod as BarcodeProduct }
}

/**
 * Assign a barcode to a product.
 * Returns error string or null on success.
 */
export async function assignBarcode(productId: number, barcode: string): Promise<string | null> {
  const clean = barcode.trim()

  // Check barcode not already used by a different product
  if (clean) {
    const { data: existing } = await supabase
      .from('products')
      .select('id, description')
      .eq('barcode', clean)
      .neq('id', productId)
      .limit(1)

    if (existing && (existing as any[]).length > 0) {
      const other = (existing as any[])[0]
      return `Barcode already assigned to "${other.description}"`
    }
  }

  const { error } = await (supabase as any)
    .from('products')
    .update({ barcode: clean })
    .eq('id', productId)

  return error ? error.message : null
}
