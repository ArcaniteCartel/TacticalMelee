import React, { useEffect, useState } from 'react'
import { Stack, Group, Button, Paper, Text, Badge, Divider, CloseButton, Tooltip, Box } from '@mantine/core'
import {
  IconSwords, IconPlayerPlay, IconPlayerPause, IconPlayerSkipForward,
  IconFlag, IconDeviceTv, IconSkull, IconRotateClockwise, IconClock,
} from '@tabler/icons-react'
import type { TCStatePayload, StageDefinition } from '@shared/types'

// ── Tooltip text helpers ─────────────────────────────────────────────────────
// Each function returns a context-appropriate explanation for its control.
// Beat-effect differences between GM Release and GM Pass are explicitly called out.

/**
 * Context-sensitive tooltip for the GM Release button.
 * The effect of Release changes significantly depending on current machine state:
 *   stageGMHold  → starts the player countdown (no beats charged yet)
 *   stageActive  → ends stage early with proportional beat charge
 *   stageSpin    → ends spin window early (only when ops complete)
 */
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
    return 'Ends this stage early.\n\nBeats are charged proportionally to elapsed time only. If half the timer ran, half the stage\'s beats are consumed. The unelapsed time is forfeited.'
  }
  if (isSpin) {
    if (opsComplete) return 'Ends the spin window early and advances to the next stage.'
    return 'Waiting for background processing to finish before the spin window can end.'
  }
  return 'Not available in the current state.'
}

/**
 * Context-sensitive tooltip for the Pass Stage button.
 * Pass always consumes zero beats — the budget is restored to where it was
 * when the stage was entered. This is distinct from GM Release, which charges
 * proportional beats for any time already elapsed.
 */
function passTooltip(isGMHold: boolean): string {
  if (isGMHold) {
    return 'Skips this stage before the timer starts.\n\nZero beats consumed — the beat budget is fully restored to its value at stage entry. Nothing is charged.'
  }
  return 'Skips the remainder of this stage.\n\nZero beats consumed — the beat budget is restored to its value when this stage began.\n\nUnlike GM Release, no elapsed time is charged against the budget.'
}

// ── Component ────────────────────────────────────────────────────────────────

export function GmControls(): JSX.Element {
  const [tc, setTc] = useState<TCStatePayload | null>(null)
  const [gmHoldDismissed, setGmHoldDismissed] = useState(false)

  useEffect(() => {
    window.api.onStateUpdate((state) => setTc(state))
    return () => window.api.offStateUpdate()
  }, [])

  // Flatten tc state into named booleans for readability throughout the render.
  // Defaults to 'idle' when no state has been received yet (tc is null on first render).
  const machineState   = tc?.machineState ?? 'idle'
  const isIdle         = machineState === 'idle'
  const isGMHold       = machineState === 'stageGMHold'
  const isActive       = machineState === 'stageActive'
  const isPaused       = machineState === 'stagePaused'
  const isSpin         = machineState === 'stageSpin'
  const isSpinPaused   = machineState === 'stageSpinPaused'
  const isComplete     = machineState === 'tcComplete'
  const isBattleEnded  = machineState === 'battleEnded'

  const currentStage   = tc?.stages[tc.currentStageIndex ?? 0]
  const inCombat       = !isIdle

  // Reset banner dismiss whenever a new GM hold is entered
  useEffect(() => {
    if (isGMHold) setGmHoldDismissed(false)
  }, [isGMHold])

  // GM Release:
  //   stageGMHold  → starts the player countdown (always enabled)
  //   stageActive  → ends stage early, partial beats consumed
  //   stageSpin    → ends spin early when ops complete
  const canRelease     = isGMHold ||
                         (isActive && (currentStage?.type === 'gm-release' || (currentStage?.timerSeconds ?? 0) > 0)) ||
                         (isSpin && tc?.backgroundOpsComplete === true)
  const showRelease    = inCombat && !isComplete && !isBattleEnded

  // GM Pass: skips stage, zero beats consumed. Available in hold phase (skips before timer starts).
  const canPass        = (isGMHold || isActive || isPaused) && currentStage?.canPass === true

  // Pause: all non-gm-release stages in stageActive or stageSpin. NOT during stageGMHold.
  const canPause       = (isActive && currentStage?.type !== 'gm-release') || isSpin
  const canResume      = isPaused || isSpinPaused

  const canEndBattle   = !isIdle && !isBattleEnded
  const canReset       = true

  const showGMHoldBanner = isGMHold && !gmHoldDismissed
  const nextRound        = (tc?.round ?? 0) + 1

  // Maps machine state to a status dot color for the Badge.
  // green = something is actively running (player clock, spin window, or GM hold).
  // orange = paused (either the player clock or the spin window).
  // yellow = TC finished, awaiting Next Round.
  // gray = idle or ended — nothing running.
  function statusColor(): string {
    if (isComplete)               return 'yellow'
    if (isPaused || isSpinPaused) return 'orange'
    if (isActive || isSpin || isGMHold) return 'green'
    return 'gray'
  }

  // Shared tooltip props — consistent delay and style across all controls
  const tipProps = { multiline: true, w: 260, withArrow: true, openDelay: 350, style: { whiteSpace: 'pre-line' } } as const

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
        Combat Controls
      </Text>

      {/* Status strip */}
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

        {isGMHold && (
          <Text size="xs" c="var(--tm-accent)" mt={4}>
            ⏳ GM hold — release to start player countdown
          </Text>
        )}
        {isActive && (tc?.timerSecondsRemaining ?? 0) > 0 && (
          <Text size="xs" c="var(--tm-accent)" mt={4}>
            ⏱ {tc!.timerSecondsRemaining}s remaining
          </Text>
        )}
        {(isSpin || isSpinPaused) && (
          <Text size="xs" c="dimmed" mt={4}>
            ⌛ spin {tc!.spinSecondsRemaining}s{isSpinPaused ? ' (paused)' : ''}
          </Text>
        )}
      </Paper>

      {/* GM Hold info banner — shown while HUD is waiting for GM to release or pass */}
      {showGMHoldBanner && (
        <Paper
          p="sm"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--tm-accent) 12%, transparent)',
            border: '1px solid var(--tm-accent)',
            borderRadius: 'var(--mantine-radius-default)',
          }}
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap="xs" align="center" wrap="nowrap">
              <IconClock size={14} color="var(--tm-accent)" style={{ flexShrink: 0 }} />
              <Text size="xs" c="var(--tm-accent)" fw={600}>
                HUD waiting for GM — release to start player countdown, or pass to skip stage
              </Text>
            </Group>
            <CloseButton
              size="xs"
              style={{ color: 'var(--tm-accent)', flexShrink: 0 }}
              onClick={() => setGmHoldDismissed(true)}
            />
          </Group>
        </Paper>
      )}

      <Divider color="var(--tm-border)" />

      {/* Primary action buttons */}
      <Group gap="sm" wrap="wrap">
        {isIdle && (
          <Tooltip label="Starts the Tactical Cycle and builds the stage pipeline for round 1." {...tipProps}>
            <Button
              leftSection={<IconSwords size={16} />}
              color="green"
              onClick={() => window.api.startCombat()}
            >
              Start Combat
            </Button>
          </Tooltip>
        )}

        {inCombat && (
          <Tooltip label="Opens the Group HUD window for display on a second screen." {...tipProps}>
            <Button
              leftSection={<IconDeviceTv size={16} />}
              variant="outline"
              onClick={() => window.api.launchHUD()}
            >
              Launch Group HUD
            </Button>
          </Tooltip>
        )}

        {showRelease && (
          // Wrap in Box so the tooltip still renders even when the button is disabled
          <Tooltip
            label={releaseTooltip(isGMHold, isActive, isSpin, currentStage, tc?.backgroundOpsComplete ?? false)}
            {...tipProps}
          >
            <Box component="span" style={{ display: 'inline-flex' }}>
              <Button
                leftSection={<IconFlag size={16} />}
                color="var(--tm-accent)"
                variant="filled"
                disabled={!canRelease}
                style={!canRelease ? { pointerEvents: 'none' } : undefined}
                onClick={() => window.api.gmRelease()}
              >
                GM Release
              </Button>
            </Box>
          </Tooltip>
        )}

        {canPass && (
          <Tooltip label={passTooltip(isGMHold)} {...tipProps}>
            <Button
              leftSection={<IconPlayerSkipForward size={16} />}
              variant="light"
              onClick={() => window.api.pass()}
            >
              Pass Stage
            </Button>
          </Tooltip>
        )}

        {canPause && (
          <Tooltip
            label={isSpin ? 'Freezes the spin countdown.' : 'Freezes the player countdown timer. Beats stop accumulating while paused.'}
            {...tipProps}
          >
            <Button
              leftSection={<IconPlayerPause size={16} />}
              color="orange"
              variant="light"
              onClick={() => window.api.pause()}
            >
              Pause
            </Button>
          </Tooltip>
        )}

        {canResume && (
          <Tooltip
            label={isSpinPaused ? 'Resumes the spin countdown from where it was frozen.' : 'Resumes the player countdown from where it was frozen. Beat accumulation continues.'}
            {...tipProps}
          >
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              color="green"
              onClick={() => window.api.resume()}
            >
              Resume
            </Button>
          </Tooltip>
        )}

        {isComplete && (
          <Tooltip
            label={`Advances to round ${nextRound}. The beat budget resets to the full ${tc?.totalBeats ?? 72} beats and the stage pipeline is rebuilt for the new round.`}
            {...tipProps}
          >
            <Button
              leftSection={<IconPlayerSkipForward size={16} />}
              color="blue"
              onClick={() => window.api.nextRound()}
            >
              Next Round
            </Button>
          </Tooltip>
        )}
      </Group>

      {/* Danger zone — always visible when relevant */}
      {(canEndBattle || canReset) && (
        <>
          <Divider color="var(--tm-border)" />
          <Group gap="sm" wrap="wrap">
            {canEndBattle && (
              <Tooltip label="Ends the battle immediately. All timers stop and the Group HUD shows the end screen." {...tipProps}>
                <Button
                  leftSection={<IconSkull size={16} />}
                  color="red"
                  variant="light"
                  onClick={() => window.api.endBattle()}
                >
                  End Battle
                </Button>
              </Tooltip>
            )}
            <Tooltip label="Resets everything to idle — clears all round, stage, and beat state. This cannot be undone." {...tipProps}>
              <Button
                leftSection={<IconRotateClockwise size={16} />}
                color="gray"
                variant="subtle"
                onClick={() => window.api.resetBattle()}
              >
                Reset Battle
              </Button>
            </Tooltip>
          </Group>
        </>
      )}
    </Stack>
  )
}
