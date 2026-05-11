import { useEffect } from 'react'
import { CREATOR } from '../lib/creator'

/**
 * CreatorSignature — GTA personal signature system
 *
 * Variants:
 *   badge   (default) — fixed bottom-right monogram circle, links to GitHub
 *   inline            — single text line, no DOM chrome
 *   console           — invisible, console.log only
 */
export default function CreatorSignature({ variant = 'badge', projectName = '' }) {
  useEffect(() => {
    const project = projectName ? ` · ${projectName}` : ''
    console.log(
      `%c${CREATOR.name} (${CREATOR.alias})%c\n${CREATOR.role}\n${CREATOR.location}${project}\n${CREATOR.github}`,
      'color:#22d3ee;font-weight:700;font-size:13px;',
      'color:#94a3b8;font-size:11px;'
    )
  }, [projectName])

  if (variant === 'console') return null

  if (variant === 'inline') {
    return (
      <p
        style={{
          fontSize: 11,
          color: 'rgba(34,211,238,0.25)',
          letterSpacing: 2,
          textTransform: 'uppercase',
          textAlign: 'center',
          margin: 0,
          userSelect: 'none',
        }}
      >
        {CREATOR.name}&nbsp;&middot;&nbsp;{CREATOR.alias}
      </p>
    )
  }

  // badge (default)
  return (
    <a
      href={CREATOR.github}
      target="_blank"
      rel="noopener noreferrer"
      title={`${CREATOR.signature} · ${CREATOR.role}`}
      style={{
        position: 'fixed',
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: 'rgba(9,9,11,0.75)',
        border: '1px solid rgba(34,211,238,0.12)',
        textDecoration: 'none',
        opacity: 0.5,
        transition: 'opacity 0.2s',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(34,211,238,0.2), rgba(100,200,255,0.1))',
          color: '#22d3ee',
          fontFamily: 'monospace',
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: '0.5px',
          lineHeight: 1,
        }}
      >
        {CREATOR.shortSignature}
      </span>
    </a>
  )
}
