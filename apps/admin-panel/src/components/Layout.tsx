import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, UserCheck, Map, CalendarDays,
  BarChart2, Settings, LogOut,
} from 'lucide-react';
import { getAdminUser, clearAuth } from '../lib/auth';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Dashboard',  to: '/dashboard'  },
  { icon: Users,           label: 'DSP Users',  to: '/dsp-users'  },
  { icon: UserCheck,       label: 'Staff',       to: '/staff'      },
  { icon: Map,             label: 'Areas',       to: '/areas'      },
  { icon: CalendarDays,    label: 'Rosters',     to: '/rosters'    },
  { icon: BarChart2,       label: 'Reports',     to: '/reports'    },
  { icon: Settings,        label: 'System',      to: '/system'     },
];

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dsp-users': 'DSP Users',
  '/staff':     'Staff',
  '/areas':     'Areas',
  '/rosters':   'Rosters',
  '/reports':   'Reports',
  '/system':    'System',
};

function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd = String(date.getDate()).padStart(2, '0');
  const mon = months[date.getMonth()];
  const yyyy = date.getFullYear();
  return `${hh}:${mm}:${ss} | ${dd} ${mon} ${yyyy}`;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getAdminUser();

  const [clock, setClock] = useState(() => formatClock(new Date()));

  useEffect(() => {
    const id = setInterval(() => setClock(formatClock(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  function handleLogout() {
    clearAuth();
    navigate('/login');
  }

  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Admin Panel';
  const initials = user ? getInitials(user.fullName) : 'AD';
  const fullName = user?.fullName ?? 'Admin';

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className="fixed top-0 left-0 h-full w-[240px] flex flex-col z-50"
        style={{ backgroundColor: '#1A3A5C' }}
      >
        {/* Logo area */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="text-white font-bold text-xl leading-tight">CTPL</div>
          <div className="text-slate-400 text-sm mt-0.5">Admin Panel</div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 pt-5 overflow-y-auto">
          {NAV_ITEMS.map(({ icon: Icon, label, to }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `sidebar-nav-item${isActive ? ' active' : ''}`
              }
            >
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User / logout */}
        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div
              className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: '#244d7a' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{fullName}</div>
              <div className="text-slate-400 text-xs">Administrator</div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="text-slate-400 hover:text-white transition-colors p-1 rounded"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="ml-[240px] flex-1 flex flex-col min-h-screen">
        {/* Header */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6 sticky top-0 z-40">
          <h1 className="text-lg font-semibold text-slate-800">{pageTitle}</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500 font-mono">{clock}</span>
            <span
              className="px-3 py-1.5 rounded-lg text-white text-xs font-semibold"
              style={{ backgroundColor: '#1A3A5C' }}
            >
              {fullName}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
