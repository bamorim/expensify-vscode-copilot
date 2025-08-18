"use client";

import { useState } from "react";
import { api } from "~/trpc/react";

interface CategoryManagementProps {
  organizationId: string;
  isAdmin: boolean;
}

export function CategoryManagement({ organizationId, isAdmin }: CategoryManagementProps) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");

  const { data: categories = [], isLoading } = api.category.getAll.useQuery(
    { organizationId }
  );

  const utils = api.useUtils();

  const createCategory = api.category.create.useMutation({
    onSuccess: async () => {
      await utils.category.getAll.invalidate();
      setShowCreateForm(false);
      setNewCategoryName("");
      setNewCategoryDescription("");
    },
  });

  const updateCategory = api.category.update.useMutation({
    onSuccess: async () => {
      await utils.category.getAll.invalidate();
      setEditingCategory(null);
      setNewCategoryName("");
      setNewCategoryDescription("");
    },
  });

  const deleteCategory = api.category.delete.useMutation({
    onSuccess: async () => {
      await utils.category.getAll.invalidate();
    },
  });

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    await createCategory.mutateAsync({
      organizationId,
      name: newCategoryName.trim(),
      description: newCategoryDescription.trim() || undefined,
    });
  };

  const handleUpdateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !newCategoryName.trim()) return;

    await updateCategory.mutateAsync({
      id: editingCategory,
      name: newCategoryName.trim(),
      description: newCategoryDescription.trim() || undefined,
    });
  };

  const handleDeleteCategory = async (categoryId: string) => {
    if (!confirm("Are you sure you want to delete this category?")) return;
    await deleteCategory.mutateAsync({ id: categoryId });
  };

  const startEditing = (category: { id: string; name: string; description: string | null }) => {
    setEditingCategory(category.id);
    setNewCategoryName(category.name);
    setNewCategoryDescription(category.description ?? "");
  };

  const cancelEditing = () => {
    setEditingCategory(null);
    setNewCategoryName("");
    setNewCategoryDescription("");
  };

  if (isLoading) {
    return (
      <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
        <h2 className="text-2xl font-semibold mb-4">Categories</h2>
        <p className="text-white/60">Loading categories...</p>
      </div>
    );
  }

  return (
    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-semibold">Categories</h2>
        {isAdmin && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Add Category
          </button>
        )}
      </div>

      {/* Create Category Form */}
      {showCreateForm && (
        <div className="bg-white/5 rounded-lg p-4 mb-4">
          <h3 className="text-lg font-medium mb-3">Create New Category</h3>
          <form onSubmit={handleCreateCategory} className="space-y-3">
            <div>
              <label htmlFor="categoryName" className="block text-sm font-medium mb-1">
                Category Name
              </label>
              <input
                id="categoryName"
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g., Travel, Meals, Office Supplies"
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
              />
            </div>
            <div>
              <label htmlFor="categoryDescription" className="block text-sm font-medium mb-1">
                Description (Optional)
              </label>
              <textarea
                id="categoryDescription"
                value={newCategoryDescription}
                onChange={(e) => setNewCategoryDescription(e.target.value)}
                placeholder="Brief description of this category"
                rows={2}
                className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={createCategory.isPending}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-4 py-2 rounded-lg font-medium transition-colors"
              >
                {createCategory.isPending ? "Creating..." : "Create Category"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewCategoryName("");
                  setNewCategoryDescription("");
                }}
                className="bg-gray-600 hover:bg-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Categories List */}
      {categories.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-white/60 mb-4">No categories created yet.</p>
          {isAdmin && (
            <p className="text-white/40 text-sm">
              Create your first category to start organizing expenses.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map((category) => (
            <div key={category.id} className="bg-white/5 rounded-lg p-4">
              {editingCategory === category.id ? (
                /* Edit Form */
                <form onSubmit={handleUpdateCategory} className="space-y-3">
                  <div>
                    <label htmlFor={`editName-${category.id}`} className="block text-sm font-medium mb-1">
                      Category Name
                    </label>
                    <input
                      id={`editName-${category.id}`}
                      type="text"
                      value={newCategoryName}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor={`editDescription-${category.id}`} className="block text-sm font-medium mb-1">
                      Description
                    </label>
                    <textarea
                      id={`editDescription-${category.id}`}
                      value={newCategoryDescription}
                      onChange={(e) => setNewCategoryDescription(e.target.value)}
                      rows={2}
                      className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={updateCategory.isPending}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-sm font-medium transition-colors"
                    >
                      {updateCategory.isPending ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      className="bg-gray-600 hover:bg-gray-700 px-3 py-1 rounded text-sm font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                /* Display Mode */
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-medium text-lg">{category.name}</h3>
                    {category.description && (
                      <p className="text-white/70 text-sm mt-1">{category.description}</p>
                    )}
                    <p className="text-white/40 text-xs mt-2">
                      Created {new Date(category.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => startEditing(category)}
                        className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-sm font-medium transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteCategory(category.id)}
                        disabled={deleteCategory.isPending}
                        className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-3 py-1 rounded text-sm font-medium transition-colors"
                      >
                        {deleteCategory.isPending ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
