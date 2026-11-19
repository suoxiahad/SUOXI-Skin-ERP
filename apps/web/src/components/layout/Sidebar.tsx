import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Building2,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { NAV_GROUPS, NavItem } from '../../navigation/navItems.js';
import { usePermissions } from '../../hooks/usePermissions.js';
import { useI18n } from '../../i18n/I18nContext.js';
import { useAuth } from '../../context/AuthContext.js';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  activePath: string;
  onNavigate: (path: string) => void;
  isMobileOpen?: boolean;
  onMobileClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  activePath,
  onNavigate,
  isMobileOpen = false,
  onMobileClose,
}) => {
  const { t } = useI18n();
  const { has } = usePermissions();
  const { user, logout } = useAuth();
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const handleItemClick = (item: NavItem) => {
    onNavigate(item.path);
    if (onMobileClose) {
      onMobileClose();
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden transition-opacity"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 flex flex-col bg-brand-card/90 backdrop-blur-md border-r border-brand-border transition-all duration-300 ease-in-out lg:static ${
          collapsed ? 'w-[72px]' : 'w-64'
        } ${isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
        aria-label="Sidebar navigation"
      >
        {/* Clinic Brand Header */}
        <div className="h-16 flex items-center px-4 border-b border-brand-border/70 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-brand-primary flex items-center justify-center flex-shrink-0 text-white font-bold shadow-sm shadow-emerald-500/20">
              <span className="text-base tracking-tighter">SX</span>
            </div>

            {!collapsed && (
              <div className="min-w-0 overflow-hidden animate-fade-in">
                <div className="font-bold text-sm text-brand-text truncate leading-tight">
                  {t.appTitle}
                </div>
                <div className="text-[11px] text-brand-muted truncate flex items-center gap-1">
                  <Building2 className="w-3 h-3 flex-shrink-0 text-brand-primary" />
                  <span className="truncate">{t.clinicBranch}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Navigation Groups */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-4">
          {NAV_GROUPS.map((group) => {
            // Filter items by client permissions hook
            const visibleItems = group.items.filter((item) => has(item.permission));

            if (visibleItems.length === 0) return null;

            const isGroupCollapsed = !collapsed && collapsedGroups[group.id];
            const groupTitle = t.nav[group.titleKey] || group.id;

            return (
              <div key={group.id} className="space-y-0.5">
                {/* Group Title (hidden when sidebar rail is collapsed) */}
                {!collapsed ? (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center justify-between px-2.5 py-1 text-[11px] font-semibold text-brand-muted uppercase tracking-wider hover:text-brand-text transition-colors rounded"
                  >
                    <span className="truncate">{groupTitle}</span>
                    <ChevronDown
                      className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
                        isGroupCollapsed ? '-rotate-90' : 'rotate-0'
                      }`}
                    />
                  </button>
                ) : (
                  <div className="h-px bg-brand-border/40 my-2 mx-1" />
                )}

                {/* Group Items */}
                {(!isGroupCollapsed || collapsed) && (
                  <ul className="space-y-1">
                    {visibleItems.map((item) => {
                      const Icon = item.icon;
                      const isActive = activePath === item.path;
                      const itemLabel = t.nav[item.labelKey] || item.labelKey;

                      return (
                        <li key={item.id} className="relative group">
                          <button
                            type="button"
                            onClick={() => handleItemClick(item)}
                            title={collapsed ? `${itemLabel}` : undefined}
                            className={`w-full flex items-center rounded-lg transition-colors focus-ring ${
                              collapsed
                                ? 'justify-center p-2.5'
                                : 'px-3 py-2 text-sm justify-between gap-3'
                            } ${
                              isActive
                                ? 'bg-brand-primary/10 text-brand-primary font-semibold shadow-xs'
                                : 'text-slate-600 hover:text-brand-text hover:bg-slate-100/70'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Icon
                                className={`flex-shrink-0 ${
                                  collapsed ? 'w-5 h-5' : 'w-4 h-4'
                                } ${isActive ? 'text-brand-primary' : 'text-slate-500 group-hover:text-slate-700'}`}
                                aria-hidden="true"
                              />
                              {!collapsed && (
                                <span className="truncate">{itemLabel}</span>
                              )}
                            </div>

                            {/* Badge count / Pill indicator */}
                            {!collapsed && item.badgeCount !== undefined && item.badgeCount > 0 && (
                              <span
                                className={`px-1.5 py-0.2 text-[10px] font-bold rounded-full tabular-nums ${
                                  isActive
                                    ? 'bg-brand-primary text-white'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {item.badgeCount}
                              </span>
                            )}

                            {/* Indicator for collapsed active badge */}
                            {collapsed && item.badgeCount !== undefined && item.badgeCount > 0 && (
                              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-primary ring-2 ring-white" />
                            )}
                          </button>

                          {/* Hover Tooltip when sidebar rail is collapsed */}
                          {collapsed && (
                            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 hidden group-hover:flex items-center px-2.5 py-1.5 bg-slate-900 text-white text-xs rounded-md shadow-lg whitespace-nowrap pointer-events-none animate-fade-in">
                              <span>{itemLabel}</span>
                              {item.badgeCount !== undefined && item.badgeCount > 0 && (
                                <span className="ml-2 px-1.5 py-0.2 bg-brand-primary text-white text-[10px] font-bold rounded-full">
                                  {item.badgeCount}
                                </span>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>

        {/* Sidebar Footer: Collapse Toggle & User Overview */}
        <div className="p-2 border-t border-brand-border/70 flex-shrink-0 bg-slate-50/50">
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="w-full flex items-center justify-center p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 transition-colors focus-ring"
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <div className="flex items-center gap-2 text-xs font-medium w-full px-1">
                <ChevronLeft className="w-4 h-4" />
                <span className="truncate">{t.collapseSidebar}</span>
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
