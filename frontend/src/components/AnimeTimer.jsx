import { useEffect, useId, useRef } from 'react'
import { animate, stagger } from 'animejs'

export default function AnimeTimer({ timeRemaining, totalDuration, timerExpired }) {
  const uid = useId().replace(/:/g, '')
  const gradMain = `timerGradient-${uid}`
  const filterGlow = `timerGlow-${uid}`

  const circleRef = useRef(null)
  const digitsRef = useRef(null)
  const glowRef = useRef(null)
  const prevTimeRef = useRef(timeRemaining)

  const radius = 54
  const circumference = 2 * Math.PI * radius
  const progress = totalDuration > 0 ? timeRemaining / totalDuration : 0
  const offset = circumference * (1 - progress)

  const minutes = Math.floor((timeRemaining || 0) / 60)
  const seconds = (timeRemaining || 0) % 60
  const mm = String(minutes).padStart(2, '0')
  const ss = String(seconds).padStart(2, '0')

  const isWarning = timeRemaining <= 300 && timeRemaining > 60
  const isDanger = timeRemaining <= 60

  useEffect(() => {
    if (!circleRef.current) return
    animate(circleRef.current, {
      strokeDashoffset: offset,
      duration: 900,
      ease: 'outQuad',
    })
  }, [offset])

  useEffect(() => {
    if (prevTimeRef.current !== timeRemaining && digitsRef.current) {
      const chars = digitsRef.current.querySelectorAll('.anime-digit')
      if (chars.length) {
        animate(chars, {
          scale: [1.18, 1],
          opacity: [0.6, 1],
          duration: 350,
          ease: 'outBack(2)',
          delay: stagger(40),
        })
      }
      prevTimeRef.current = timeRemaining
    }
  }, [timeRemaining])

  useEffect(() => {
    if (isDanger && glowRef.current && !timerExpired) {
      animate(glowRef.current, {
        opacity: [0.3, 0.8, 0.3],
        scale: [1, 1.08, 1],
        duration: 1200,
        loop: true,
        ease: 'inOutSine',
      })
    }
  }, [isDanger, timerExpired])

  const strokeColor = timerExpired
    ? '#F87171'
    : isDanger
      ? '#F87171'
      : isWarning
        ? '#FBBF24'
        : `url(#${gradMain})`

  const textColor = timerExpired
    ? 'var(--danger)'
    : isDanger
      ? 'var(--danger)'
      : isWarning
        ? 'var(--warning)'
        : 'var(--text-primary)'

  return (
    <div
      className={`anime-timer ${timerExpired ? 'expired' : ''} ${isDanger ? 'danger' : ''} ${isWarning ? 'warning' : ''}`}
    >
      <div className="anime-timer-ring" ref={glowRef}>
        <svg viewBox="0 0 120 120" className="anime-timer-svg">
          <defs>
            <linearGradient id={gradMain} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#a78bfa" />
              <stop offset="50%" stopColor="#8B5CF6" />
              <stop offset="100%" stopColor="#7C3AED" />
            </linearGradient>
            <filter id={filterGlow}>
              <feGaussianBlur stdDeviation="3" result="glow" />
              <feMerge>
                <feMergeNode in="glow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <circle
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke="rgba(139, 92, 246, 0.1)"
            strokeWidth="6"
          />

          <circle
            ref={circleRef}
            cx="60"
            cy="60"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 60 60)"
            filter={`url(#${filterGlow})`}
            style={{ transition: 'stroke 0.5s ease' }}
          />
        </svg>

        <div className="anime-timer-content" ref={digitsRef} style={{ color: textColor }}>
          {timerExpired ? (
            <span className="anime-timer-expired">Expirat</span>
          ) : (
            <div className="anime-timer-digits">
              <span className="anime-digit">{mm[0]}</span>
              <span className="anime-digit">{mm[1]}</span>
              <span className="anime-timer-sep">:</span>
              <span className="anime-digit">{ss[0]}</span>
              <span className="anime-digit">{ss[1]}</span>
            </div>
          )}
          {!timerExpired && <span className="anime-timer-label">rămase</span>}
        </div>
      </div>
    </div>
  )
}
