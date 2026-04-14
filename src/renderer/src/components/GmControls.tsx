import React, { useEffect, useState } from 'react'
import { Stack, Group, Button, Paper, Text, Badge, Divider } from '@mantine/core'
import {
  IconSwords, IconPlayerPlay, IconPlayerPause, IconPlayerSkipForward,
  IconFlag, IconDeviceTv, IconSkull, IconRotateClockwise,
} from '@tabler/icons-react'
import type { TCStatePayload } from '@shared/types'

export function GmControls(): JSX.Element {
  const [tc, setTc] = useState<TCStatePayload | null>(null)

  useEffect(() => {
    window.api.onStateUpdate((state) => setTc(state))
    return () => window.api.offStateUpdate()
  }, [])

  const machineState   = tc?.machineState ?? 'idle'
  const isIdle         = machineState === 'idle'
  const isActive       = machineState === 'stageActive'
  const isPaused       = machineState === 'stagePaused'
  const isSpin         = machineState === 'stageSpin'
  const isSpinPaused   = machineState === 'stageSpinPaused'
  const isComplete     = machineState === 'tcComplete'
  const isBattleEnded  = machineState === 'battleEnded'

  const currentStage   = tc?.stages[tc.currentStageIndex ?? 0]
  const inCombat       = !isIdle

  // GM Release: ends stage early (partial beats consumed).
  // Enabled on gm-release type stages, timed-like stages (have timerSeconds), and during spin when ops complete.
  const canRelease     = (isActive && (currentStage?.type === 'gm-release' || (currentStage?.timerSeconds ?? 0) > 0)) ||
                         (isSpin && tc?.backgroundOpsComplete === true)
  const showRelease    = inCombat && !isComplete && !isBattleEnded

  // GM Pass: skips stage, zero beats consumed.
  const canPass        = (isActive || isPaused) && currentStage?.canPass === true

  // Pause: allowed for all non-gm-release stages (stageActive or stageSpin)
  const canPause       = (isActive && currentStage?.type !== 'gm-release') || isSpin
  const canResume      = isPaused || isSpinPaused

  const canEndBattle   = !isIdle && !isBattleEnded
  const canReset       = true

  function statusColor(): string {
    if (isComplete)              return 'yellow'
    if (isPaused || isSpinPaused) return 'orange'
    if (isActive || isSpin)      return 'green'
    return 'gray'
  }

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

      <Divider color="var(--tm-border)" />

      {/* Primary action buttons */}
      <Group gap="sm" wrap="wrap">
        {isIdle && (
          <Button
            leftSection={<IconSwords size={16} />}
            color="green"
            onClick={() => window.api.startCombat()}
          >
            Start Combat
          </Button>
        )}

        {inCombat && (
          <Button
            leftSection={<IconDeviceTv size={16} />}
            variant="outline"
            onClick={() => window.api.launchHUD()}
          >
            Launch Group HUD
          </Button>
        )}

        {showRelease && (
          <Button
            leftSection={<IconFlag size={16} />}
            color="var(--tm-accent)"
            variant="filled"
            disabled={!canRelease}
            onClick={() => window.api.gmRelease()}
          >
            GM Release
          </Button>
        )}

        {canPass && (
          <Button
            leftSection={<IconPlayerSkipForward size={16} />}
            variant="light"
            onClick={() => window.api.pass()}
          >
            Pass Stage
          </Button>
        )}

        {canPause && (
          <Button
            leftSection={<IconPlayerPause size={16} />}
            color="orange"
            variant="light"
            onClick={() => window.api.pause()}
          >
            Pause
          </Button>
        )}

        {canResume && (
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            color="green"
            onClick={() => window.api.resume()}
          >
            Resume
          </Button>
        )}

        {isComplete && (
          <Button
            leftSection={<IconPlayerSkipForward size={16} />}
            color="blue"
            onClick={() => window.api.nextRound()}
          >
            Next Round
          </Button>
        )}
      </Group>

      {/* Danger zone — always visible when relevant */}
      {(canEndBattle || canReset) && (
        <>
          <Divider color="var(--tm-border)" />
          <Group gap="sm" wrap="wrap">
            {canEndBattle && (
              <Button
                leftSection={<IconSkull size={16} />}
                color="red"
                variant="light"
                onClick={() => window.api.endBattle()}
              >
                End Battle
              </Button>
            )}
            <Button
              leftSection={<IconRotateClockwise size={16} />}
              color="gray"
              variant="subtle"
              onClick={() => window.api.resetBattle()}
            >
              Reset Battle
            </Button>
          </Group>
        </>
      )}
    </Stack>
  )
}
