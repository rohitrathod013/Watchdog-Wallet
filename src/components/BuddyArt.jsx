import { useId } from 'react'

/* ------------------------------------------------------------------
   Grace — a German Shepherd puppy, drawn in layers so she can move smoothly:

     .codi-shadow   ground shadow (stays put while she jumps)
     .codi-rig      jumps / squashes          ← animated as one bitmap
       .codi-breathe  idle breathing
         body.svg     fur body, head, ears, black saddle, collar
         arm.svg ×2   each front leg is its own layer, rotates at the shoulder
         face.svg     eyes, nose, blush, mouth — the only part that repaints

   The fur is an SVG filter: a fine displacement for fluffy edges, a lit
   noise field for fibre relief, and sparse light/dark specks for strands.
   ------------------------------------------------------------------ */

const TAN = { hi: '#ecc08a', mid: '#cf8f50', lo: '#9c6232' }
const BLACK = '#2a201a'
const CREAM = '#f6e2bf'

const BODY = 'M110 112C150 112 171 136 177 166C185 202 168 226 110 226C52 226 35 202 43 166C49 136 70 112 110 112Z'
const HEAD = 'M110 34C149 34 171 58 173 88C175 118 151 136 110 136C69 136 45 118 47 88C49 58 71 34 110 34Z'
const EAR_L = 'M58 66C50 44 48 20 55 4C70 12 88 28 97 46Z'
const EAR_R = 'M162 66C170 44 172 20 165 4C150 12 132 28 123 46Z'
const EAR_IN_L = 'M65 55C60 40 59 26 61 15C72 23 82 33 88 44Z'
const EAR_IN_R = 'M155 55C160 40 161 26 159 15C148 23 138 33 132 44Z'
/* the black cap and the stripe running down between the eyes */
const MASK =
  'M110 34C133 34 150 42 160 56C150 64 136 68 124 74C119 84 116 96 110 96C104 96 101 84 96 74C84 68 70 64 60 56C70 42 87 34 110 34Z'
const ARM = 'M30 7C40 7 45.5 22 46.5 46C47.5 72 47 103 30 103C13 103 12.5 72 13.5 46C14.5 22 20 7 30 7Z'

function FurFilter({ id, seed = 4 }) {
  return (
    <filter id={id} x="-12%" y="-12%" width="124%" height="124%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="2.3" numOctaves="2" seed={seed} result="n1" />
      <feDisplacementMap in="SourceGraphic" in2="n1" scale="5" xChannelSelector="R" yChannelSelector="G" result="shape" />
      <feGaussianBlur in="shape" stdDeviation="0.6" result="soft" />
      <feTurbulence type="fractalNoise" baseFrequency="1.7 1.3" numOctaves="3" seed={seed + 7} result="n2" />
      <feDiffuseLighting in="n2" surfaceScale="0.9" lightingColor="#ffffff" result="lit">
        <feDistantLight azimuth="225" elevation="60" />
      </feDiffuseLighting>
      <feComposite in="lit" in2="soft" operator="arithmetic" k1="0.4" k2="0" k3="0.68" k4="0" result="tex" />
      <feComposite in="tex" in2="soft" operator="in" result="furred" />
      <feTurbulence type="fractalNoise" baseFrequency="3.1" numOctaves="1" seed={seed + 17} result="n3" />
      <feColorMatrix in="n3" type="matrix" values="0 0 0 0 1  0 0 0 0 0.9  0 0 0 0 0.74  0 0 0 2.6 -1.7" result="tipsRaw" />
      <feComposite in="tipsRaw" in2="soft" operator="in" result="tips" />
      <feColorMatrix in="n3" type="matrix" values="0 0 0 0 0.24  0 0 0 0 0.16  0 0 0 0 0.1  0 0 0 -2.2 0.66" result="darkRaw" />
      <feComposite in="darkRaw" in2="soft" operator="in" result="dark" />
      <feMerge>
        <feMergeNode in="furred" />
        <feMergeNode in="dark" />
        <feMergeNode in="tips" />
      </feMerge>
    </filter>
  )
}

/* a front leg: black-saddled shoulder fading to a tan leg and a light paw */
function Arm({ side, id, armRef }) {
  const left = side === 'l'
  return (
    <div className={`codi-arm ${side}`} ref={armRef}>
      <svg viewBox="0 0 60 112" width="100%" height="100%" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={BLACK} />
            <stop offset=".3" stopColor="#5a3c25" />
            <stop offset=".5" stopColor={TAN.mid} />
            <stop offset=".82" stopColor={TAN.hi} />
            <stop offset="1" stopColor="#f3d3a4" />
          </linearGradient>
          <linearGradient id={`${id}-in`} x1={left ? '0' : '1'} y1="0" x2={left ? '1' : '0'} y2="0">
            <stop offset=".5" stopColor="#5b3518" stopOpacity="0" />
            <stop offset="1" stopColor="#5b3518" stopOpacity=".4" />
          </linearGradient>
          <FurFilter id={`${id}-fur`} seed={left ? 31 : 47} />
          <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
            <stop offset=".05" stopColor="#000" />
            <stop offset=".3" stopColor="#fff" />
          </linearGradient>
          <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x="-20" y="-20" width="100" height="152">
            <rect x="-20" y="-20" width="100" height="152" fill={`url(#${id}-fade)`} />
          </mask>
        </defs>
        <g mask={`url(#${id}-m)`} filter={`url(#${id}-fur)`} transform={`rotate(${left ? 12 : -12} 30 55)`}>
          <path d={ARM} fill={`url(#${id}-g)`} />
          <path d={ARM} fill={`url(#${id}-in)`} />
          {/* toe lines */}
          <path d="M24 94v7M36 94v7" stroke="#8a5a30" strokeOpacity=".7" strokeWidth="1.6" strokeLinecap="round" />
        </g>
      </svg>
    </div>
  )
}

export default function BuddyArt({ size = 220, mood = 'idle', className = '', rigRef, armLRef, armRRef, shadowRef }) {
  const id = useId().replace(/:/g, '')
  const u = (k) => `url(#${id}-${k})`

  return (
    <div className={`buddy-art codi mood-${mood} ${className}`} style={{ width: size, height: (size * 250) / 220 }} aria-hidden="true">
      <i className="codi-shadow" ref={shadowRef} />
      <div className="codi-rig" ref={rigRef}>
        <div className="codi-breathe">
          {/* ---------------- body, head and ears ---------------- */}
          <svg className="codi-body" viewBox="0 0 220 250" width="100%" height="100%">
            <defs>
              <radialGradient id={`${id}-fur`} cx="42%" cy="30%" r="80%">
                <stop offset="0" stopColor={TAN.hi} />
                <stop offset=".55" stopColor={TAN.mid} />
                <stop offset="1" stopColor={TAN.lo} />
              </radialGradient>
              <radialGradient id={`${id}-head`} cx="40%" cy="38%" r="75%">
                <stop offset="0" stopColor="#f1c992" />
                <stop offset=".6" stopColor={TAN.mid} />
                <stop offset="1" stopColor={TAN.lo} />
              </radialGradient>
              <linearGradient id={`${id}-saddle`} x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stopColor={BLACK} stopOpacity=".95" />
                <stop offset=".26" stopColor={BLACK} stopOpacity="0" />
                <stop offset=".74" stopColor={BLACK} stopOpacity="0" />
                <stop offset="1" stopColor={BLACK} stopOpacity=".95" />
              </linearGradient>
              <linearGradient id={`${id}-ao`} x1="0" y1="0" x2="0" y2="1">
                <stop offset=".6" stopColor="#4a2a12" stopOpacity="0" />
                <stop offset="1" stopColor="#4a2a12" stopOpacity=".4" />
              </linearGradient>
              <radialGradient id={`${id}-leg`} cx="42%" cy="26%" r="80%">
                <stop offset="0" stopColor="#f3d3a4" />
                <stop offset=".6" stopColor={TAN.mid} />
                <stop offset="1" stopColor={TAN.lo} />
              </radialGradient>
              <radialGradient id={`${id}-mask`} cx="50%" cy="20%" r="80%">
                <stop offset="0" stopColor="#4a382b" />
                <stop offset="1" stopColor={BLACK} />
              </radialGradient>
              <linearGradient id={`${id}-ear`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#1c1511" />
                <stop offset="1" stopColor="#3b2b20" />
              </linearGradient>
              <radialGradient id={`${id}-muzzle`} cx="50%" cy="35%" r="70%">
                <stop offset="0" stopColor="#fcefd6" />
                <stop offset="1" stopColor="#e3bf8c" />
              </radialGradient>
              <FurFilter id={`${id}-f`} />
              <FurFilter id={`${id}-fh`} seed={13} />
              <filter id={`${id}-b3`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" />
              </filter>
              <filter id={`${id}-b6`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="6" />
              </filter>
              <filter id={`${id}-b10`} x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="10" />
              </filter>
            </defs>

            {/* body: tan with the black saddle on the shoulders and a cream chest */}
            <g filter={u('f')}>
              <ellipse cx="88" cy="231" rx="21" ry="16" fill={u('leg')} />
              <ellipse cx="132" cy="231" rx="21" ry="16" fill={u('leg')} />
              <ellipse cx="110" cy="229" rx="5" ry="13" fill="#5b3518" opacity=".55" filter={u('b3')} />
              <path d={BODY} fill={u('fur')} />
              <path d={BODY} fill={u('saddle')} />
              <ellipse cx="110" cy="176" rx="30" ry="38" fill={CREAM} opacity=".85" filter={u('b10')} />
              <path d={BODY} fill={u('ao')} />
              {/* contact shadows where the front legs rest on the body */}
              <ellipse cx="55" cy="172" rx="9" ry="32" fill="#2a1a0e" opacity=".34" filter={u('b6')} />
              <ellipse cx="165" cy="172" rx="9" ry="32" fill="#2a1a0e" opacity=".38" filter={u('b6')} />
            </g>

            {/* head */}
            <g filter={u('fh')}>
              <path d={EAR_L} fill={u('ear')} />
              <path d={EAR_R} fill={u('ear')} />
              <path d={EAR_IN_L} fill="#d9a275" />
              <path d={EAR_IN_R} fill="#d9a275" />
              <path d="M69 52C65 41 64 31 65 23C72 29 78 36 82 43Z" fill="#f0b9a0" opacity=".6" />
              <path d="M151 52C155 41 156 31 155 23C148 29 142 36 138 43Z" fill="#f0b9a0" opacity=".6" />
              <ellipse cx="110" cy="140" rx="54" ry="8" fill="#2a1a0e" opacity=".35" filter={u('b3')} />
              <path d={HEAD} fill={u('head')} />
              <path d={MASK} fill={u('mask')} />
              {/* tan eyebrow spots */}
              <ellipse cx="88" cy="70" rx="6" ry="3.4" fill={TAN.hi} transform="rotate(-14 88 70)" />
              <ellipse cx="132" cy="70" rx="6" ry="3.4" fill={TAN.hi} transform="rotate(14 132 70)" />
              {/* muzzle */}
              <ellipse cx="110" cy="110" rx="25" ry="19" fill={u('muzzle')} />
            </g>

            {/* collar in the theme accent, with a little tag */}
            <path d="M64 126Q110 150 156 126" fill="none" stroke="var(--accent, #e8692c)" strokeWidth="8" strokeLinecap="round" />
            <path d="M64 126Q110 150 156 126" fill="none" stroke="#000" strokeOpacity=".18" strokeWidth="2" strokeLinecap="round" transform="translate(0 3)" />
            <circle cx="110" cy="146" r="6.5" fill="#f2c14e" stroke="#b8860b" strokeWidth="1.2" />
            <circle cx="108" cy="144" r="1.8" fill="#fff" opacity=".7" />
          </svg>

          <Arm side="l" id={`${id}-al`} armRef={armLRef} />
          <Arm side="r" id={`${id}-ar`} armRef={armRRef} />

          {/* ---------------- face features ---------------- */}
          <svg className="codi-face" viewBox="0 0 220 250" width="100%" height="100%">
            <defs>
              <radialGradient id={`${id}-eye`} cx="34%" cy="30%" r="75%">
                <stop offset="0" stopColor="#6b4a2e" />
                <stop offset=".5" stopColor="#2a1a10" />
                <stop offset="1" stopColor="#080504" />
              </radialGradient>
              <radialGradient id={`${id}-nose`} cx="40%" cy="30%" r="70%">
                <stop offset="0" stopColor="#5a5250" />
                <stop offset="1" stopColor="#0d0b0a" />
              </radialGradient>
              <filter id={`${id}-blush`} x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3.2" />
              </filter>
            </defs>
            <g className="b-cheeks" filter={u('blush')}>
              <ellipse cx="76" cy="104" rx="9" ry="6" fill="#f39a9a" />
              <ellipse cx="144" cy="104" rx="9" ry="6" fill="#f39a9a" />
            </g>
            <g className="b-look">
              <g className="b-eyes">
                <circle cx="88" cy="84" r="6.6" fill={u('eye')} />
                <circle cx="132" cy="84" r="6.6" fill={u('eye')} />
                <ellipse cx="85.8" cy="81.4" rx="2.3" ry="2" fill="#fff" />
                <ellipse cx="129.8" cy="81.4" rx="2.3" ry="2" fill="#fff" />
                <circle cx="90.6" cy="87" r=".9" fill="#fff" opacity=".55" />
                <circle cx="134.6" cy="87" r=".9" fill="#fff" opacity=".55" />
              </g>
            </g>
            <g className="b-happy-eyes" fill="none" stroke="#17110e" strokeWidth="3" strokeLinecap="round">
              <path d="M81.5 87Q88 78 94.5 87" />
              <path d="M125.5 87Q132 78 138.5 87" />
            </g>
            {/* nose */}
            <path d="M100 99.5C100 95 120 95 120 99.5C120 104 114 107.5 110 107.5S100 104 100 99.5Z" fill={u('nose')} />
            <ellipse cx="106" cy="98.4" rx="3" ry="1.4" fill="#fff" opacity=".4" />
            <path d="M110 107.5v4.5" stroke="#22150f" strokeWidth="2" strokeLinecap="round" />
            {/* closed "w" smile */}
            <path className="b-smile" d="M101 112Q105.5 117 110 112Q114.5 117 119 112" fill="none" stroke="#22150f" strokeWidth="2.2" strokeLinecap="round" />
            {/* open mouth with a tongue */}
            <g className="b-mouth">
              <path d="M100 111.5Q110 114 120 111.5Q119 125 110 125T100 111.5Z" fill="#3a1d18" />
              <path d="M104 119Q110 116 116 119Q117 129 110 130Q103 129 104 119Z" fill="#ec7f8a" />
              <path d="M110 119.5v7" stroke="#c95a68" strokeWidth="1" strokeLinecap="round" />
            </g>
          </svg>
        </div>
      </div>
    </div>
  )
}
