import { useCallback, useEffect, useRef, useState } from 'react'
import { useReplayEngine } from '../../replay/useReplayEngine'
import {
  loadDemoScenario,
  type DemoScenarioName,
} from './demoScenarioLoader'

export type LoadState =
  | { phase: 'idle' }
  | { phase: 'loading'; stage: string; percent: number }
  | { phase: 'error'; message: string }

export function useDemoLoader() {
  const engine = useReplayEngine()
  const [currentScenario, setCurrentScenario] = useState<DemoScenarioName>('team-build')
  const [loadState, setLoadState] = useState<LoadState>({ phase: 'idle' })
  const initialized = useRef(false)
  const loadSeq = useRef(0)

  const doLoad = useCallback(
    async (name: DemoScenarioName) => {
      const seq = ++loadSeq.current
      engine.stop()
      setLoadState({ phase: 'loading', stage: 'fetch', percent: 0 })
      try {
        const scenario = await loadDemoScenario(name, (stage, percent) => {
          if (loadSeq.current !== seq) return
          setLoadState({ phase: 'loading', stage, percent })
        })
        if (loadSeq.current !== seq) return
        engine.loadScenario(scenario)
        setLoadState({ phase: 'idle' })
      } catch (err) {
        if (loadSeq.current !== seq) return
        const message = err instanceof Error ? err.message : 'Failed to load demo scenario'
        console.error('[demo] load error:', err)
        setLoadState({ phase: 'error', message })
      }
    },
    [engine.loadScenario, engine.stop],
  )

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      doLoad('team-build')
    }
  }, [doLoad])

  const switchScenario = useCallback(
    (name: DemoScenarioName) => {
      setCurrentScenario(name)
      doLoad(name)
    },
    [doLoad],
  )

  const retry = useCallback(() => {
    doLoad(currentScenario)
  }, [doLoad, currentScenario])

  return { engine, loadState, currentScenario, switchScenario, retry }
}
