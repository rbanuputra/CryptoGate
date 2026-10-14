import { NavLink, Outlet } from 'react-router-dom';
import { cn } from 'cn';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/screening', label: 'Screening' },
  { to: '/alerts', label: 'Alerts' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <nav className="border-b bg-card">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex h-14 items-center gap-8">
            <span className="text-sm font-semibold tracking-tight">CryptoGate</span>
            <div className="flex gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
