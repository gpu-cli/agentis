import { AgentPanel } from './AgentPanel'
import { BuildingPanel } from './BuildingPanel'
import { DistrictPanel } from './DistrictPanel'
import { MonsterPanel } from './MonsterPanel'
import { FollowBadge } from './FollowBadge'
import { EventLog } from './EventLog'

export function WorldOverlays() {
  return (
    <>
      <EventLog />
      <FollowBadge />
      <AgentPanel />
      <BuildingPanel />
      <DistrictPanel />
      <MonsterPanel />
    </>
  )
}
