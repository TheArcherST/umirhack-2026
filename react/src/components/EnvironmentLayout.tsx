import { Outlet } from 'react-router-dom'
import { EnvironmentSidebar } from './EnvironmentSidebar'

export function EnvironmentLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <EnvironmentSidebar />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
