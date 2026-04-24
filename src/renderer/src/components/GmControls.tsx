import React, { useEffect, useState } from 'react'
import { Stack, Button, Paper, Text, Badge, Group, Divider, Tooltip, Box } from '@mantine/core'
import {
  IconSwords, IconPlayerPlay, IconPlayerPause, IconPlayerSkipForward,
  IconFlag, IconDeviceTv, IconSkull, IconRotateClockwise,
  IconArrowBackUp, IconArrowBackUpDouble, IconPlayerSkipBack, IconClipboardList,
} from '@tabler/icons-react'
import type { TCStatePayload, StageDefinition } from '@shared/types'
import './GmControls.css'

// ── Tooltip text helpers ─────────────────────────────────────────────────────

function releaseTooltip(
  isGMHold: boolean,
  isActive: boolean,
  isSpin: boolean,
  stage: StageDefinition | undefined,
  opsComplete: boolean
): string {
  if (isGMHold) {
    return 'Starts the player countdown for this stage.\n\nNo beats are charged yet — the beat clock begins ticking from the moment you release.'
  }
  if (isActive) {
    if (stage?.type === 'gm-release') {
      return 'Ends this narrative stage and advances. This stage type has no beat cost — releasing has no effect on the beat budget.'
    }
    return 'Ends this stage early.\n\nBeats are charged proportionally to elapsed time. Unelapsed beats carry forward to the next stage, extending it — nothing is lost from the budget.'
  }
  if (isSpin) {
    if (opsComplete) return 'Ends the spin window early and advances to the next stage.'
    return 'Waiting for background processing to finish before the spin window can end.'
  }
  return 'Not available in the current state.'
}

function passTooltip(isGMHold: boolean): string {
  if (isGMHold) {
    return 'Skips this stage before the timer starts.\n\nThe full beat cost of this stage is charged — the window existed in the timeline regardless of whether the timer ran.\n\nUnlike GM Release, no beats carry forward.'
  }
  return 'Skips the remainder of this stage.\n\nThe full beat cost of this stage is charged — no carry-forward. This represents the characters doing nothing during the window.\n\nUnlike GM Release, unelapsed beats are NOT carried to the next stage.'
}

function stageResetTooltip(): string {
  return 'Restarts the current stage from its beginning.\n\nThe beat clock is restored to where it was when this stage started. Any extra beats added by a carry-forward are preserved.\n\nUse this to grant the group a redo on the current stage.'
}

function tierResetTooltip(): string {
  return 'Restarts the entire current Action Tier from its opening Action stage.\n\nThe beat clock is restored to where it was at the start of this tier. All stages in the tier repeat.\n\nUse this to grant the group a full redo of the tier.'
}

function roundResetTooltip(): string {
  return 'Restarts the entire current round from the beginning.\n\nThe beat clock is restored to the full beat budget and the stage pipeline is rebuilt from scratch.\n\nUse this to grant the group a complete redo of the round.'
}

// ── Style constants ──────────────────────────────────────────────────────────

const tipProps = {
  multiline: true,
  w: 260,
  withArrow: true,
  openDelay: 350,
  style: { whiteSpace: 'pre-line' as const },
} as const

// Inactive: thematic dead colour — blends toward the background, clearly unavailable.
// Applied via CSS custom-property overrides so inline styles beat Mantine's [data-disabled].
const INACTIVE: React.CSSProperties = {
  '--button-bg':    'var(--tm-inactive-bg)',
  '--button-hover': 'var(--tm-inactive-bg)',
  '--button-color': 'var(--tm-inactive-text)',
  '--button-bd':    '1px solid var(--tm-inactive-border)',
  opacity: 1,
} as React.CSSProperties

// Danger: burnt/rusty thematic colour for the danger-zone buttons.
const DANGER: React.CSSProperties = {
  '--button-bg':    'var(--tm-danger-zone-bg)',
  '--button-hover': 'color-mix(in srgb, var(--tm-danger-zone-bg) 80%, var(--tm-danger-zone-text))',
  '--button-color': 'var(--tm-danger-zone-text)',
  '--button-bd':    '1px solid var(--tm-danger-zone-border)',
  opacity: 1,
} as React.CSSProperties

// ── Slot helper ──────────────────────────────────────────────────────────────
// Renders a full-width grid-cell button that is either active (Mantine colour/variant)
// or inactive (INACTIVE CSS-var override + disabled + not-allowed cursor).
// Inactive buttons get a short one-sentence tooltip; active buttons get the full tip.

interface SlotProps {
  label: string
  icon: React.ReactNode
  can: boolean
  onClick?: () => void
  color?: string
  variant?: string
  inactiveTip: string
  tip: string
  pulse?: boolean
}

function Slot({ label, icon, can, onClick, color = 'green', variant = 'filled', inactiveTip, tip, pulse }: SlotProps): JSX.Element {
  if (!can) {
    return (
      <Tooltip label={inactiveTip} {...tipProps}>
        <Box style={{ cursor: 'not-allowed', width: '100%' }}>
          <Button
            leftSection={icon}
            disabled
            fullWidth
            style={{ ...INACTIVE, pointerEvents: 'none' }}
          >
            {label}
          </Button>
        </Box>
      </Tooltip>
    )
  }
  return (
    <Tooltip label={tip} {...tipProps}>
      <Button
        leftSection={icon}
        color={color}
        variant={variant as any}
        onClick={onClick}
        fullWidth
        className={pulse ? 'tm-release-waiting' : undefined}
      >
        {label}
      </Button>
    </Tooltip>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

interface GmControlsProps {
  onBattleLogOpen?: () => void
}

export function GmControls({ onBattleLogOpen }: GmControlsProps): JSX.Element {
  const [tc, setTc] = useState<TCStatePayload | null>(null)

  useEffect(() => {
    window.api.onStateUpdate((state) => setTc(state))
    return () => window.api.offStateUpdate()
  }, [])

  const machineState  = tc?.machineState ?? 'idle'
  const isIdle        = machineState === 'idle'
  const isGMHold      = machineState === 'stageGMHold'
  const isActive      = machineState === 'stageActive'
  const isPaused      = machineState === 'stagePaused'
  const isSpin        = machineState === 'stageSpin'
  const isSpinPaused  = machineState === 'stageSpinPaused'
  const isComplete    = machineState === 'tcComplete'
  const isBattleEnded = machineState === 'battleEnded'

  const currentStage  = tc?.stages[tc.currentStageIndex ?? 0]
  const inCombat      = !isIdle

  const canRelease    = isGMHold ||
                        (isActive && (currentStage?.type === 'gm-release' || (currentStage?.timerSeconds ?? 0) > 0)) ||
                        (isSpin && tc?.backgroundOpsComplete === true)
  const releaseActive    = inCombat && !isComplete && !isBattleEnded && canRelease
  const isReleaseEmphatic = isGMHold || (isActive && currentStage?.type === 'gm-release')
  const releasePulse     = releaseActive && isReleaseEmphatic

  const canPass       = (isGMHold || isActive || isPaused) && currentStage?.canPass === true
  const canPause      = (isActive && currentStage?.type !== 'gm-release') || isSpin
  const canResume     = isPaused || isSpinPaused

  // isActivityStage mirrors isTimedStageType() from shared/types.ts (type-only import).
  const isActivityStage = currentStage?.type === 'timed' || currentStage?.type === 'action' || currentStage?.type === 'response'
  const canStageReset = (isActive || isPaused || isSpin || isSpinPaused) && inCombat && isActivityStage

  const canTierReset  = currentStage?.tierIndex !== undefined && inCombat &&
    (isActive || isPaused || isSpin || isSpinPaused || (isGMHold && currentStage?.type !== 'action'))

  const canRoundReset = (isActive || isPaused || isSpin || isSpinPaused || isGMHold) &&
                        (tc?.currentStageIndex ?? 0) > 0

  const canEndBattle  = !isIdle && !isBattleEnded
  const nextRound     = (tc?.round ?? 0) + 1

  function statusColor(): string {
    if (isComplete)               return 'yellow'
    if (isPaused || isSpinPaused) return 'orange'
    if (isActive || isSpin || isGMHold) return 'green'
    return 'gray'
  }

  // Permanent message area — one contextual line, or "No messages." when idle.
  let systemMessage: string | null = null
  if (isGMHold) {
    systemMessage = '⏳ GM hold — release to start player countdown, or pass to skip.'
  } else if (isActive && (tc?.timerSecondsRemaining ?? 0) > 0) {
    systemMessage = `⏱ ${tc!.timerSecondsRemaining}s remaining on stage timer.`
  } else if (isPaused) {
    systemMessage = `⏸ Stage timer paused at ${tc!.timerSecondsRemaining}s.`
  } else if (isSpin) {
    systemMessage = `⌛ Spin window: ${tc!.spinSecondsRemaining}s remaining.`
  } else if (isSpinPaused) {
    systemMessage = `⌛ Spin window paused at ${tc!.spinSecondsRemaining}s.`
  } else if (isComplete) {
    systemMessage = `TC complete — advance to round ${nextRound} when ready.`
  } else if (isBattleEnded) {
    systemMessage = 'Battle ended.'
  }

  // Inactive tooltip for GM Release varies by the reason it's unavailable.
  const releaseInactiveTip = (!inCombat || isComplete || isBattleEnded)
    ? 'Not available — no active stage to release.'
    : (isSpin && !tc?.backgroundOpsComplete)
    ? 'Waiting for background operations before the spin window can end.'
    : 'Not available in the current state.'

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
        Combat Controls
      </Text>

      {/* Status strip — machine state badge + round + current stage name */}
      <Paper p="sm" style={{ backgroundColor: 'var(--tm-surface)', border: '1px solid var(--tm-border)' }}>
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Badge color={statusColor()} variant="dot" size="sm">
              {machineState.replace(/([A-Z])/g, ' $1').trim()}
            </Badge>
            {tc && tc.round > 0 && (
              <Text size="xs" c="dimmed">Round {tc.round}</Text>
            )}
          </Group>
          {currentStage && (
            <Text size="xs" c="dimmed">{currentStage.name}</Text>
          )}
        </Group>
      </Paper>

      <Divider color="var(--tm-border)" />

      {/* Fixed 3×3 button grid — all nine slots always present */}
      <Box style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>

        {/* Row 1: Start Combat / Next Round | Launch HUD | Battle Log */}

        {isComplete ? (
          <Slot
            label="Next Round"
            icon={<IconPlayerSkipForward size={16} />}
            can
            onClick={() => window.api.nextRound()}
            color="blue"
            inactiveTip=""
            tip={`Advances to round ${nextRound}. The beat budget resets to the full ${tc?.totalBeats ?? 60} beats and the stage pipeline is rebuilt for the new round.`}
          />
        ) : (
          <Slot
            label="Start Combat"
            icon={<IconSwords size={16} />}
            can={isIdle}
            onClick={() => window.api.startCombat()}
            color="green"
            inactiveTip="Not available — an active battle is already in progress."
            tip="Starts the Tactical Cycle and builds the stage pipeline for round 1."
          />
        )}

        <Slot
          label="Launch HUD"
          icon={<IconDeviceTv size={16} />}
          can={inCombat}
          onClick={() => window.api.launchHUD()}
          color="blue"
          variant="outline"
          inactiveTip="Available only during an active battle."
          tip="Opens the Group HUD window for display on a second screen."
        />

        {/* Battle Log is always interactive */}
        <Tooltip label="Opens the battle beat log — a timeline of stage starts, releases, and passes with beat positions." {...tipProps}>
          <Button leftSection={<IconClipboardList size={16} />} variant="outline" onClick={() => onBattleLogOpen?.()} fullWidth>
            Battle Log
          </Button>
        </Tooltip>

        {/* Row 2: GM Release | Pass Stage | Pause / Resume */}

        <Slot
          label="GM Release"
          icon={<IconFlag size={16} />}
          can={releaseActive}
          onClick={() => window.api.gmRelease()}
          color={isReleaseEmphatic ? 'var(--tm-accent)' : 'green'}
          variant={isReleaseEmphatic ? 'filled' : 'light'}
          inactiveTip={releaseInactiveTip}
          tip={releaseTooltip(isGMHold, isActive, isSpin, currentStage, tc?.backgroundOpsComplete ?? false)}
          pulse={releasePulse}
        />

        <Slot
          label="Pass Stage"
          icon={<IconPlayerSkipForward size={16} />}
          can={canPass}
          onClick={() => window.api.pass()}
          color="blue"
          variant="light"
          inactiveTip="Passing is not available for this stage type or state."
          tip={passTooltip(isGMHold)}
        />

        {/* Pause/Resume share slot 6 — Resume shown only while paused, Pause otherwise */}
        {canResume ? (
          <Slot
            label="Resume"
            icon={<IconPlayerPlay size={16} />}
            can
            onClick={() => window.api.resume()}
            color="green"
            inactiveTip=""
            tip={isSpinPaused
              ? 'Resumes the spin countdown from where it was frozen.'
              : 'Resumes the player countdown from where it was frozen. Beat accumulation continues.'}
          />
        ) : (
          <Slot
            label="Pause"
            icon={<IconPlayerPause size={16} />}
            can={canPause}
            onClick={() => window.api.pause()}
            color="orange"
            variant="light"
            inactiveTip="Available only while a stage timer is actively running."
            tip={isSpin ? 'Freezes the spin countdown.' : 'Freezes the player countdown timer. Beats stop accumulating while paused.'}
          />
        )}

        {/* Row 3: Stage Reset | Tier Reset | Round Reset */}

        <Slot
          label="Stage Reset"
          icon={<IconArrowBackUp size={16} />}
          can={canStageReset}
          onClick={() => window.api.stageReset()}
          color="orange"
          variant="outline"
          inactiveTip="Stage Reset is not available for this stage type or state."
          tip={stageResetTooltip()}
        />

        <Slot
          label="Tier Reset"
          icon={<IconPlayerSkipBack size={16} />}
          can={canTierReset}
          onClick={() => window.api.tierReset()}
          color="orange"
          variant="outline"
          inactiveTip="Tier Reset is not available outside of an Action Tier stage."
          tip={tierResetTooltip()}
        />

        <Slot
          label="Round Reset"
          icon={<IconArrowBackUpDouble size={16} />}
          can={canRoundReset}
          onClick={() => window.api.roundReset()}
          color="red"
          variant="outline"
          inactiveTip="Available only after the first stage of the round."
          tip={roundResetTooltip()}
        />
      </Box>

      {/* Permanent message area — always visible, dimmed "No messages." when quiet */}
      <Paper p="sm" style={{ backgroundColor: 'var(--tm-surface)', border: '1px solid var(--tm-border)' }}>
        {systemMessage ? (
          <Text size="xs" c="var(--tm-accent)" fw={600}>{systemMessage}</Text>
        ) : (
          <Text size="xs" c="dimmed" fs="italic">No messages.</Text>
        )}
      </Paper>

      <Divider color="var(--tm-border)" />

      {/* Danger zone — End Battle + Reset Battle; both use the burnt thematic colour */}
      <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {canEndBattle ? (
          <Tooltip label="Ends the battle immediately. All timers stop and the Group HUD shows the end screen." {...tipProps}>
            <Button leftSection={<IconSkull size={16} />} fullWidth style={DANGER} onClick={() => window.api.endBattle()}>
              End Battle
            </Button>
          </Tooltip>
        ) : (
          <Tooltip label="Not available — no battle is currently in progress." {...tipProps}>
            <Box style={{ cursor: 'not-allowed', width: '100%' }}>
              <Button leftSection={<IconSkull size={16} />} disabled fullWidth style={{ ...INACTIVE, pointerEvents: 'none' }}>
                End Battle
              </Button>
            </Box>
          </Tooltip>
        )}

        <Tooltip label="Resets everything to idle — clears all round, stage, and beat state. This cannot be undone." {...tipProps}>
          <Button leftSection={<IconRotateClockwise size={16} />} fullWidth style={DANGER} onClick={() => window.api.resetBattle()}>
            Reset Battle
          </Button>
        </Tooltip>
      </Box>
    </Stack>
  )
}
