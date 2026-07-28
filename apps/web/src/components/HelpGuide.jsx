// HelpGuide.jsx — in-app explanation of what things mean and how to use them,
// so new hosts/guests aren't left guessing what a button does or which plan
// unlocks it. Triggered by a "?" button; role='host' or 'guest' picks the
// relevant content. Styled to match the existing shortcuts/recap modals in
// HostRoom.jsx / GuestRoom.jsx (dark, monospace, rounded-2xl, cyan accent).

import { useState } from 'react'

const HOST_SECTIONS = [
  {
    title: 'Getting guests in',
    items: [
      { term: 'Invite link / QR / code', body: 'Share any of these — they all point to the same room. Guests never need an account.' },
      { term: 'Knock to join', body: 'Turn this on (Overflow menu → session settings, or when creating the session) and nobody enters until you tap Admit. You\u2019ll see their name and a live queue.' },
      { term: 'Lock session', body: 'Stops new guests from joining without disconnecting anyone already in the room. Toggle it anytime from the overflow menu.' },
      { term: 'Guest cap', body: 'Limits how many guests can be in the room at once. The options you can pick from are limited by your plan.' },
    ],
  },
  {
    title: 'During the call',
    items: [
      { term: 'Share screen', body: 'Shares your whole screen, a window, or a tab. Guests see it live; you can annotate on top of it.' },
      { term: 'Whiteboard', body: 'A blank shared canvas separate from screen share — good for sketching ideas from scratch. Anyone can draw unless you say otherwise out loud; there\u2019s no built-in whiteboard lock.' },
      { term: 'Remote control', body: 'Lets an approved guest drive your mouse and keyboard. Requires the desktop Companion app running on your machine (browser-only collaboration works without it). Press Esc anytime to take control back instantly.' },
      { term: 'Raise hand / Allow to speak', body: 'A guest raises their hand to ask for the floor; you can unmute them directly from the guest list.' },
      { term: 'Kick vs Ban', body: 'Kick removes a guest right now — they could still get back in with a fresh link. Ban does the same but also blocks their IP from getting a new invite link to work, for a disruptive guest you don\u2019t want back.' },
    ],
  },
  {
    title: 'Recording & history',
    items: [
      { term: 'Record', body: 'Records the call locally and downloads a .webm file to your computer when you stop. Requires Pro or Business.' },
      { term: 'Cloud recording', body: 'On Business, recordings are also uploaded automatically and show up in your Dashboard with a shareable link.' },
      { term: 'Audit log', body: 'A timestamped record of what happened in the session (joins, leaves, lock/unlock, etc). Downloadable as JSON. Requires Pro or Business.' },
      { term: 'Dashboard', body: 'Session history, stats, and recordings across every session you\u2019ve hosted. Requires Pro or Business — Free sessions are intentionally not stored.' },
    ],
  },
  {
    title: 'Business-only',
    items: [
      { term: 'Custom branding', body: 'Replace the CollabStream logo with your own and set an accent color guests see when they join your rooms. Settings → Custom branding.' },
      { term: 'Webhooks', body: 'Get a POST request to your own server when session events happen (start, end, guest join, recording ready). Settings → Webhooks, with a delivery log so you can see what was actually sent and whether it succeeded.' },
    ],
  },
]

const GUEST_SECTIONS = [
  {
    title: 'Joining',
    items: [
      { term: 'Waiting for host', body: 'You\u2019ll connect automatically as soon as the host is ready — no action needed.' },
      { term: 'Knock to join', body: 'If the host has this on, you\u2019ll need to send a request and wait for them to admit you before you\u2019re let in.' },
    ],
  },
  {
    title: 'During the call',
    items: [
      { term: 'Draw / Laser', body: 'Draw or point on the host\u2019s shared screen in real time — both are visible to everyone in the call.' },
      { term: 'Request control', body: 'Ask the host to hand over their mouse and keyboard. They approve or deny it; once granted, press Esc anytime to give it back.' },
      { term: 'Share screen', body: 'You can share your own screen too, but the host has to approve the request first.' },
      { term: 'Raise hand', body: 'Signals the host you want to speak or be unmuted.' },
    ],
  },
]

function Section({ section }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="text-cyan-300/80 text-[10px] font-mono uppercase tracking-widest mb-2">{section.title}</div>
      <div className="space-y-3">
        {section.items.map((item) => (
          <div key={item.term}>
            <div className="text-slate-200 text-xs font-mono font-semibold mb-0.5">{item.term}</div>
            <div className="text-slate-500 text-xs font-mono leading-relaxed">{item.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PlanTable() {
  const rows = [
    ['Guests', '3', '10', '20'],
    ['Session length', '45 min', '8 hours', '8 hours'],
    ['Recording', '—', 'Local download', 'Local + cloud'],
    ['Session history / audit log', '—', 'Yes', 'Yes'],
    ['Custom branding', '—', '—', 'Yes'],
    ['Webhooks', '—', '—', 'Yes'],
  ]
  return (
    <div className="mb-5">
      <div className="text-cyan-300/80 text-[10px] font-mono uppercase tracking-widest mb-2">Plans at a glance</div>
      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-slate-500 text-[10px] uppercase tracking-widest">
            <th className="text-left font-normal pb-2"></th>
            <th className="text-center font-normal pb-2">Free</th>
            <th className="text-center font-normal pb-2">Pro</th>
            <th className="text-center font-normal pb-2">Business</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, free, pro, biz]) => (
            <tr key={label} className="border-t border-slate-800/60">
              <td className="py-2 text-slate-400">{label}</td>
              <td className="py-2 text-center text-slate-500">{free}</td>
              <td className="py-2 text-center text-slate-300">{pro}</td>
              <td className="py-2 text-center text-amber-300">{biz}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function HelpGuide({ open, onClose, role = 'host' }) {
  const [tab, setTab] = useState('guide') // 'guide' | 'plans'
  if (!open) return null

  const sections = role === 'host' ? HOST_SECTIONS : GUEST_SECTIONS

  return (
    <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="modal-enter bg-slate-950 border border-slate-800 rounded-2xl w-[92%] max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 flex-shrink-0">
          <span className="text-slate-100 text-sm font-mono font-semibold">
            {role === 'host' ? 'Help & guide' : 'How to use this call'}
          </span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 text-xs font-mono">Close</button>
        </div>

        {role === 'host' && (
          <div className="flex items-center gap-1 px-6 pb-3 flex-shrink-0">
            <button
              onClick={() => setTab('guide')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${tab === 'guide' ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'}`}
            >
              Feature guide
            </button>
            <button
              onClick={() => setTab('plans')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors ${tab === 'plans' ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'}`}
            >
              Plans
            </button>
          </div>
        )}

        <div className="px-6 pb-6 overflow-y-auto">
          {tab === 'plans' && role === 'host' ? (
            <PlanTable />
          ) : (
            sections.map((section) => <Section key={section.title} section={section} />)
          )}
        </div>
      </div>
    </div>
  )
}
