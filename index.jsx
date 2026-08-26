import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRotateCw,
  Check,
  ChevronDown,
  InfoCircle,
} from '@openai/apps-sdk-ui/components/Icon'
import catalog from './models.json'
import {
  ACTIVE_STATUSES,
  cancellationMessage,
  createLatestRequest,
  finishedSince,
  groupDelegationsByChat,
} from './delegationActivity.js'

const CONFIG_KEY = 'config.json'
const STATUS_KEY = 'status.json'
const PROVIDER_IDS = ['claude', 'codex']

const CSS = `
* { box-sizing: border-box; }
/* mobius-ui:Root — app-owned; a future-library candidate, no sync owed. */
.sa-root { box-sizing: border-box; position: relative; min-height: 100dvh; overflow-x: clip;
  background: var(--bg); color: var(--text); font-family: var(--font); }
/* /mobius-ui:Root */

.sa-header { position: sticky; top: 0; z-index: 5; min-height: 64px;
  background: var(--bg); }
.sa-header-inner { width: min(760px, 100%); margin-inline: auto; display: flex; align-items: center; gap: 12px;
  padding: max(12px, env(safe-area-inset-top)) 16px 12px; border-bottom: 1px solid var(--border); }
.sa-logo { width: 40px; height: 40px; flex: 0 0 auto; object-fit: contain; display: block; }
.sa-logo-fallback { place-items: center; border-radius: 10px; background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent); font-weight: 750; }
.sa-titles { min-width: 0; }
.sa-title { font-size: 16px; font-weight: 680; letter-spacing: -.015em; }
.sa-subtitle { margin-top: 2px; font-size: 12.5px; color: var(--muted); }
.sa-refresh { margin-left: auto; width: 44px; height: 44px; border: 0; border-radius: 10px;
  display: grid; place-items: center; color: var(--muted); background: transparent; cursor: pointer; }
.sa-refresh:hover { color: var(--text); background: var(--surface2); }
.sa-refresh:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.sa-refresh:disabled { opacity: .5; cursor: default; }
.sa-refresh.is-spinning svg { animation: sa-spin .7s linear infinite; }

.sa-page { width: min(720px, 100%); margin: 0 auto; padding: 20px 16px 56px;
  display: flex; flex-direction: column; gap: 14px; }

.sa-work { border-bottom: 1px solid var(--border); padding: 17px 17px 6px; }
.sa-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 11px; }
.sa-section-title { font-size: 14px; font-weight: 700; letter-spacing: -.01em; }
.sa-section-note { font-size: 11.5px; color: var(--muted); }
.sa-run-list { display: grid; }
.sa-run { border-top: 1px solid var(--border-light); }
.sa-run:first-child { border-top: 0; }
.sa-run-row { width: 100%; min-height: 58px; padding: 10px 0; border: 0; background: transparent;
  color: inherit; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center;
  gap: 12px; text-align: left; cursor: pointer; }
.sa-run-row:hover .sa-run-name { color: var(--accent); }
.sa-run-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 8px; }
.sa-run-name { min-width: 0; font-size: 12.5px; font-weight: 670; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sa-run-meta { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px 8px; color: var(--muted); font-size: 10.8px; }
.sa-run-status { display: inline-flex; align-items: center; gap: 6px; font-size: 10.5px; font-weight: 680;
  color: var(--muted); text-transform: capitalize; }
.sa-run-status::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.sa-run-status.is-active { color: var(--accent); }
.sa-run-status.is-done { color: var(--green); }
.sa-run-status.is-failed { color: color-mix(in srgb, var(--danger) 76%, var(--text)); }
.sa-run-detail { margin: 0 0 12px; padding: 11px; border-radius: 11px; background: var(--surface2); }
.sa-run-result { margin: 0; max-height: 240px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere;
  font: 11.5px/1.5 var(--font); color: var(--text); }
.sa-run-actions { margin-top: 10px; display: flex; align-items: center; gap: 8px; }
.sa-action { min-height: 38px; padding: 0 12px; border-radius: 9px; border: 1px solid var(--border);
  background: var(--surface); color: var(--text); font: inherit; font-size: 11.5px; font-weight: 650; cursor: pointer; }
.sa-action:hover { border-color: var(--accent); }
.sa-action:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.sa-action.is-danger { color: var(--danger); }
.sa-empty { padding: 4px 0 14px; color: var(--muted); font-size: 12px; line-height: 1.45; }
.sa-badge { display: inline-flex; align-items: center; padding: 1px 7px; border-radius: 999px;
  font-size: 10px; font-weight: 660; line-height: 1.65; background: var(--surface2); color: var(--muted); }
.sa-badge.is-claude { color: color-mix(in srgb, #D97752 80%, var(--text)); background: color-mix(in srgb, #D97752 12%, var(--surface2)); }
.sa-badge.is-codex { color: color-mix(in srgb, #5B4BE2 82%, var(--text)); background: color-mix(in srgb, #5B4BE2 14%, var(--surface2)); }
.sa-chat-runs { border-top: 1px solid var(--border-light); padding-left: 12px;
  margin: 2px 0 10px; }
.sa-chat-runs .sa-run:first-child { border-top: 0; }

/* mobius-ui:Card */
.sa-card { border: 1px solid var(--border); border-radius: 16px;
  background: color-mix(in srgb, var(--surface) 96%, var(--accent) 4%); overflow: clip;
  box-shadow: 0 10px 30px rgba(0,0,0,.08); }
/* /mobius-ui:Card */
.sa-card.is-enabled { border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
  box-shadow: 0 12px 34px color-mix(in srgb, var(--accent) 9%, transparent); }
.sa-card-main { padding: 17px; }
.sa-provider-head { display: flex; align-items: center; gap: 12px; }
.sa-provider-mark { width: 42px; height: 42px; border-radius: 13px; flex: 0 0 auto;
  display: grid; place-items: center; overflow: hidden; border: 1px solid var(--border-light); }
.sa-provider-mark.is-claude { background: color-mix(in srgb, #D97752 12%, var(--surface2)); }
.sa-provider-mark.is-codex { background: color-mix(in srgb, #5B4BE2 13%, var(--surface2)); }
.sa-provider-mark svg { width: 32px; height: 32px; display: block; }
.sa-provider-copy { min-width: 0; flex: 1; }
.sa-provider-name { display: flex; align-items: center; gap: 7px; flex-wrap: wrap;
  font-size: 15px; font-weight: 680; letter-spacing: -.01em; }
.sa-state { display: inline-flex; align-items: center; gap: 4px; min-height: 22px; padding: 0 8px;
  border: 0; border-radius: 999px; background: var(--surface2); color: var(--muted);
  font-size: 10.5px; font-weight: 650; }
.sa-state.is-good { color: var(--green); background: color-mix(in srgb, var(--green) 10%, var(--surface2)); }
.sa-state.is-quiet { color: var(--muted); background: color-mix(in srgb, var(--accent) 8%, var(--surface2)); }
.sa-state.is-warn { color: color-mix(in srgb, var(--danger) 72%, var(--text));
  background: color-mix(in srgb, var(--danger) 8%, var(--surface2)); }
.sa-provider-desc { margin-top: 3px; font-size: 12px; color: var(--muted); }

.sa-switch { position: relative; min-width: 58px; min-height: 44px; border: 0; padding: 0;
  display: inline-flex; align-items: center; justify-content: flex-end; background: transparent; cursor: pointer; }
.sa-switch:disabled { cursor: not-allowed; opacity: .48; }
.sa-track { position: relative; width: 44px; height: 26px; border-radius: 999px;
  background: var(--surface2); border: 1px solid var(--border); transition: background .16s ease, border-color .16s ease; }
.sa-switch.is-on .sa-track { background: var(--accent); border-color: var(--accent); }
.sa-knob { position: absolute; left: 2px; top: 2px; width: 20px; height: 20px; border-radius: 50%;
  background: var(--surface); box-shadow: 0 1px 3px rgba(0,0,0,.24); transition: transform .16s ease; }
.sa-switch.is-on .sa-knob { transform: translateX(18px); background: var(--accent-fg); }
.sa-switch:focus-visible { outline: none; }
.sa-switch:focus-visible .sa-track { box-shadow: 0 0 0 3px var(--accent-dim); }

.sa-message { margin-top: 13px; padding: 10px 11px; border-radius: 11px; background: var(--surface2);
  display: flex; align-items: flex-start; gap: 7px; color: var(--muted); font-size: 12px; line-height: 1.38; }
.sa-message svg { flex: 0 0 auto; margin-top: 1px; }
.sa-message.is-note { background: color-mix(in srgb, var(--accent) 6%, var(--surface2)); }
.sa-message.is-warn { color: color-mix(in srgb, var(--danger) 72%, var(--text));
  background: color-mix(in srgb, var(--danger) 7%, var(--surface2)); }

.sa-settings { margin-top: 13px; display: grid; grid-template-columns: minmax(0, 1fr) minmax(150px, .55fr); gap: 10px; }
.sa-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.sa-label { font-size: 11.5px; font-weight: 650; color: var(--muted); }
.sa-select-wrap { position: relative; }
.sa-select { width: 100%; min-height: 44px; padding: 0 34px 0 11px; appearance: none;
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface2);
  color: var(--text); font: inherit; font-size: 13px; cursor: pointer; }
.sa-select:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.sa-select:disabled { opacity: .55; cursor: default; }
.sa-select-chevron { pointer-events: none; position: absolute; right: 10px; top: 50%;
  transform: translateY(-50%); color: var(--muted); }

.sa-details { border-top: 1px solid var(--border); }
.sa-summary { list-style: none; min-height: 48px; padding: 0 15px; display: flex; align-items: center;
  gap: 8px; cursor: pointer; color: var(--muted); font-size: 12.5px; font-weight: 600; }
.sa-summary::-webkit-details-marker { display: none; }
.sa-summary:hover { color: var(--text); background: var(--surface2); }
.sa-summary:focus-visible { outline: 2px solid var(--accent); outline-offset: -3px; }
.sa-summary svg { margin-left: auto; transition: transform .16s ease; }
.sa-details[open] .sa-summary svg { transform: rotate(180deg); }
.sa-models { padding: 0 15px 13px; display: grid; gap: 7px; }
.sa-model-row { padding: 9px 10px; border-radius: 9px; background: var(--surface2);
  display: flex; align-items: flex-start; gap: 10px; }
.sa-model-copy { min-width: 0; flex: 1; }
.sa-model-name { font-size: 12.5px; font-weight: 650; }
.sa-model-id { margin-top: 2px; color: var(--muted); font-family: var(--mono); font-size: 10.5px; overflow-wrap: anywhere; }
.sa-model-role { margin-top: 4px; color: var(--muted); font-size: 11.5px; line-height: 1.35; }
.sa-default-chip { flex: 0 0 auto; padding: 3px 7px; border-radius: 999px;
  background: var(--accent-dim); color: var(--accent); font-size: 10px; font-weight: 700; }

.sa-skeleton { height: 218px; border: 1px solid var(--border); border-radius: 16px;
  background: var(--surface); overflow: hidden; position: relative; }
.sa-skeleton::after { content: ''; position: absolute; inset: 0; transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, var(--surface2), transparent); animation: sa-shimmer 1.15s infinite; }
.sa-toast { position: absolute; left: 50%; bottom: 22px; z-index: 10; transform: translateX(-50%);
  max-width: calc(100% - 32px); padding: 9px 14px; border-radius: 10px;
  background: var(--text); color: var(--bg); box-shadow: 0 8px 28px rgba(0,0,0,.25);
  font-size: 12.5px; font-weight: 600; text-align: center; }

@keyframes sa-spin { to { transform: rotate(360deg); } }
@keyframes sa-shimmer { to { transform: translateX(100%); } }
@media (max-width: 560px) {
  .sa-page { padding: 12px 12px 44px; }
  .sa-header { padding-left: 12px; padding-right: 12px; }
  .sa-settings { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) {
  .sa-track, .sa-knob, .sa-summary svg { transition: none; }
  .sa-refresh.is-spinning svg, .sa-skeleton::after { animation: none; }
}

/* mobius-ui:CenteredRail v1 */
@media (min-width: 900px) {
  .sa-root {

  }
  .sa-header { width: min(100%, 760px); margin-inline: auto; }
}
/* /mobius-ui:CenteredRail */
`

function ClaudeMark() {
  const rays = [
    [25, 4, 25, 17], [34, 7, 29, 18], [43, 13, 32, 21], [46, 24, 33, 24],
    [43, 35, 32, 28], [35, 43, 29, 31], [25, 46, 25, 33], [15, 43, 21, 31],
    [7, 36, 18, 28], [4, 25, 17, 25], [7, 14, 18, 21], [15, 7, 21, 18],
  ]
  return (
    <svg viewBox="0 0 50 50" aria-hidden="true">
      {rays.map((ray, i) => (
        <line key={i} x1={ray[0]} y1={ray[1]} x2={ray[2]} y2={ray[3]}
          stroke="#D97752" strokeWidth="5.8" strokeLinecap="round" />
      ))}
      <circle cx="25" cy="25" r="7.5" fill="#D97752" />
    </svg>
  )
}

function CodexMark() {
  return (
    <svg viewBox="0 0 50 50" aria-hidden="true">
      <path d="M14 42c-6-2-9-8-7-14-4-5-1-12 5-14 0-7 7-11 13-8 5-4 12-1 13 5 7 0 11 7 8 13 4 5 1 12-5 13-1 7-8 10-14 7-4 3-9 2-13-2Z"
        fill="#5B4BE2" />
      <path d="m18 17 7 9-7 9" fill="none" stroke="#fff" strokeWidth="4.4"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M29 35h10" stroke="#fff" strokeWidth="4.4" strokeLinecap="round" />
    </svg>
  )
}

function fallbackModels(provider) {
  return catalog.providers[provider]?.models || []
}

function normalizeConfig(value) {
  if (value?.providers && typeof value.providers === 'object') {
    return {
      version: 1,
      providers: Object.fromEntries(PROVIDER_IDS.map((id) => {
        const row = value.providers[id] || {}
        return [id, {
          enabled: row.enabled === true,
          default_model: row.default_model || null,
          default_effort: row.default_effort || null,
        }]
      })),
    }
  }
  const legacyPresent = !!value && Object.keys(value).length > 0
  return {
    version: 1,
    providers: {
      claude: { enabled: false, default_model: null, default_effort: null },
      codex: {
        enabled: legacyPresent ? value.enabled !== false : false,
        default_model: value?.default || catalog.providers.codex.default_model,
        default_effort: null,
      },
    },
  }
}

function mergeModels(provider, live) {
  const fallback = fallbackModels(provider)
  const metadata = new Map(fallback.map((row) => [row.id, row]))
  const rows = Array.isArray(live) && live.length ? live : fallback
  return rows.map((row) => ({
    ...metadata.get(row.id),
    ...row,
    name: row.name || metadata.get(row.id)?.name || row.id,
  }))
}

function runtimePresentation(runtime) {
  if (!runtime?.state) return null
  if (runtime.state === 'available') {
    return { label: 'Ready', tone: 'good' }
  }
  if (runtime.state === 'quota_limited') {
    return {
      label: 'Allowance used',
      tone: 'quiet',
      text: 'This provider has used its current allowance. It stays connected and will be ready again when the allowance resets or changes.',
    }
  }
  if (runtime.state === 'auth_error') {
    return { label: 'Reconnect', tone: 'warn', text: 'Reconnect this provider in Möbius Settings to use it again.' }
  }
  return {
    label: 'Unavailable for now',
    tone: 'quiet',
    text: 'This provider could not complete its latest request. It remains connected, so you can try again later.',
  }
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return null
  return new Intl.NumberFormat(undefined, { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value)
}

function formatCost(value) {
  if (!Number.isFinite(value)) return null
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

function formatDuration(row) {
  if (!row.started_at) return null
  const start = new Date(row.started_at).getTime()
  const end = row.ended_at ? new Date(row.ended_at).getTime() : Date.now()
  const seconds = Math.max(0, Math.round((end - start) / 1000))
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

function statusTone(status) {
  if (ACTIVE_STATUSES.has(status)) return 'active'
  if (status === 'completed') return 'done'
  return 'failed'
}

const PROVIDER_LABEL = { claude: 'Claude', codex: 'Codex' }

function RunRow({ row, expanded, detail, detailBusy, cancelArmed, onToggle, onCancel }) {
  const duration = formatDuration(row)
  const tokens = formatNumber(row.usage?.total_tokens)
  const cost = formatCost(row.usage?.cost_usd)
  const open = expanded === row.id
  const active = ACTIVE_STATUSES.has(row.status)
  return (
    <div className="sa-run">
      <button className="sa-run-row" onClick={() => onToggle(row)} aria-expanded={open}>
        <div>
          <div className="sa-run-name">{row.task_key}</div>
          <div className="sa-run-meta">
            <span>{PROVIDER_LABEL[row.provider] || row.provider}</span>
            {row.model && <span>{row.model}</span>}
            <span>{row.scope === 'read' ? 'Read only' : 'Can edit'}</span>
            {duration && <span>{duration}</span>}
            {tokens && <span>{tokens} tokens</span>}
            {cost && <span>{cost}</span>}
          </div>
        </div>
        <span className={`sa-run-status is-${statusTone(row.status)}`}>{row.status.replace('_', ' ')}</span>
      </button>
      {open && (
        <div className="sa-run-detail">
          <div className="sa-run-result">{detailBusy ? 'Loading result…' : detail?.result || (active ? 'This task is still working.' : 'No written result was recorded.')}</div>
          {active && (
            <div className="sa-run-actions">
              <button className="sa-action is-danger" onClick={() => onCancel(row)}>
                {cancelArmed === row.id ? 'Confirm stop' : 'Stop task'}
              </button>
              {cancelArmed === row.id && <span className="sa-section-note">Tap again to stop the provider run.</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RecentWork({ rows, expandedChat, onToggleChat, expanded, detail, detailBusy, cancelArmed, onToggle, onCancel }) {
  const chats = useMemo(() => groupDelegationsByChat(rows), [rows])
  return (
    <section className="sa-card">
      <div className="sa-work">
        <div className="sa-section-head">
          <div className="sa-section-title">Chats using subagents</div>
          {chats.length > 0 && (
            <div className="sa-section-note">{chats.length} chat{chats.length === 1 ? '' : 's'} · {rows.length} run{rows.length === 1 ? '' : 's'}</div>
          )}
        </div>
        {!chats.length ? <div className="sa-empty">No delegated work yet. When an agent asks Claude or Codex for a bounded task, the chat that ran it will appear here.</div> : (
          <div className="sa-run-list">
            {chats.map((chat) => {
              const open = expandedChat === chat.chatId
              return (
                <div className="sa-run" key={chat.chatId}>
                  <button className="sa-run-row" onClick={() => onToggleChat(chat.chatId)} aria-expanded={open}>
                    <div>
                      <div className="sa-run-name">{chat.title}</div>
                      <div className="sa-run-meta">
                        <span>{chat.count} run{chat.count === 1 ? '' : 's'}</span>
                        {chat.providers.map((p) => <span key={p} className={`sa-badge is-${p}`}>{PROVIDER_LABEL[p] || p}</span>)}
                        {chat.models.map((m) => <span key={m}>{m}</span>)}
                      </div>
                    </div>
                    {chat.active > 0 && <span className="sa-run-status is-active">{chat.active} running</span>}
                  </button>
                  {open && (
                    <div className="sa-chat-runs">
                      {chat.runs.map((row) => (
                        <RunRow key={row.id} row={row} expanded={expanded} detail={detail}
                          detailBusy={detailBusy} cancelArmed={cancelArmed} onToggle={onToggle} onCancel={onCancel} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

function ProviderCard({ id, config, connection, models, runtime, busy, onPatch }) {
  const meta = catalog.providers[id]
  const connected = connection?.configured === true
  const statusKnown = connection != null
  const enabled = config.enabled === true
  const effectiveDefault = config.default_model || meta.default_model || ''
  const selected = models.find((row) => row.id === effectiveDefault)
  const efforts = selected?.effort_levels || meta.effort_levels || []
  const runtimeUI = runtimePresentation(runtime)
  const modelCount = models.length
  const isBusy = busy?.startsWith(id + ':')

  return (
    <section className={'sa-card' + (enabled ? ' is-enabled' : '')}>
      <div className="sa-card-main">
        <div className="sa-provider-head">
          <div className={`sa-provider-mark is-${id}`}>{id === 'claude' ? <ClaudeMark /> : <CodexMark />}</div>
          <div className="sa-provider-copy">
            <div className="sa-provider-name">
              {meta.name}
              {!statusKnown ? (
                <span className="sa-state">Checking…</span>
              ) : connected ? (
                <span className="sa-state is-good"><Check width={11} height={11} /> Connected</span>
              ) : (
                <span className="sa-state">Not connected</span>
              )}
              {runtimeUI && (
                <span className={'sa-state is-' + runtimeUI.tone}>{runtimeUI.label}</span>
              )}
            </div>
            <div className="sa-provider-desc">
              {!connected && statusKnown
                ? 'Connect this provider to make it available'
                : enabled ? 'Enabled for delegated work' : 'Paused until you enable it'}
            </div>
          </div>
          <button
            className={'sa-switch' + (enabled ? ' is-on' : '')}
            role="switch"
            aria-checked={enabled}
            aria-label={`${meta.name} ${enabled ? 'enabled — tap to pause' : 'paused — tap to enable'}`}
            disabled={!connected || isBusy}
            onClick={() => onPatch(id, { enabled: !enabled }, enabled ? `${meta.name} paused` : `${meta.name} enabled`)}
          >
            <span className="sa-track"><span className="sa-knob" /></span>
          </button>
        </div>

        {!connected && statusKnown && (
          <div className="sa-message is-note">
            <InfoCircle width={14} height={14} />
            <span>Connect {meta.name} in Möbius Settings to make it available here.</span>
          </div>
        )}
        {connected && runtimeUI?.text && (
          <div className={'sa-message ' + (runtimeUI.tone === 'warn' ? 'is-warn' : 'is-note')}>
            <InfoCircle width={14} height={14} />
            <span>{runtimeUI.text}</span>
          </div>
        )}

        <div className="sa-settings">
          <label className="sa-field">
            <span className="sa-label">Default model</span>
            <span className="sa-select-wrap">
              <select
                className="sa-select"
                value={config.default_model || ''}
                disabled={!statusKnown || isBusy}
                onChange={(e) => onPatch(id, { default_model: e.target.value || null }, `${meta.name} default updated`)}
              >
                <option value="">Provider default</option>
                {models.map((row) => <option key={row.id} value={row.id}>{row.name || row.id}</option>)}
              </select>
              <ChevronDown className="sa-select-chevron" width={15} height={15} />
            </span>
          </label>
          <label className="sa-field">
            <span className="sa-label">Default effort</span>
            <span className="sa-select-wrap">
              <select
                className="sa-select"
                value={config.default_effort || ''}
                disabled={isBusy}
                onChange={(e) => onPatch(id, { default_effort: e.target.value || null }, `${meta.name} effort updated`)}
              >
                <option value="">Automatic</option>
                {efforts.map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
              <ChevronDown className="sa-select-chevron" width={15} height={15} />
            </span>
          </label>
        </div>
      </div>

      <details className="sa-details">
        <summary className="sa-summary">
          Browse {modelCount} {meta.name} model{modelCount === 1 ? '' : 's'}
          <ChevronDown width={16} height={16} />
        </summary>
        <div className="sa-models">
          {models.map((row) => {
            const isDefault = row.id === effectiveDefault
            return (
              <div className="sa-model-row" key={row.id}>
                <div className="sa-model-copy">
                  <div className="sa-model-name">{row.name || row.id}</div>
                  <div className="sa-model-id">{row.id}</div>
                  {row.role && <div className="sa-model-role">{row.role}</div>}
                </div>
                {isDefault && <span className="sa-default-chip">Default</span>}
              </div>
            )
          })}
        </div>
      </details>
    </section>
  )
}

export default function Subagents({ appId, token }) {
  const [config, setConfig] = useState(null)
  const [connections, setConnections] = useState(null)
  const [liveModels, setLiveModels] = useState({})
  const [runtime, setRuntime] = useState({})
  const [recent, setRecent] = useState([])
  const [expandedChat, setExpandedChat] = useState(null)
  const [expanded, setExpanded] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [cancelArmed, setCancelArmed] = useState(null)
  const [busy, setBusy] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState(null)
  const readySent = useRef(false)
  const migrationSaved = useRef(false)
  const recentRef = useRef([])
  const detailRequest = useRef(createLatestRequest())
  const hasActiveRecent = recent.some((row) => ACTIVE_STATUSES.has(row.status))

  const models = useMemo(() => Object.fromEntries(
    PROVIDER_IDS.map((id) => [id, mergeModels(id, liveModels[id])])
  ), [liveModels])

  function flash(message, duration = 1900) {
    setToast(message)
    window.setTimeout(() => setToast((current) => current === message ? null : current), duration)
  }

  async function refreshProviders() {
    if (!token) return
    setRefreshing(true)
    try {
      const headers = { Authorization: `Bearer ${token}` }
      const [statusRes, modelsRes, workRes, storedRuntime] = await Promise.all([
        fetch('/api/auth/providers/status', { headers }),
        fetch('/api/auth/providers/models', { headers }),
        fetch('/api/delegations?limit=200', { headers }),
        window.mobius?.storage?.get(STATUS_KEY).catch(() => null),
      ])
      if (!statusRes.ok) throw new Error(`Connection status returned ${statusRes.status}`)
      setConnections(await statusRes.json())
      if (modelsRes.ok) setLiveModels(await modelsRes.json())
      if (workRes.ok) setRecent((await workRes.json()).items || [])
      if (storedRuntime?.providers) setRuntime(storedRuntime.providers)
      window.mobius?.signal?.('providers_refreshed')
    } catch (error) {
      setConnections({})
      flash('Provider status could not be refreshed. Try again soon.', 2600)
      window.mobius?.signal?.('error', { message: error.message, source: 'provider-status' })
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    const store = window.mobius?.storage
    if (!store) {
      setConfig(normalizeConfig({}))
      return
    }
    let unsubConfig
    let unsubStatus
    try {
      unsubConfig = store.subscribe(CONFIG_KEY, async (value) => {
        const next = normalizeConfig(value || {})
        setConfig(next)
        if (!migrationSaved.current && value && !value.providers) {
          migrationSaved.current = true
          try { await store.set(CONFIG_KEY, next) } catch (error) {
            window.mobius?.signal?.('error', { message: error.message, source: 'config-migration' })
          }
        }
      })
      unsubStatus = store.subscribe(STATUS_KEY, (value) => setRuntime(value?.providers || {}))
    } catch (error) {
      setConfig(normalizeConfig({}))
      window.mobius?.signal?.('error', { message: error.message, source: 'storage-subscribe' })
    }
    return () => {
      try { unsubConfig?.() } catch (error) {}
      try { unsubStatus?.() } catch (error) {}
    }
  }, [])

  useEffect(() => { refreshProviders() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { recentRef.current = recent }, [recent])

  useEffect(() => {
    if (!token || !hasActiveRecent) return undefined
    let disposed = false
    const headers = { Authorization: `Bearer ${token}` }
    async function pollRecent() {
      if (document.visibilityState === 'hidden') return
      try {
        const res = await fetch('/api/delegations?limit=200', { headers })
        if (!res.ok) return
        const items = (await res.json()).items || []
        if (disposed) return
        const before = recentRef.current.find((row) => row.id === expanded)
        const after = items.find((row) => row.id === expanded)
        setRecent(items)
        if (finishedSince(before, after)) {
          loadRunDetail(after.id)
        }
      } catch (error) {
        if (!disposed) window.mobius?.signal?.('error', { message: error.message, source: 'delegation-refresh' })
      }
    }
    const timer = window.setInterval(pollRecent, 5000)
    const onVisibility = () => { if (document.visibilityState === 'visible') pollRecent() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [token, hasActiveRecent, expanded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => detailRequest.current.abort(), [])

  useEffect(() => {
    if (readySent.current || !config || connections == null) return
    readySent.current = true
    const connected = PROVIDER_IDS.filter((id) => connections[id]?.configured === true).length
    const enabled = PROVIDER_IDS.filter((id) => config.providers[id]?.enabled === true).length
    window.mobius?.signal?.('app_ready', { connected, enabled })
  }, [config, connections])

  async function patchProvider(id, patch, message) {
    const store = window.mobius?.storage
    if (!store || !config || busy) return
    const previous = config
    const next = {
      ...config,
      providers: {
        ...config.providers,
        [id]: { ...config.providers[id], ...patch },
      },
    }
    setBusy(`${id}:save`)
    setConfig(next)
    try {
      await store.set(CONFIG_KEY, next)
      flash(message)
      window.mobius?.signal?.('provider_setting_changed', {
        provider: id,
        setting: Object.keys(patch)[0],
      })
    } catch (error) {
      setConfig(previous)
      flash('That change was not saved. Please try again.', 2400)
      window.mobius?.signal?.('error', { message: error.message, source: 'config-save' })
    } finally {
      setBusy(null)
    }
  }

  async function loadRunDetail(rowId) {
    const request = detailRequest.current.begin()
    setDetailBusy(true)
    try {
      const res = await fetch(`/api/delegations/${rowId}`, {
        headers: { Authorization: `Bearer ${token}` }, signal: request.signal,
      })
      if (!res.ok) throw new Error(`Result returned ${res.status}`)
      const next = await res.json()
      if (detailRequest.current.isCurrent(request.sequence)) setDetail(next)
    } catch (error) {
      if (error.name === 'AbortError') return
      if (detailRequest.current.isCurrent(request.sequence)) {
        flash('That result could not be loaded. Try refreshing.', 2500)
        window.mobius?.signal?.('error', { message: error.message, source: 'delegation-result' })
      }
    } finally {
      if (detailRequest.current.isCurrent(request.sequence)) setDetailBusy(false)
    }
  }

  function toggleChat(chatId) {
    detailRequest.current.abort()
    setExpanded(null); setDetail(null); setDetailBusy(false); setCancelArmed(null)
    setExpandedChat((current) => (current === chatId ? null : chatId))
  }

  async function toggleRun(row) {
    if (expanded === row.id) {
      detailRequest.current.abort()
      setExpanded(null); setDetail(null); setDetailBusy(false); setCancelArmed(null); return
    }
    setExpanded(row.id); setDetail(null); setCancelArmed(null)
    loadRunDetail(row.id)
  }

  async function cancelRun(row) {
    if (cancelArmed !== row.id) { setCancelArmed(row.id); return }
    const request = detailRequest.current.begin()
    setCancelArmed(null); setDetailBusy(true)
    try {
      const res = await fetch(`/api/delegations/${row.id}/cancel`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}', signal: request.signal,
      })
      if (!res.ok) throw new Error(`Stop returned ${res.status}`)
      const next = await res.json()
      if (!detailRequest.current.isCurrent(request.sequence)) return
      setDetail(next)
      setRecent((items) => items.map((item) => item.id === row.id ? { ...item, ...next } : item))
      flash(cancellationMessage(next.status))
      window.mobius?.signal?.('delegation_cancelled', { provider: row.provider })
    } catch (error) {
      if (error.name === 'AbortError') return
      flash('The task is still running. Try again shortly.', 2600)
      window.mobius?.signal?.('error', { message: error.message, source: 'delegation-cancel' })
    } finally {
      if (detailRequest.current.isCurrent(request.sequence)) setDetailBusy(false)
    }
  }

  return (
    <div className="sa-root">
      <style>{CSS}</style>
      <header className="sa-header">
        <div className="sa-header-inner">
        <img className="sa-logo" src={`/api/apps/${appId}/icon?size=64`} alt="" onError={(event) => { event.currentTarget.style.display = 'none'; event.currentTarget.nextElementSibling.style.display = 'grid' }} />
        <span className="sa-logo sa-logo-fallback" style={{ display: 'none' }} aria-hidden="true">S</span>
        <div className="sa-titles">
          <div className="sa-title">Subagents</div>
          <div className="sa-subtitle">Claude and Codex delegation</div>
        </div>
        <button className={'sa-refresh' + (refreshing ? ' is-spinning' : '')}
          onClick={refreshProviders} disabled={refreshing} aria-label="Refresh provider status">
          <ArrowRotateCw width={18} height={18} />
        </button>
        </div>
      </header>

      <main className="sa-page">
        {!config ? (
          <>
            <div className="sa-skeleton" />
            <div className="sa-skeleton" />
          </>
        ) : (
          <>
            {PROVIDER_IDS.map((id) => (
              <ProviderCard key={id} id={id} config={config.providers[id]}
                connection={connections?.[id]} models={models[id]} runtime={runtime[id]}
                busy={busy} onPatch={patchProvider} />
            ))}
            <RecentWork rows={recent} expandedChat={expandedChat} onToggleChat={toggleChat}
              expanded={expanded} detail={detail} detailBusy={detailBusy}
              cancelArmed={cancelArmed} onToggle={toggleRun} onCancel={cancelRun} />
          </>
        )}
      </main>
      {toast && <div className="sa-toast" role="status">{toast}</div>}
    </div>
  )
}
