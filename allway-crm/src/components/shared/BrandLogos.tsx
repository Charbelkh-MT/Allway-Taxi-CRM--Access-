/**
 * BrandLogos — central brand logo registry
 *
 * Maps exact DB brand name strings to their logo SVG files (in /public).
 * Logo files are vector SVGs so they're crisp at any size.
 *
 * To add a brand:
 *   1. Drop a logo SVG in /public named {brand}-logo.svg
 *   2. Add an entry here with the exact DB brand name as the key
 */

// ─── Registry ────────────────────────────────────────────────────────────────

interface BrandEntry {
  file: string
  /** Light background tint shown when showBg=true */
  bg?: string
}

export const BRAND_LOGOS: Record<string, BrandEntry> = {
  // ── Telecom (Lebanon) ──────────────────────────────────────────────────────
  'Alfa':       { file: '/alfa-logo.svg',       bg: '#FFF0F0' },
  'Touch':      { file: '/touch-logo.svg',       bg: '#E6F7FA' },

  // ── Mobile manufacturers ───────────────────────────────────────────────────
  'Samsung':    { file: '/samsung-logo.svg',     bg: '#EEF0FF' },
  'Apple':      { file: '/apple-logo.svg',       bg: '#F5F5F5' },
  'iPhone':     { file: '/apple-logo.svg',       bg: '#F5F5F5' },  // same as Apple
  'Huawei':     { file: '/huawei-logo.svg',      bg: '#FFF0F0' },
  'Xiaomi':     { file: '/xiaomi-logo.svg',      bg: '#FFF5F0' },
  'Nokia':      { file: '/nokia-logo.svg',       bg: '#E8EEF8' },
  'OPPO':       { file: '/oppo-logo.svg',        bg: '#EEF8EE' },
  'Oppo':       { file: '/oppo-logo.svg',        bg: '#EEF8EE' },
  'OnePlus':    { file: '/oneplus-logo.svg',     bg: '#FFF0F0' },
  'Realme':     { file: '/realme-logo.svg',      bg: '#FFF8EE' },

  // ── Accessories & peripherals (present in DB) ──────────────────────────────
  'Green Lion': { file: '/green-lion-logo.svg',  bg: '#EEF5EE' },
  'Logitech':   { file: '/logitech-logo.svg',    bg: '#E6F9F8' },
  'Kingston':   { file: '/kingston-logo.svg',    bg: '#FFF0F0' },
  'Panasonic':  { file: '/panasonic-logo.svg',   bg: '#E8EEF8' },
  'Hoco':       { file: '/hoco-logo.svg',        bg: '#F0F0F0' },
  'Promate':    { file: '/promate-logo.svg',     bg: '#FFF4EE' },
  'Borofone':   { file: '/borofone-logo.svg',    bg: '#F0F2F5' },
}

// Case-insensitive lookup — tries exact match first, then title-case, then upper
function findEntry(brand: string): BrandEntry | undefined {
  return (
    BRAND_LOGOS[brand] ??
    BRAND_LOGOS[brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase()] ??
    BRAND_LOGOS[brand.toUpperCase()] ??
    BRAND_LOGOS[brand.toLowerCase()] ??
    undefined
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

interface BrandLogoProps {
  brand: string
  /** sm = 20px  md = 28px  lg = 40px */
  size?: 'sm' | 'md' | 'lg'
  /** Wrap in a brand-tinted pill */
  showBg?: boolean
  className?: string
}

export function BrandLogo({ brand, size = 'md', showBg = false, className = '' }: BrandLogoProps) {
  const h = size === 'sm' ? 'h-5' : size === 'lg' ? 'h-10' : 'h-7'
  const entry = findEntry(brand)

  if (!entry) {
    return <span className={`font-semibold text-sm ${className}`}>{brand}</span>
  }

  return (
    <div
      className={`inline-flex items-center justify-center ${showBg ? 'rounded-lg px-2.5 py-1' : ''} ${className}`}
      style={showBg && entry.bg ? { background: entry.bg } : undefined}
    >
      <img
        src={entry.file}
        alt={brand}
        className={`${h} w-auto object-contain max-w-[120px]`}
        onError={(e) => {
          // Fallback to text if image fails to load
          const parent = (e.target as HTMLImageElement).parentElement
          if (parent) parent.innerHTML = `<span class="font-semibold text-sm">${brand}</span>`
        }}
      />
    </div>
  )
}

/** Returns true if a logo exists for this brand */
export function hasBrandLogo(brand: string): boolean {
  return !!findEntry(brand)
}
