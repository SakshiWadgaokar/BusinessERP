import { PERMISSIONS, PermissionCode, ROLES, RoleCode } from '@erp/shared';

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  requiredPermission?: PermissionCode;
  section?: string;
}

export function getNavigationForRoles(roles: RoleCode[], permissions: PermissionCode[]): NavItem[] {
  const permSet = new Set(permissions);
  const isSuper = roles.includes(ROLES.SUPER_ADMIN);
  const has = (p?: PermissionCode) => !p || isSuper || permSet.has(p);

  const primaryRole = roles[0];

  let items: NavItem[] = [];

  if (primaryRole === ROLES.DEALER) {
    items = [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
      { label: 'Place Order', href: '/dealer/place-order', icon: 'ShoppingCart', requiredPermission: PERMISSIONS.ORDERS_CREATE },
      { label: 'My Orders', href: '/dealer/orders', icon: 'ClipboardList', requiredPermission: PERMISSIONS.ORDERS_READ },
      { label: 'Purchase History', href: '/dealer/purchases', icon: 'History', requiredPermission: PERMISSIONS.ORDERS_READ },
      { label: 'My Payments', href: '/dealer/payments', icon: 'CreditCard', requiredPermission: PERMISSIONS.PAYMENTS_READ },
      { label: 'Outstanding Balance', href: '/dealer/ledger', icon: 'Wallet', requiredPermission: PERMISSIONS.LEDGER_READ },
      { label: 'Invoices', href: '/dealer/invoices', icon: 'FileText', requiredPermission: PERMISSIONS.INVOICES_READ },
      { label: 'Profile', href: '/dealer/profile', icon: 'User', requiredPermission: PERMISSIONS.DEALERS_OWN_READ },
      { label: 'Notifications', href: '/notifications', icon: 'Bell', requiredPermission: PERMISSIONS.NOTIFICATIONS_READ },
    ];
  } else if (primaryRole === ROLES.EMPLOYEE) {
    items = [
      { label: 'My Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
      { label: 'Assigned Job Cards', href: '/employee/job-cards', icon: 'Wrench', requiredPermission: PERMISSIONS.JOB_CARDS_READ },
      { label: 'Material Requests', href: '/employee/material-requests', icon: 'PackagePlus', requiredPermission: PERMISSIONS.JOB_CARDS_EXECUTE },
      { label: 'Production Updates', href: '/employee/production', icon: 'Factory', requiredPermission: PERMISSIONS.PRODUCTION_RECORD },
      { label: 'Scrap Records', href: '/employee/scrap', icon: 'Recycle', requiredPermission: PERMISSIONS.SCRAP_RECORD },
      { label: 'Work History', href: '/employee/history', icon: 'History', requiredPermission: PERMISSIONS.JOB_CARDS_READ },
      { label: 'Notifications', href: '/notifications', icon: 'Bell', requiredPermission: PERMISSIONS.NOTIFICATIONS_READ },
    ];
  } else if (primaryRole === ROLES.ACCOUNTANT) {
    items = [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
      { label: 'Dealers', href: '/dealers', icon: 'Store', requiredPermission: PERMISSIONS.DEALERS_READ },
      { label: 'Dealer Ledger', href: '/finance/ledger', icon: 'BookOpen', requiredPermission: PERMISSIONS.LEDGER_READ },
      { label: 'Payments', href: '/finance/payments', icon: 'CreditCard', requiredPermission: PERMISSIONS.PAYMENTS_READ },
      { label: 'Invoices', href: '/finance/invoices', icon: 'FileText', requiredPermission: PERMISSIONS.INVOICES_READ },
      { label: 'Expenses', href: '/finance/expenses', icon: 'Receipt', requiredPermission: PERMISSIONS.EXPENSES_READ },
      { label: 'Financial Reports', href: '/reports', icon: 'BarChart3', requiredPermission: PERMISSIONS.REPORTS_FINANCE },
      { label: 'Audit Logs', href: '/admin/audit-logs', icon: 'ShieldCheck', requiredPermission: PERMISSIONS.AUDIT_LOGS_READ },
    ];
  } else if (primaryRole === ROLES.INVENTORY_MANAGER) {
    items = [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
      { label: 'Stock Overview', href: '/inventory', icon: 'Boxes', requiredPermission: PERMISSIONS.INVENTORY_READ },
      { label: 'All Products & Catalog', href: '/items', icon: 'PackagePlus', requiredPermission: PERMISSIONS.ITEMS_READ },
      { label: 'Raw Materials', href: '/items/raw-materials', icon: 'Layers', requiredPermission: PERMISSIONS.ITEMS_READ },
      { label: 'Finished Products', href: '/items/finished-goods', icon: 'Package', requiredPermission: PERMISSIONS.ITEMS_READ },
      { label: 'Warehouses', href: '/inventory/warehouses', icon: 'Warehouse', requiredPermission: PERMISSIONS.LOCATIONS_READ },
      { label: 'Stock Receipts', href: '/purchases', icon: 'Truck', requiredPermission: PERMISSIONS.GRN_RECEIVE },
      { label: 'Material Issues', href: '/manufacturing/job-cards', icon: 'ArrowUpRight', requiredPermission: PERMISSIONS.INVENTORY_ISSUE },
      { label: 'Transfers & Adjustments', href: '/inventory/transfers', icon: 'ArrowLeftRight', requiredPermission: PERMISSIONS.INVENTORY_TRANSFER },
      { label: 'Scrap Management', href: '/scrap', icon: 'Recycle', requiredPermission: PERMISSIONS.SCRAP_READ },
      { label: 'Reports', href: '/reports', icon: 'BarChart3', requiredPermission: PERMISSIONS.REPORTS_INVENTORY },
    ];
  } else {
    // Super Admin & Admin/Manager
    items = [
      { section: 'Overview', label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' },
      { section: 'Sales & Dealers', label: 'Dealers', href: '/dealers', icon: 'Store', requiredPermission: PERMISSIONS.DEALERS_READ },
      { section: 'Sales & Dealers', label: 'Orders', href: '/orders', icon: 'ClipboardList', requiredPermission: PERMISSIONS.ORDERS_READ },
      { section: 'Sales & Dealers', label: 'Offers & Discounts', href: '/admin/offers', icon: 'Tag', requiredPermission: PERMISSIONS.SETTINGS_READ },
      { section: 'Inventory', label: 'Products & Raw Materials', href: '/items', icon: 'Package', requiredPermission: PERMISSIONS.ITEMS_READ },
      { section: 'Inventory', label: 'Inventory & Stock', href: '/inventory', icon: 'Boxes', requiredPermission: PERMISSIONS.INVENTORY_READ },
      { section: 'Inventory', label: 'Warehouses', href: '/inventory/warehouses', icon: 'Warehouse', requiredPermission: PERMISSIONS.LOCATIONS_READ },
      { section: 'Procurement', label: 'Suppliers', href: '/suppliers', icon: 'Building2', requiredPermission: PERMISSIONS.SUPPLIERS_READ },
      { section: 'Procurement', label: 'Purchases & GRN', href: '/purchases', icon: 'Truck', requiredPermission: PERMISSIONS.PURCHASES_READ },
      { section: 'Manufacturing', label: 'Employees', href: '/employees', icon: 'Users', requiredPermission: PERMISSIONS.EMPLOYEES_READ },
      { section: 'Manufacturing', label: 'Job Cards & Production', href: '/manufacturing/job-cards', icon: 'Wrench', requiredPermission: PERMISSIONS.JOB_CARDS_READ },
      { section: 'Manufacturing', label: 'Scrap Management', href: '/scrap', icon: 'Recycle', requiredPermission: PERMISSIONS.SCRAP_READ },
      { section: 'Finance', label: 'Payments', href: '/finance/payments', icon: 'CreditCard', requiredPermission: PERMISSIONS.PAYMENTS_READ },
      { section: 'Finance', label: 'Invoices & Receipts', href: '/finance/invoices', icon: 'FileText', requiredPermission: PERMISSIONS.INVOICES_READ },
      { section: 'Finance', label: 'Expenses', href: '/finance/expenses', icon: 'Receipt', requiredPermission: PERMISSIONS.EXPENSES_READ },
      { section: 'Analytics', label: 'Reports', href: '/reports', icon: 'BarChart3', requiredPermission: PERMISSIONS.REPORTS_SALES },
      { section: 'Analytics', label: 'Notifications', href: '/notifications', icon: 'Bell', requiredPermission: PERMISSIONS.NOTIFICATIONS_READ },
      { section: 'Administration', label: 'Users', href: '/admin/users', icon: 'UserCog', requiredPermission: PERMISSIONS.USERS_READ },
      { section: 'Administration', label: 'Roles & Permissions', href: '/admin/roles', icon: 'KeyRound', requiredPermission: PERMISSIONS.ROLES_READ },
      { section: 'Administration', label: 'Audit Logs', href: '/admin/audit-logs', icon: 'ShieldCheck', requiredPermission: PERMISSIONS.AUDIT_LOGS_READ },
      { section: 'Administration', label: 'Settings', href: '/admin/settings', icon: 'Settings', requiredPermission: PERMISSIONS.SETTINGS_READ },
    ];
  }

  return items.filter((item) => has(item.requiredPermission));
}
