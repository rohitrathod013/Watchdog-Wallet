import { useId } from 'react'
import Icon from './Icon'
import { initials } from '../lib/format'

/** The Watchdog Wallet mark — a chunky rounded "W". */
export function Logo({ size = 52 }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden="true" className="logo-mark">
      <defs>
        <linearGradient id={id} x1="6" y1="4" x2="38" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--accent-2)" />
          <stop offset="1" stopColor="var(--accent-deep)" />
        </linearGradient>
      </defs>
      <circle cx="22" cy="22" r="22" fill={`url(#${id})`} />
      <path
        className="logo-stroke"
        d="M12.5 15 L17 29 L22 19.5 L27 29 L31.5 15"
        fill="none"
        stroke="#fff"
        strokeWidth="4.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Profile photo for the signed-in user (public/avatar.jpg). */
export function Avatar({ size = 52 }) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}avatar.jpg`}
      width={size}
      height={size}
      alt=""
      aria-hidden="true"
      className="avatar-svg"
      style={{ objectFit: 'cover' }}
      draggable="false"
    />
  )
}

const FLAG_ART = {
  us: (
    <>
      <rect width="20" height="20" fill="#fff" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} y={i * 3.08} width="20" height="1.54" fill="#d22f3b" />
      ))}
      <rect width="9.6" height="10.8" fill="#273b7d" />
      {[
        [2.4, 2.4],
        [5, 2.4],
        [7.4, 2.4],
        [3.6, 4.6],
        [6.2, 4.6],
        [2.4, 6.8],
        [5, 6.8],
        [7.4, 6.8],
        [3.6, 9],
        [6.2, 9],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r=".55" fill="#fff" />
      ))}
    </>
  ),
  eu: (
    <>
      <rect width="20" height="20" fill="#1f45b5" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return <circle key={i} cx={10 + Math.cos(a) * 5.2} cy={10 + Math.sin(a) * 5.2} r=".85" fill="#ffd23f" />
      })}
    </>
  ),
  gb: (
    <>
      <rect width="20" height="20" fill="#24357c" />
      <path d="M0 0 20 20M20 0 0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0 20 20M20 0 0 20" stroke="#d6303d" strokeWidth="1.4" />
      <path d="M10 0v20M0 10h20" stroke="#fff" strokeWidth="5.6" />
      <path d="M10 0v20M0 10h20" stroke="#d6303d" strokeWidth="3.2" />
    </>
  ),
  jp: (
    <>
      <rect width="20" height="20" fill="#fff" />
      <circle cx="10" cy="10" r="4.6" fill="#d6303d" />
    </>
  ),
}

export function Flag({ code, size = 20 }) {
  const id = useId()
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" className="flag" aria-hidden="true">
      <clipPath id={id}>
        <circle cx="10" cy="10" r="10" />
      </clipPath>
      <g clipPath={`url(#${id})`}>{FLAG_ART[code] ?? FLAG_ART.us}</g>
      <circle cx="10" cy="10" r="9.6" fill="none" stroke="rgba(0,0,0,.08)" strokeWidth=".8" />
    </svg>
  )
}

export function Mastercard({ size = 38 }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 36 22" aria-hidden="true">
      <circle cx="11" cy="11" r="10" fill="#eb2a2a" />
      <circle cx="25" cy="11" r="10" fill="#f8a91d" fillOpacity=".95" />
      <path d="M18 3.9a10 10 0 0 1 0 14.2 10 10 0 0 1 0-14.2Z" fill="#fb6a1d" />
    </svg>
  )
}

/* fg is the brand-ish colour; the tile tints itself from it so it works in both themes */
const TILE = {
  salary: { fg: 'var(--green)', icon: 'arrowDown' },
  request: { fg: 'var(--green)', icon: 'arrowDown' },
  freelance: { fg: '#14a06a', icon: 'laptop' },
  business: { fg: 'var(--blue)', icon: 'bank' },
  shopping: { solid: true, icon: 'bag' },
  ride: { solid: true, icon: 'car' },
  travel: { fg: '#e5407a', icon: 'plane' },
  food: { fg: '#1f9d55', icon: 'cart' },
  coffee: { fg: '#9a6643', icon: 'coffee' },
  transfer: { fg: 'var(--accent)', icon: 'arrowUpRight' },
  stream: { fg: '#e03131', icon: 'play' },
  music: { fg: '#1db954', icon: 'music' },
  fuel: { fg: '#d99a00', icon: 'bolt' },
  home: { fg: 'var(--accent)', icon: 'home' },
  gym: { fg: '#7a4ddc', icon: 'heart' },
  wifi: { fg: 'var(--blue)', icon: 'wifi' },
}

/** Merchant / category mark used in lists. */
export function MerchantLogo({ kind, size = 42 }) {
  const t = TILE[kind] ?? TILE.transfer
  const style = t.solid
    ? { width: size, height: size, background: 'var(--solid)', color: 'var(--on-solid)' }
    : { width: size, height: size, background: `color-mix(in srgb, ${t.fg} 13%, var(--card))`, color: t.fg }
  return (
    <span className="tile-logo" style={style}>
      <Icon name={t.icon} size={size * 0.48} stroke={1.9} />
    </span>
  )
}

/** Initials avatar for contacts. */
export function Persona({ name, hue = 20, size = 46 }) {
  return (
    <span
      className="persona"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        background: `linear-gradient(140deg, hsl(${hue} 85% 70%), hsl(${hue + 28} 70% 50%))`,
      }}
    >
      {initials(name)}
    </span>
  )
}
