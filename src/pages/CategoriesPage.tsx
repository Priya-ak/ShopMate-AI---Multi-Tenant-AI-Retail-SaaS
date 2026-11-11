import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { ProductCategory } from '../types';
import { ProductImage } from '../components/ProductImage';
import { BackButton } from '../components/BackButton';
import { ImageUploadInput } from '../components/ImageUploadInput';
import { Layers, Plus, Trash2, Edit2, AlertCircle, CheckCircle, X, Package } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface CategoriesPageProps {
  onBack?: () => void;
}

export const CategoriesPage: React.FC<CategoriesPageProps> = ({ onBack }) => {
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setIsLoading(true);
    try {
      const data = await api.getCategories();
      setCategories(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setErrorMsg('Category name is required.');
      return;
    }

    try {
      await api.createCategory({
        name,
        description,
        image_url: imageUrl || '',
      });
      setSuccessMsg('Category created successfully!');
      setName('');
      setDescription('');
      setImageUrl('');
      setTimeout(() => {
        setIsModalOpen(false);
        loadCategories();
      }, 600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create category');
    }
  };

  const [pageError, setPageError] = useState<string | null>(null);

  const handleDelete = async (cat: ProductCategory) => {
    setPageError(null);
    if (cat.product_count && cat.product_count > 0) {
      setPageError(`Cannot delete "${cat.name}": contains ${cat.product_count} active product(s). Please reassign or delete the products first.`);
      return;
    }

    setCatToDelete(cat);
  };

  const [catToDelete, setCatToDelete] = useState<ProductCategory | null>(null);
  const [deletingCat, setDeletingCat] = useState(false);

  const confirmDeleteCategory = async () => {
    if (!catToDelete) return;
    setDeletingCat(true);
    try {
      await api.deleteCategory(catToDelete.id);
      setCatToDelete(null);
      loadCategories();
    } catch (err: any) {
      setCatToDelete(null);
      setPageError(err.message || 'Failed to delete category');
    } finally {
      setDeletingCat(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl bg-slate-900 border border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Layers className="w-6 h-6 text-indigo-400" />
            <span>Product Categories</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Organize products into customer-facing departments with image banners.
          </p>
        </div>

        <button
          onClick={() => {
            setErrorMsg(null);
            setSuccessMsg(null);
            setPageError(null);
            setIsModalOpen(true);
          }}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-lg shadow-indigo-600/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Category</span>
        </button>
      </div>

      {pageError && (
        <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{pageError}</span>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div className="text-center py-16 text-slate-400 text-xs">Loading categories...</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden flex flex-col justify-between shadow-lg hover:border-slate-700 transition"
            >
              <div>
                <div className="h-32 bg-slate-950 overflow-hidden relative">
                  <ProductImage
                    src={cat.image_url}
                    alt={cat.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-sm text-[10px] font-bold text-white border border-slate-800">
                    {cat.product_count || 0} products
                  </div>
                </div>

                <div className="p-4 space-y-1.5">
                  <h3 className="font-bold text-sm text-white">{cat.name}</h3>
                  <p className="text-xs text-slate-400 line-clamp-2">{cat.description || 'No description provided.'}</p>
                </div>
              </div>

              <div className="p-3 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between text-xs">
                <span className="font-mono text-[10px] text-slate-500">/{cat.slug}</span>
                <button
                  onClick={() => handleDelete(cat)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
                  title="Delete Category"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Category Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 text-white rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="font-bold text-base text-white">Create Product Category</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Category Name *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Silk Sarees or Designer Kurtis"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <ImageUploadInput
                value={imageUrl}
                onChange={setImageUrl}
                label="Category Banner Image"
                helperText="Upload category cover photo (PNG, JPG, WebP)"
              />

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description</label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short description for AI and customer discovery..."
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
                >
                  Create Category
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {catToDelete && (
        <ConfirmDialog
          title={`Delete category "${catToDelete.name}"?`}
          message="Empty categories can be deleted safely. Categories that still contain products are blocked."
          busy={deletingCat}
          onConfirm={confirmDeleteCategory}
          onCancel={() => setCatToDelete(null)}
        />
      )}
    </div>
  );
};
