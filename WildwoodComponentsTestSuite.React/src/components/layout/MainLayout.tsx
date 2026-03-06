import { Outlet } from 'react-router-dom';
import { NavMenu } from './NavMenu';
import { DebugProvider } from '../../contexts/DebugContext';

export function MainLayout() {
  return (
    <DebugProvider>
      <div className="app-layout">
        <NavMenu />
        <main className="app-main">
          <Outlet />
        </main>
      </div>
    </DebugProvider>
  );
}
