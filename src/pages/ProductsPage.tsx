import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Product, ProductCategory } from '../types';
import { ProductImage } from '../components/ProductImage';
import { BackButton } from '../components/BackButton';
import { ImageUploadInput } from '../components/ImageUploadInput';
import {
  Package,
  Plus,
  Search,
  Filter,
  Download,
  Upload,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle,
  Eye,
  X,
  Layers,
  ArrowUpDown,
} from 'lucide-react';

interface ProductsPageProps {
  onBack?: () => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ onBack }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedColour, setSelectedColour] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [previewProduct, setPreviewProduct] = useState<Product | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category_id: '',
    brand: '',
    regular_price: '',
    discount_price: '',
    colour: '',
    sizes: 'S, M, L, XL',
    imageUrl: '',
    images: [] as string[],
    description: '',
    min_stock_threshold: '5',
    initialStock: '10',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadProducts();
  }, [search, selectedCategory, selectedColour, minPrice, maxPrice, sortBy, sortOrder]);

  const loadCategories = async () => {
    try {
      const cats = await api.getCategories();
      setCategories(cats);
    } catch (err) {
      console.error(err);
    }
  };

  const loadProducts = async () => {
    setIsLoading(true);
    try {
      const res = await api.getProducts({
        search,
        category: selectedCategory,
        colour: selectedColour,
        minPrice,
        maxPrice,
        sortBy,
        sortOrder,
      });
      setProducts(res.products || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenAddModal = (productToEdit?: Product) => {
    setFormError(null);
    setFormSuccess(null);
    if (productToEdit) {
      setEditingProduct(productToEdit);
      setFormData({
        name: productToEdit.name,
        sku: productToEdit.sku,
        category_id: productToEdit.category_id || '',
        brand: productToEdit.brand || '',
        regular_price: String(productToEdit.regular_price),
        discount_price: productToEdit.discount_price ? String(productToEdit.discount_price) : '',
        colour: productToEdit.colour || '',
        sizes: (productToEdit.sizes || []).join(', '),
        imageUrl: (productToEdit.images && productToEdit.images[0]) || '',
        images: productToEdit.images || [],
        description: productToEdit.description || '',
        min_stock_threshold: String(productToEdit.min_stock_threshold || 5),
        initialStock: '10',
      });
    } else {
      setEditingProduct(null);
      setFormData({
        name: '',
        sku: 'KK-NEW-' + Math.floor(100 + Math.random() * 900),
        category_id: categories[0]?.id || '',
        brand: 'KalaKriti Heritage',
        regular_price: '',
        discount_price: '',
        colour: '',
        sizes: 'S, M, L, XL',
        imageUrl: '',
        images: [],
        description: '',
        min_stock_threshold: '5',
        initialStock: '15',
      });
    }
    setIsAddModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const regPrice = parseFloat(formData.regular_price);
    const discPrice = formData.discount_price ? parseFloat(formData.discount_price) : undefined;

    if (isNaN(regPrice) || regPrice <= 0) {
      setFormError('Please enter a valid regular price greater than 0.');
      return;
    }

    if (discPrice !== undefined && (isNaN(discPrice) || discPrice >= regPrice)) {
      setFormError('Discount price must be less than regular price.');
      return;
    }

    const sizeArray = formData.sizes.split(',').map((s) => s.trim()).filter(Boolean);
    const resolvedImages = formData.images && formData.images.length > 0 
      ? formData.images 
      : (formData.imageUrl ? [formData.imageUrl] : []);

    try {
      if (editingProduct) {
        await api.updateProduct(editingProduct.id, {
          name: formData.name,
          category_id: formData.category_id || null,
          brand: formData.brand,
          regular_price: regPrice,
          discount_price: discPrice || null,
          colour: formData.colour,
          sizes: sizeArray,
          images: resolvedImages,
          description: formData.description,
          min_stock_threshold: parseInt(formData.min_stock_threshold),
        });
        setFormSuccess('Product updated successfully!');
      } else {
        await api.createProduct({
          name: formData.name,
          sku: formData.sku,
          category_id: formData.category_id || null,
          brand: formData.brand,
          regular_price: regPrice,
          discount_price: discPrice || null,
          colour: formData.colour,
          sizes: sizeArray,
          images: resolvedImages,
          description: formData.description,
          min_stock_threshold: parseInt(formData.min_stock_threshold),
          variants: sizeArray.map((s) => ({
            size: s,
            colour: formData.colour || 'Standard',
            price: discPrice || regPrice,
            stock: parseInt(formData.initialStock) || 10,
          })),
        });
        setFormSuccess('Product and variant stock initialized in database!');
      }

      setTimeout(() => {
        setIsAddModalOpen(false);
        loadProducts();
      }, 700);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save product');
    }
  };

  const [pageError, setPageError] = useState<string | null>(null);

  const handleDeleteProduct = async (id: string, name: string) => {
    setPageError(null);
    try {
      await api.deleteProduct(id);
      loadProducts();
    } catch (err: any) {
      setPageError(err.message || 'Failed to archive product');
    }
  };

  const handleExportCsv = async () => {
    setPageError(null);
    try {
      const res = await api.exportProductsCsv();
      const csvRows = [
        ['Product Name', 'SKU', 'Category', 'Brand', 'Regular Price', 'Discount Price', 'Colour', 'Stock Quantity'],
        ...res.products.map((p: any) => [
          `"${p.name.replace(/"/g, '""')}"`,
          p.sku,
          p.category || '',
          p.brand || '',
          p.regular_price,
          p.discount_price || '',
          p.colour || '',
          p.total_stock || 0,
        ]),
      ];

      const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `shopmate_products_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      setPageError(err.message || 'Failed to export CSV');
    }
  };

  return (
    <div className="space-y-6">

      {/* Header & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-400" />
            <span>Product Catalogue & SKUs</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Manage {products.length} products with variant sizes, colours, prices, and high-resolution imagery.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={() => handleOpenAddModal()}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Product</span>
          </button>
        </div>
      </div>

      {pageError && (
        <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{pageError}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by name, SKU, colour, or brand..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Category */}
        <div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Price Limits */}
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            placeholder="Min ₹"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-1/2 px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
          />
          <input
            type="number"
            placeholder="Max ₹"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="w-1/2 px-2.5 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Sorting */}
        <div>
          <select
            value={`${sortBy}_${sortOrder}`}
            onChange={(e) => {
              const [sb, so] = e.target.value.split('_');
              setSortBy(sb);
              setSortOrder(so);
            }}
            className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
          >
            <option value="created_at_desc">Newest First</option>
            <option value="regular_price_asc">Price: Low to High</option>
            <option value="regular_price_desc">Price: High to Low</option>
            <option value="name_asc">Name: A to Z</option>
          </select>
        </div>
      </div>

      {/* Product Cards Grid */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-xs">
          Loading product catalogue...
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <Package className="w-12 h-12 mx-auto text-slate-600" />
          <h3 className="font-bold text-white text-sm">No products found</h3>
          <p className="text-xs text-slate-400">Try adjusting your search or category filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {products.map((p) => {
            const img = (p.images && p.images[0]) || null;
            const variants = p.variants || [];
            const totalStock = variants.reduce((acc, v) => acc + (v.stock_quantity || 0), 0);

            return (
              <div
                key={p.id}
                className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col justify-between hover:border-slate-700 transition shadow-lg"
              >
                <div>
                  <div className="relative h-48 bg-slate-950 overflow-hidden group">
                    <ProductImage
                      src={img}
                      alt={p.name}
                      category={p.category_name}
                      colour={p.colour}
                      className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
                    />
                    <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-sm text-[10px] font-mono text-indigo-300 border border-slate-800">
                      {p.sku}
                    </div>

                    <div className="absolute top-2.5 right-2.5">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                          totalStock > p.min_stock_threshold
                            ? 'bg-emerald-950/90 text-emerald-400 border border-emerald-800'
                            : totalStock > 0
                            ? 'bg-amber-950/90 text-amber-400 border border-amber-800'
                            : 'bg-rose-950/90 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {totalStock > 0 ? `${totalStock} in stock` : 'Out of Stock'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>{p.category_name || 'Retail'}</span>
                      <span className="text-slate-300 font-medium">{p.colour}</span>
                    </div>

                    <h3 className="font-bold text-xs text-white line-clamp-1" title={p.name}>
                      {p.name}
                    </h3>

                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-emerald-400">
                        ₹{(p.discount_price || p.regular_price).toLocaleString()}
                      </span>
                      {p.discount_price && (
                        <span className="text-xs text-slate-500 line-through">
                          ₹{p.regular_price.toLocaleString()}
                        </span>
                      )}
                    </div>

                    {/* Sizes preview */}
                    <div className="flex flex-wrap gap-1 pt-1">
                      {(p.sizes || []).map((sz, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700/60"
                        >
                          {sz}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 font-medium">
                    {variants.length} variant{variants.length > 1 ? 's' : ''}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenAddModal(p)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition"
                      title="Edit Product"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteProduct(p.id, p.name)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                      title="Archive Product"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Product Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-base text-white">
                {editingProduct ? 'Edit Product Details' : 'Add New Product to Inventory'}
              </h2>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {formSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{formSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Product Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Pure Cotton Chikankari Kurti"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">SKU (Unique) *</label>
                  <input
                    type="text"
                    required
                    disabled={!!editingProduct}
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500 font-mono disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={formData.category_id}
                    onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="">Select Category</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Brand</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. KalaKriti Heritage"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Regular Price (₹) *</label>
                  <input
                    type="number"
                    required
                    step="0.01"
                    value={formData.regular_price}
                    onChange={(e) => setFormData({ ...formData, regular_price: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Discount Price (₹, optional)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.discount_price}
                    onChange={(e) => setFormData({ ...formData, discount_price: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Primary Colour</label>
                  <input
                    type="text"
                    value={formData.colour}
                    onChange={(e) => setFormData({ ...formData, colour: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. Crimson Red"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Sizes (Comma separated)</label>
                  <input
                    type="text"
                    value={formData.sizes}
                    onChange={(e) => setFormData({ ...formData, sizes: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                    placeholder="e.g. S, M, L, XL"
                  />
                </div>
              </div>

              <ImageUploadInput
                multiple
                values={formData.images}
                onMultiChange={(urls) =>
                  setFormData({
                    ...formData,
                    images: urls,
                    imageUrl: urls[0] || '',
                  })
                }
                value={formData.imageUrl || (formData.images && formData.images[0]) || ''}
                onChange={(url) =>
                  setFormData({
                    ...formData,
                    imageUrl: url,
                    images: url ? [url, ...(formData.images?.slice(1) || [])] : [],
                  })
                }
                label="Product Imagery (Local File Upload)"
                helperText="Upload local photos from your device (drag & drop or click). Auto-compressed via canvas utility."
                maxImages={6}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Min Stock Threshold Alert</label>
                  <input
                    type="number"
                    value={formData.min_stock_threshold}
                    onChange={(e) => setFormData({ ...formData, min_stock_threshold: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                {!editingProduct && (
                  <div>
                    <label className="block text-slate-300 font-medium mb-1">Initial Stock (per variant)</label>
                    <input
                      type="number"
                      value={formData.initialStock}
                      onChange={(e) => setFormData({ ...formData, initialStock: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                  placeholder="Material, weave, occasion details..."
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/20"
                >
                  {editingProduct ? 'Update Product' : 'Save & Seed Variants'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
