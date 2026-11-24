'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as LucideIcons from 'lucide-react';
import { Bell, Keyboard, LogOut, Menu, Search, Shield, X } from 'lucide-react';
import { ROLES } from '@erp/shared';
import { useAuth } from '@/context/auth-context';
import { getNavigationForRoles } from '@/lib/navigation';
import { apiRequest } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { Badge } from '@/components/ui/badge';

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (LucideIcons as any)[name] || LucideIcons.Circle;
  return <Icon className={className} />;
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const gPrefixTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gPrefixActive = useRef(false);

  const [mobileOpen, setMobileOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Record<string, any[]> | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const navItems = useMemo(() => {
    if (!user) return [];
    return getNavigationForRoles(user.roles, user.permissions);
  }, [user]);

  const allowedHrefs = useMemo(() => new Set(navItems.map((n) => n.href)), [navItems]);

  const shortcutBindings = useMemo(() => {
    const primaryRole = user?.roles[0];
    const candidates: Array<{ keys: string; key: string; label: string; href: string }> = [
      { keys: 'G then D', key: 'd', label: 'Dashboard', href: '/dashboard' },
      {
        keys: 'G then P',
        key: 'p',
        label: primaryRole === ROLES.DEALER ? 'Place Order' : 'Products & Catalog',
        href: primaryRole === ROLES.DEALER ? '/dealer/place-order' : '/items',
      },
      {
        keys: 'G then O',
        key: 'o',
        label: primaryRole === ROLES.DEALER ? 'My Orders' : 'Orders',
        href: primaryRole === ROLES.DEALER ? '/dealer/orders' : '/orders',
      },
      { keys: 'G then I', key: 'i', label: 'Inventory & Stock', href: '/inventory' },
      {
        keys: 'G then B',
        key: 'b',
        label: primaryRole === ROLES.DEALER ? 'My Invoices' : 'Bills & Sales Register',
        href: primaryRole === ROLES.DEALER ? '/dealer/invoices' : '/finance/invoices',
      },
      {
        keys: 'G then Y',
        key: 'y',
        label: primaryRole === ROLES.DEALER ? 'My Payments' : 'Payments & Receipts',
        href: primaryRole === ROLES.DEALER ? '/dealer/payments' : '/finance/payments',
      },
      {
        keys: 'G then J',
        key: 'j',
        label: primaryRole === ROLES.EMPLOYEE ? 'My Job Cards' : 'Job Cards & Production',
        href: primaryRole === ROLES.EMPLOYEE ? '/employee/job-cards' : '/manufacturing/job-cards',
      },
      {
        keys: 'G then S',
        key: 's',
        label: 'Scrap Management',
        href: primaryRole === ROLES.EMPLOYEE ? '/employee/scrap' : '/scrap',
      },
      { keys: 'G then F', key: 'f', label: 'Offers & Discounts', href: '/admin/offers' },
      { keys: 'G then L', key: 'l', label: 'Dealers', href: '/dealers' },
      { keys: 'G then R', key: 'r', label: 'Reports & Exports', href: '/reports' },
      { keys: 'G then N', key: 'n', label: 'Notifications', href: '/notifications' },
    ];
    return candidates.filter((c) => allowedHrefs.has(c.href));
  }, [user, allowedHrefs]);

  useEffect(() => {
    if (!user) return;
    apiRequest<{ unreadCount: number }>('/notifications?limit=1')
      .then((r) => setUnreadCount(r.unreadCount || 0))
      .catch(() => {});
  }, [user, pathname]);

  // Global Keyboard Shortcuts handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K focuses Global Search from anywhere
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (e.key === 'Escape') {
        setShowShortcuts(false);
        setSearchResults(null);
        setMobileOpen(false);
        return;
      }

      if (isEditableElement(e.target)) return;

      // "/" focuses search
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      // "?" (Shift+/) toggles Keyboard Shortcuts modal
      if (e.key === '?') {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }

      const lower = e.key.toLowerCase();

      // Two-key "G then <key>" navigation
      if (gPrefixActive.current) {
        gPrefixActive.current = false;
        if (gPrefixTimer.current) clearTimeout(gPrefixTimer.current);
        const match = shortcutBindings.find((b) => b.key === lower);
        if (match) {
          e.preventDefault();
          router.push(match.href);
        }
        return;
      }

      if (lower === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        gPrefixActive.current = true;
        if (gPrefixTimer.current) clearTimeout(gPrefixTimer.current);
        gPrefixTimer.current = setTimeout(() => {
          gPrefixActive.current = false;
        }, 1200);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shortcutBindings, router]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await apiRequest<{ results: Record<string, any[]> }>(
        `/reports/search?q=${encodeURIComponent(q.trim())}`,
      );
      setSearchResults(res.results);
    } catch {
      setSearchResults(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace('/login');
  };

  if (!user) return null;

  const roleLabel = user.roles[0]?.replace(/_/g, ' ') || 'USER';

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 text-slate-200">
      <div className="flex h-16 items-center justify-between border-b border-slate-800 px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Shield className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-white">Business ERP</p>
            <p className="text-[11px] text-slate-400">Management Suite</p>
          </div>
        </Link>
        <button
          onClick={() => setMobileOpen(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item, idx) => {
          const prevSection = idx > 0 ? navItems[idx - 1].section : undefined;
          const showSection = item.section && item.section !== prevSection;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <React.Fragment key={item.href}>
              {showSection && (
                <p className="px-3 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {item.section}
                </p>
              )}
              <Link
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                )}
              >
                <DynamicIcon name={item.icon} className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 rounded-lg bg-slate-800/70 p-3">
          <p className="truncate text-sm font-medium text-white">{user.fullName}</p>
          <p className="truncate text-xs text-slate-400">{user.email}</p>
          <div className="mt-2">
            <Badge variant="info" className="bg-brand-900/60 text-brand-100 ring-brand-700">
              {roleLabel}
            </Badge>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  const flatResultCount = searchResults
    ? Object.values(searchResults).reduce((acc, arr) => acc + arr.length, 0)
    : 0;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 lg:block">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-slate-900/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-10 w-72 max-w-[85vw]">{sidebarContent}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative hidden w-80 md:block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => void handleSearch(e.target.value)}
                onBlur={() => setTimeout(() => setSearchResults(null), 200)}
                placeholder="Search orders, bills, products... (Ctrl+K)"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-9 pr-14 text-xs focus:border-brand-500 focus:bg-white focus:outline-none"
              />
              <kbd className="pointer-events-none absolute right-2 top-1.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                Ctrl+K
              </kbd>
              {searchResults && (
                <div className="absolute left-0 top-10 z-50 w-96 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                  {flatResultCount === 0 ? (
                    <p className="text-xs text-slate-500">No matching permitted records found.</p>
                  ) : (
                    <div className="max-h-72 space-y-2 overflow-y-auto text-xs">
                      {Object.entries(searchResults).map(([group, rows]) =>
                        rows.length > 0 ? (
                          <div key={group}>
                            <p className="font-semibold uppercase text-slate-400">{group}</p>
                            {rows.map((r: any) => (
                              <div key={r.id} className="truncate py-1 text-slate-800">
                                {r.businessName || r.orderNumber || r.invoiceNumber || r.jobCardNumber || r.scrapCode || r.name}
                              </div>
                            ))}
                          </div>
                        ) : null,
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
              title="Keyboard Shortcuts (Shift + ?)"
            >
              <Keyboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Shortcuts</span>
              <kbd className="rounded bg-white px-1 font-mono text-[10px] text-slate-500">?</kbd>
            </button>
            <Link href="/notifications" className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
            <span className="hidden text-xs text-slate-500 sm:inline">{user.email}</span>
            <Badge variant="success">Live</Badge>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-8">{children}</main>
      </div>

      {/* Keyboard Shortcuts Reference Modal */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Keyboard className="h-5 w-5 text-brand-600" />
                <h3 className="text-base font-bold text-slate-900">Keyboard Shortcuts</h3>
              </div>
              <button
                onClick={() => setShowShortcuts(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-sm">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  General Actions
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">Focus Global Search</span>
                    <kbd className="rounded border bg-slate-100 px-2 py-0.5 font-mono text-xs">Ctrl + K  or  /</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">Add New Product (on Products screen)</span>
                    <kbd className="rounded border bg-slate-100 px-2 py-0.5 font-mono text-xs">Alt + N</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">Show / Hide Shortcuts</span>
                    <kbd className="rounded border bg-slate-100 px-2 py-0.5 font-mono text-xs">Shift + ?</kbd>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700">Close Open Modal / Search</span>
                    <kbd className="rounded border bg-slate-100 px-2 py-0.5 font-mono text-xs">Esc</kbd>
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Quick Navigation (Permitted for Your Role)
                </p>
                <div className="grid gap-1.5 sm:grid-cols-2">
                  {shortcutBindings.map((b) => (
                    <div key={b.href} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                      <span className="text-slate-700">{b.label}</span>
                      <kbd className="rounded border bg-white px-1.5 py-0.5 font-mono text-[11px] text-slate-700">
                        {b.keys}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
