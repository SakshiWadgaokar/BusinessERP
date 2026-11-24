'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ItemType, PERMISSIONS, formatINR } from '@erp/shared';
import { FolderPlus, Pencil, Plus, Search } from 'lucide-react';
import { apiRequest, ApiError } from '@/lib/api-client';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function ItemsCatalogView({ fixedType, title }: { fixedType?: string; title: string }) {
  const { can } = useAuth();
  const canWrite = can(PERMISSIONS.ITEMS_WRITE);

  const [items, setItems] = useState<any[]>([]);
  const [uoms, setUoms] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(fixedType || '');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    sku: '',
    name: '',
    description: '',
    itemType: fixedType || ItemType.FINISHED_GOOD,
    categoryId: '',
    uomId: '',
    hsnSacCode: '',
    standardSellPrice: '0.00',
    standardCost: '0',
    defaultTaxRate: '18',
    minStockLevel: '5',
    reorderLevel: '15',
    visibleToDealers: true,
  });

  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    categoryId: '',
    hsnSacCode: '',
    standardSellPrice: '0.00',
    standardCost: '0',
    defaultTaxRate: '0',
    minStockLevel: '0',
    reorderLevel: '0',
    visibleToDealers: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        limit: '100',
        ...(search ? { search } : {}),
        ...(typeFilter ? { itemType: typeFilter } : {}),
      });
      const [itemRes, uomRes, catRes] = await Promise.all([
        apiRequest<{ data: any[] }>(`/inventory/items?${qs}`),
        apiRequest<any[]>('/inventory/uoms'),
        apiRequest<any[]>('/inventory/categories'),
      ]);
      setItems(itemRes.data);
      setUoms(uomRes);
      setCategories(catRes);
      setForm((f) => ({
        ...f,
        uomId: f.uomId || uomRes.find((u) => u.code === 'NOS')?.id || uomRes[0]?.id || '',
        categoryId: f.categoryId || catRes[0]?.id || '',
      }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load items.');
    } finally {
      setLoading(false);
    }
  }, [search, typeFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  // Keyboard shortcuts: Alt+N to open Add Product modal, Escape to close modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreate(false);
        setEditingItem(null);
        setAddingCategory(false);
        return;
      }
      if (canWrite && e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setShowCreate(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canWrite]);

  const handleQuickCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    setError(null);
    try {
      const cat = await apiRequest<any>('/inventory/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: newCategoryName.trim(),
          itemType: form.itemType || ItemType.FINISHED_GOOD,
        }),
      });
      setCategories((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({ ...f, categoryId: cat.id }));
      setNewCategoryName('');
      setAddingCategory(false);
      setFeedback(`Category "${cat.name}" added and selected.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create category.');
    }
  };

  const submitCreate = async (keepOpen: boolean) => {
    setError(null);
    setFeedback(null);
    setSaving(true);
    try {
      const created = await apiRequest<any>('/inventory/items', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          sku: form.sku.trim().toUpperCase(),
          name: form.name.trim(),
          description: form.description.trim() || null,
          categoryId: form.categoryId || null,
          hsnSacCode: form.hsnSacCode.trim() || null,
          standardSellPrice: Number(form.standardSellPrice || 0).toFixed(2),
          standardCost: String(Number(form.standardCost || 0)),
          defaultTaxRate: Number(form.defaultTaxRate) || 0,
        }),
      });
      setFeedback(`Product "${created.name}" (${created.sku}) added to catalog.`);
      await load();
      if (keepOpen) {
        // Keep Category, Type, UoM, GST %, and Dealer visibility for fast multi-product entry
        setForm((f) => ({
          ...f,
          sku: '',
          name: '',
          description: '',
          standardSellPrice: '0.00',
          standardCost: '0',
        }));
      } else {
        setShowCreate(false);
        setForm((f) => ({ ...f, sku: '', name: '', description: '' }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to create product.');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (item: any) => {
    setError(null);
    setFeedback(null);
    setEditingItem(item);
    setEditForm({
      name: item.name || '',
      description: item.description || '',
      categoryId: item.categoryId || '',
      hsnSacCode: item.hsnSacCode || '',
      standardSellPrice: Number(item.standardSellPrice || 0).toFixed(2),
      standardCost: String(Number(item.standardCost || 0)),
      defaultTaxRate: String(Number(item.defaultTaxRate || 0)),
      minStockLevel: String(Number(item.minStockLevel || 0)),
      reorderLevel: String(Number(item.reorderLevel || 0)),
      visibleToDealers: Boolean(item.visibleToDealers),
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setError(null);
    setSaving(true);
    try {
      await apiRequest(`/inventory/items/${editingItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name,
          description: editForm.description || null,
          categoryId: editForm.categoryId || null,
          hsnSacCode: editForm.hsnSacCode || null,
          standardSellPrice: Number(editForm.standardSellPrice || 0).toFixed(2),
          standardCost: String(Number(editForm.standardCost || 0)),
          defaultTaxRate: Number(editForm.defaultTaxRate || 0),
          minStockLevel: String(Number(editForm.minStockLevel || 0)),
          reorderLevel: String(Number(editForm.reorderLevel || 0)),
          visibleToDealers: editForm.visibleToDealers,
        }),
      });
      setFeedback(`Updated pricing & GST for ${editingItem.name} (${editingItem.sku}) — audit logged.`);
      setEditingItem(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to update pricing/GST.');
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = categoryFilter
    ? items.filter((it) => it.categoryId === categoryFilter)
    : items;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-600">
            Owner & Inventory Manager can add new products/categories (Shortcut: <kbd className="rounded border bg-slate-100 px-1.5 py-0.5 font-mono text-[11px]">Alt+N</kbd>) and edit Cost Price, Selling Price, HSN, and GST %.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Add Product (Alt+N)
          </Button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {feedback && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {feedback}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle>Catalog ({filteredItems.length})</CardTitle>
          <div className="flex flex-wrap gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">All Product Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!fixedType && (
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">All Item Types</option>
                {Object.values(ItemType).map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            )}
            <div className="relative w-64">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU or name..."
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-4 py-3">SKU / Name</th>
                  <th className="px-4 py-3">Category / HSN</th>
                  <th className="px-4 py-3 text-right">Cost Price</th>
                  <th className="px-4 py-3 text-right">Selling Price</th>
                  <th className="px-4 py-3 text-right">GST %</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading...</td></tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={7} className="p-8 text-center text-slate-500">No products match your filter.</td></tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{item.name}</p>
                        <p className="font-mono text-xs text-slate-500">
                          {item.sku}{item.description ? ` • ${item.description}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {item.category?.name && <Badge variant="info">{item.category.name}</Badge>}
                          <Badge>{item.hsnSacCode ? `HSN ${item.hsnSacCode}` : item.itemType}</Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatINR(item.standardCost)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatINR(item.standardSellPrice)}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={Number(item.defaultTaxRate) > 0 ? 'warning' : 'default'}>
                          {Number(item.defaultTaxRate || 0)}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {Number(item.totalAvailable ?? item.availableQuantity ?? 0)} {item.uom.code}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canWrite && (
                          <Button size="sm" variant="outline" onClick={() => openEditModal(item)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit Price / GST
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Product Modal (with Inline Category Creator & Save & Add Another) */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-900/50 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader>
              <CardTitle>Add New Product to Catalog</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitCreate(false);
                }}
                className="grid gap-3 sm:grid-cols-2"
              >
                <Input label="SKU / Product Code" required placeholder="e.g. MM-PRO-007" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
                <Input label="Product Name" required placeholder="e.g. Pro Double Milking Machine" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <div className="sm:col-span-2">
                  <Input label="Description / Variant Details" placeholder="e.g. 200 LPM stainless steel model" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>

                {/* Category + Inline New Category */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-700">Product Category</label>
                    <button
                      type="button"
                      onClick={() => setAddingCategory((v) => !v)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <FolderPlus className="h-3.5 w-3.5" /> New Category
                    </button>
                  </div>
                  {addingCategory ? (
                    <div className="flex gap-1.5">
                      <input
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Category name..."
                        className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm"
                      />
                      <Button type="button" size="sm" onClick={handleQuickCreateCategory}>Add</Button>
                    </div>
                  ) : (
                    <select
                      value={form.categoryId}
                      onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Uncategorized</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Item Type *</label>
                    <select value={form.itemType} onChange={(e) => setForm({ ...form, itemType: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm">
                      {Object.values(ItemType).map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Unit (UoM) *</label>
                    <select value={form.uomId} onChange={(e) => setForm({ ...form, uomId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm">
                      {uoms.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
                    </select>
                  </div>
                </div>

                <Input label="Cost Price (INR)" type="number" step="0.01" min="0" required value={form.standardCost} onChange={(e) => setForm({ ...form, standardCost: e.target.value })} />
                <Input label="Selling Price (INR)" type="number" step="0.01" min="0" required value={form.standardSellPrice} onChange={(e) => setForm({ ...form, standardSellPrice: e.target.value })} />
                <Input label="GST Rate (%)" type="number" step="0.01" min="0" max="100" value={form.defaultTaxRate} onChange={(e) => setForm({ ...form, defaultTaxRate: e.target.value })} />
                <Input label="HSN / SAC Code" value={form.hsnSacCode} onChange={(e) => setForm({ ...form, hsnSacCode: e.target.value })} />
                <Input label="Minimum Stock Level" type="number" step="any" min="0" required value={form.minStockLevel} onChange={(e) => setForm({ ...form, minStockLevel: e.target.value })} />
                <Input label="Reorder Level" type="number" step="any" min="0" required value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} />

                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                  <input type="checkbox" checked={form.visibleToDealers} onChange={(e) => setForm({ ...form, visibleToDealers: e.target.checked })} />
                  Visible in Dealer Portal catalog for ordering
                </label>

                <div className="flex flex-wrap justify-end gap-2 pt-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel (Esc)</Button>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={saving}
                    onClick={() => void submitCreate(true)}
                  >
                    Save & Add Another
                  </Button>
                  <Button type="submit" loading={saving}>Save Product</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Pricing & GST Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle>Edit Pricing & GST — {editingItem.sku}</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveEdit} className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Input label="Product Name" required value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-slate-700">Category</label>
                  <select value={editForm.categoryId} onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                    <option value="">Uncategorized</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <Input label="Cost Price (INR)" type="number" step="0.01" min="0" required value={editForm.standardCost} onChange={(e) => setEditForm({ ...editForm, standardCost: e.target.value })} />
                <Input label="Selling Price (INR)" type="number" step="0.01" min="0" required value={editForm.standardSellPrice} onChange={(e) => setEditForm({ ...editForm, standardSellPrice: e.target.value })} />
                <Input label="GST Rate (%)" type="number" step="0.01" min="0" max="100" required hint="Splits into CGST/SGST (intra-state) or IGST (inter-state)" value={editForm.defaultTaxRate} onChange={(e) => setEditForm({ ...editForm, defaultTaxRate: e.target.value })} />
                <Input label="HSN / SAC Code" value={editForm.hsnSacCode} onChange={(e) => setEditForm({ ...editForm, hsnSacCode: e.target.value })} />
                <Input label="Min Stock Level" type="number" step="any" min="0" value={editForm.minStockLevel} onChange={(e) => setEditForm({ ...editForm, minStockLevel: e.target.value })} />
                <Input label="Reorder Level" type="number" step="any" min="0" value={editForm.reorderLevel} onChange={(e) => setEditForm({ ...editForm, reorderLevel: e.target.value })} />
                <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
                  <input type="checkbox" checked={editForm.visibleToDealers} onChange={(e) => setEditForm({ ...editForm, visibleToDealers: e.target.checked })} />
                  Visible in Dealer Portal catalog
                </label>
                <div className="flex justify-end gap-2 pt-2 sm:col-span-2">
                  <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>Cancel (Esc)</Button>
                  <Button type="submit" loading={saving}>Save Pricing & GST</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
