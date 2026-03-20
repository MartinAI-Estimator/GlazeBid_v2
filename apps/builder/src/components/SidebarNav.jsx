import React from 'react';
import { LayoutGrid, Box, Layers, FileText, Settings } from 'lucide-react';
import iconLogo from '../assets/ICON_LOGO.svg';

/**
 * SleekSidebar — 64px icon-only global navigation rail.
 *
 * Views grouped by section:
 *   Dashboard    → home / projectHome
 *   Studio (3D)  → viewer
 *   Takeoffs     → inbox / documentViewer
 *   Bid          → bidsheet / bid-cart / proposal
 *   Settings     → settings  (bottom)
 */

const NAV_ITEMS = [
  { views: ['home', 'projectHome'],              icon: LayoutGrid, label: 'Dashboard',        goView: 'home'     },
  { views: ['viewer'],                           icon: Box,        label: 'Studio (3D)',       goView: 'viewer'   },
  { views: ['inbox', 'documentViewer'],          icon: Layers,     label: 'Takeoffs & Specs',  goView: 'inbox'    },
  { views: ['bidsheet', 'bid-cart', 'proposal'], icon: FileText,   label: 'Bid & Proposal',    goView: 'bidsheet' },
];

const BOTTOM_ITEMS = [
  { views: ['settings'], icon: Settings, label: 'Settings', goView: 'settings' },
];

/** Individual icon button with a CSS-driven hover tooltip. */
const NavItem = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    title={label}
    className={[
      'group relative flex h-10 w-10 items-center justify-center rounded-lg',
      'border-none transition-all duration-150 cursor-pointer',
      active
        ? 'bg-[rgba(14,165,233,0.10)] text-[#0ea5e9]'
        : 'bg-transparent text-[#52525b] hover:bg-[#27272a] hover:text-[#e4e4e7]',
    ].join(' ')}
  >
    <Icon size={20} strokeWidth={1.5} />

    {/* Tooltip — scales in on group-hover via Tailwind group utility */}
    <span className={[
      'pointer-events-none absolute left-[52px] z-50',
      'whitespace-nowrap rounded-md border border-[#27272a] bg-[#18181b]',
      'px-2 py-1 text-xs font-medium text-[#e4e4e7]',
      'scale-0 origin-left transition-transform duration-150 group-hover:scale-100',
    ].join(' ')}>
      {label}
    </span>
  </button>
);

const SidebarNav = ({ currentView, onViewChange }) => (
  <aside className="fixed left-0 bottom-0 z-40 flex w-16 flex-col items-center border-r border-[#27272a] bg-[#09090b] py-3" style={{ top: '40px' }}>
    {/* GlazeBid logo mark */}
    <div className="mb-5 flex h-8 w-8 items-center justify-center">
      <img src={iconLogo} alt="GlazeBid" className="h-7 w-7 object-contain" />
    </div>

    {/* Main navigation */}
    <nav className="flex flex-1 flex-col items-center gap-1.5">
      {NAV_ITEMS.map(item => (
        <NavItem
          key={item.goView}
          icon={item.icon}
          label={item.label}
          active={item.views.includes(currentView)}
          onClick={() => onViewChange(item.goView)}
        />
      ))}
    </nav>

    {/* Divider + bottom items */}
    <div className="mb-1 mt-auto flex flex-col items-center gap-1.5">
      <div className="mb-1 h-px w-8 bg-[#27272a]" />
      {BOTTOM_ITEMS.map(item => (
        <NavItem
          key={item.goView}
          icon={item.icon}
          label={item.label}
          active={item.views.includes(currentView)}
          onClick={() => onViewChange(item.goView)}
        />
      ))}
    </div>
  </aside>
);

export default SidebarNav;

