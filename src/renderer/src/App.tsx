import React from 'react'
import { Container, Title, Text, Stack } from '@mantine/core'

export default function App(): JSX.Element {
  return (
    <Container size="md" pt="xl">
      <Stack gap="md">
        <Title order={1}>TacticalMelee</Title>
        <Text c="dimmed">GM Dashboard — shell ready.</Text>
      </Stack>
    </Container>
  )
}
