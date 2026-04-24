import React, { useEffect, useState } from 'react'
import { Stack, Group, Button, Paper, Text, Badge, Divider, CloseButton, Tooltip, Box } from '@mantine/core'
import {
  IconSwords, IconPlayerPlay, IconPlayerPause, IconPlayerSkipForward,
  IconFlag, IconDeviceTv, IconSkull, IconRotateClockwise, IconClock,
  IconArrowBackUp, IconArrowBackUpDouble, IconPlayerSkipBack, IconClipboardList,
} from '@tabler/icons-react'
import type { TCStatePayload, StageDefinition } from '@shared/types'

// ── Tooltip text helpers ─────────────────────────────────────────────────────
// Each function returns a context-appropriate explanation for its control.
// Beat-effect differences between GM Release, GM Pass, Stage Reset, and Tier Reset
// are explicitly called out so the GM always knows the beat-budget consequence.

/**
 * Context-sensitive tooltip for the GM Release button.
 *
 * Release from stageGMHold    → starts player countdown (no beats charged yet)
 * Release from stageActive    → ends stage early; elapsed beats consumed; surplus
 *                               carries forward to the next beat-consuming stage
 * Release from stageSpin      → ends spin early (only when ops complete)
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
    return 'Ends this stage early.\n\nBeats are charged proportionally to elapsed time. Unelapsed beats carry forward to the next stage, extending it — nothing is lost from the budget.'
  }
  if (isSpin) {
    if (opsComplete) return 'Ends the spin window early and advances to the next stage.'
    return 'Waiting for background processing to finish before the spin window can end.'
  }
  return 'Not available in the current state.'
}

/**
 * Tooltip for the Pass Stage button.
 * Full beat cost is always charged — whether the timer has started or not.
 * The stage window existed in the timeline regardless, so beats are consumed.
 * No carry-forward in either case.
 */
function passTooltip(isGMHold: boolean): string {
  if (isGMHold) {
    return 'Skips this stage before the timer starts.\n\nThe full beat cost of this stage is charged — the window existed in the timeline regardless of whether the timer ran.\n\nUnlike GM Release, no beats carry forward.'
  }
  return 'Skips the remainder of this stage.\n\nThe full beat cost of this stage is charged — no carry-forward. This represents the characters doing nothing during the window.\n\nUnlike GM Release, unelapsed beats are NOT carried to the next stage.'
}

/**
 * Tooltip for the Stage Reset button.
 * Restarts the current stage, restoring the beat clock to its stage-entry value.
 * Any carry-forward beats already added to this stage's allocation are preserved.
 */
function stageResetTooltip(): string {
  return 'Restarts the current stage from its beginning.\n\nThe beat clock is restored to where it was when this stage started. Any extra beats added by a carry-forward are preserved.\n\nUse this to grant the group a redo on the current stage.'
}

/**
 * Tooltip for the Tier Reset button.
 * Backs up to the opening Action stage of the entire current tier,
 * restoring the beat clock to its tier-entry value.
 */
function tierResetTooltip(): string {
  return 'Restarts the entire current Action Tier from its opening Action stage.\n\nThe beat clock is restored to where it was at the start of this tier. All stages in the tier repeat.\n\nUse this to grant the group a full redo of the tier.'
}

/**
 * Tooltip for the Round Reset button.
 * Returns to stage 0 of the current round, restoring the full beat budget.
 */
function roundResetTooltip(): string {
  return 'Restarts the entire current round from the beginning.\n\nThe beat clock is restored to the full beat budget and the stage pipeline is rebuilt from scratch.\n\nUse this to grant the group a complete redo of the round.'
}

// ── Component ────────────────────────────────────────────────────────────────

interface GmControlsProps {
  onBattleLogOpen?: () => void
}

export function GmControls({ onBattleLogOpen }: GmControlsProps): JSX.Element {
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
  //   stageActive  → ends stage early; surplus beats carry forward
  //   stageSpin    → ends spin early when ops complete
  const canRelease     = isGMHold ||
                         (isActive && (currentStage?.type === 'gm-release' || (currentStage?.timerSeconds ?? 0) > 0)) ||
                         (isSpin && tc?.backgroundOpsComplete === true)
  const showRelease    = inCombat && !isComplete && !isBattleEnded

  // GM Pass: available in hold phase (zero cost) or active phase (full beat cost charged).
  const canPass        = (isGMHold || isActive || isPaused) && currentStage?.canPass === true

  // Pause: all non-gm-release stages in stageActive or stageSpin. NOT during stageGMHold.
  const canPause       = (isActive && currentStage?.type !== 'gm-release') || isSpin
  const canResume      = isPaused || isSpinPaused

  // Stage Reset: restarts current stage. Available for activity stages (timed/action/response)
  // only — not for administrative system stages (surprise, initiative, resolution, gm-release).
  // Restricted at the machine level too; this guard keeps the button hidden rather than enabled-but-rejected.
  // isActivityStage: mirrors isTimedStageType() from shared/types.ts — timed/action/response only.
  // Inlined here because the renderer cannot import runtime values from @shared (type-only imports only).
  const isActivityStage = currentStage?.type === 'timed' || currentStage?.type === 'action' || currentStage?.type === 'response'
  const canStageReset  = (isActive || isPaused || isSpin || isSpinPaused) && inCombat && isActivityStage

  // Tier Reset: available on any tier stage in active/paused/spin modes, plus stageGMHold
  // when not on the first stage of the tier (only Response's hold qualifies in standard pipeline).
  const canTierReset   = currentStage?.tierIndex !== undefined && inCombat &&
    (isActive || isPaused || isSpin || isSpinPaused || (isGMHold && currentStage?.type !== 'action'))

  // Round Reset: available at any point in the round once past the opening stage (index > 0).
  // Excludes only the very first stage of the round (e.g. GM Narrative hold or stageActive at index 0)
  // — at that point nothing has happened yet and a reset is meaningless.
  // Available in stageActive, stagePaused, stageSpin, stageSpinPaused, and stageGMHold.
  const canRoundReset  = (isActive || isPaused || isSpin || isSpinPaused || isGMHold) &&
                         (tc?.currentStageIndex ?? 0) > 0

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

        <Tooltip label="Opens the battle beat log — a timeline of stage starts, releases, and passes with beat positions." {...tipProps}>
          <Button
            leftSection={<IconClipboardList size={16} />}
            variant="outline"
            onClick={() => onBattleLogOpen?.()}
          >
            Battle Log
          </Button>
        </Tooltip>

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
            label={`Advances to round ${nextRound}. The beat budget resets to the full ${tc?.totalBeats ?? 60} beats and the stage pipeline is rebuilt for the new round.`}
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

      {/* Reset controls — redo a stage, tier, or entire round */}
      {(canStageReset || canTierReset || canRoundReset) && (
        <>
          <Divider color="var(--tm-border)" />
          <Group gap="sm" wrap="wrap">
            {canStageReset && (
              <Tooltip label={stageResetTooltip()} {...tipProps}>
                <Button
                  leftSection={<IconArrowBackUp size={16} />}
                  color="orange"
                  variant="outline"
                  onClick={() => window.api.stageReset()}
                >
                  Stage Reset
                </Button>
              </Tooltip>
            )}
            {canTierReset && (
              <Tooltip label={tierResetTooltip()} {...tipProps}>
                <Button
                  leftSection={<IconPlayerSkipBack size={16} />}
                  color="orange"
                  variant="outline"
                  onClick={() => window.api.tierReset()}
                >
                  Tier Reset
                </Button>
              </Tooltip>
            )}
            {canRoundReset && (
              <Tooltip label={roundResetTooltip()} {...tipProps}>
                <Button
                  leftSection={<IconArrowBackUpDouble size={16} />}
                  color="red"
                  variant="outline"
                  onClick={() => window.api.roundReset()}
                >
                  Round Reset
                </Button>
              </Tooltip>
            )}
          </Group>
        </>
      )}

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
