'use client'
import { confirmAction } from '@/features/dashboard/components/ConfirmDialog'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Trash2, DollarSign, Clock, ChefHat, AlertTriangle, RefreshCw, BookOpen, Utensils, Scale, Timer, Layers, ArrowUpRight, Percent } from 'lucide-react'
import { gql, request } from 'graphql-request'
import { PageBreadcrumbs } from "@/features/dashboard/components/PageBreadcrumbs"
import { cn } from '@/lib/utils'

interface Recipe {
  id: string
  name: string
  menuItem: { id: string; name: string; price: string } | null
  recipeIngredients: RecipeIngredient[] | null
  yield: number
  prepTime: number | null
  instructions: string | null
  totalCost: number | null
  costPerServing: number | null
  foodCostPercentage: number | null
}

interface RecipeIngredient {
  ingredientId: string
  quantity: number
  unit: string
}

interface Ingredient {
  id: string
  name: string
  unit: string
  costPerUnit: string | null
}

interface MenuItem {
  id: string
  name: string
  price: string
}

const GET_RECIPES = gql`
  query GetRecipes {
    recipes(orderBy: { name: asc }) {
      id
      name
      menuItem { id name price }
      recipeIngredients
      yield
      prepTime
      instructions
      totalCost
      costPerServing
      foodCostPercentage
    }
    ingredients(orderBy: { name: asc }) {
      id
      name
      unit
      costPerUnit
    }
    menuItems(orderBy: { name: asc }) {
      id
      name
      price
    }
  }
`

const CREATE_RECIPE = gql`
  mutation CreateRecipe($data: RecipeCreateInput!) {
    createRecipe(data: $data) { id name }
  }
`

const UPDATE_RECIPE = gql`
  mutation UpdateRecipe($id: ID!, $data: RecipeUpdateInput!) {
    updateRecipe(where: { id: $id }, data: $data) { id name }
  }
`

const DELETE_RECIPE = gql`
  mutation DeleteRecipe($id: ID!) {
    deleteRecipe(where: { id: $id }) { id }
  }
`

function getFoodCostColor(percentage: number | null): string {
  if (!percentage) return 'text-muted-foreground'
  if (percentage <= 28) return 'text-emerald-600 dark:text-emerald-400'
  if (percentage <= 35) return 'text-amber-600 dark:text-amber-400'
  return 'text-rose-600 dark:text-rose-400'
}

export function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [ingredients, setIngredients] = useState<Ingredient[]>([])
  const [menuItems, setMenuItems] = useState<MenuItem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null)

  const [form, setForm] = useState({
    name: '',
    menuItemId: '',
    yield: 1,
    prepTime: 15,
    instructions: '',
    recipeIngredients: [] as RecipeIngredient[],
  })

  const fetchData = useCallback(async () => {
    try {
      const data = await request('/api/graphql', GET_RECIPES)
      setRecipes((data as any).recipes || [])
      setIngredients((data as any).ingredients || [])
      setMenuItems((data as any).menuItems || [])
    } catch (err) {
      console.error('Error fetching recipes:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const resetForm = () => {
    setForm({
      name: '',
      menuItemId: '',
      yield: 1,
      prepTime: 15,
      instructions: '',
      recipeIngredients: [],
    })
    setEditingRecipe(null)
  }

  const handleOpenDialog = (recipe?: Recipe) => {
    if (recipe) {
      setEditingRecipe(recipe)
      setForm({
        name: recipe.name,
        menuItemId: recipe.menuItem?.id || '',
        yield: recipe.yield,
        prepTime: recipe.prepTime || 15,
        instructions: recipe.instructions || '',
        recipeIngredients: recipe.recipeIngredients || [],
      })
    } else {
      resetForm()
    }
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!form.name) return;
    try {
      const data: any = {
        name: form.name,
        yield: form.yield,
        prepTime: form.prepTime,
        instructions: form.instructions || null,
        recipeIngredients: form.recipeIngredients,
      }

      if (form.menuItemId) {
        data.menuItem = { connect: { id: form.menuItemId } }
      }

      if (editingRecipe) {
        await request('/api/graphql', UPDATE_RECIPE, { id: editingRecipe.id, data })
      } else {
        await request('/api/graphql', CREATE_RECIPE, { data })
      }

      setDialogOpen(false)
      resetForm()
      fetchData()
    } catch (err) {
      console.error('Error saving recipe:', err)
    }
  }

  const handleDelete = async (id: string) => {
    if (!(await confirmAction({ title: 'Delete this recipe?', confirmLabel: 'Delete recipe', destructive: true }))) return
    try {
      await request('/api/graphql', DELETE_RECIPE, { id })
      fetchData()
    } catch (err) {
      console.error('Error deleting recipe:', err)
    }
  }

  const addIngredient = () => {
    setForm({
      ...form,
      recipeIngredients: [...form.recipeIngredients, { ingredientId: '', quantity: 1, unit: 'lb' }],
    })
  }

  const removeIngredient = (index: number) => {
    const updated = [...form.recipeIngredients]
    updated.splice(index, 1)
    setForm({ ...form, recipeIngredients: updated })
  }

  const updateIngredient = (index: number, field: string, value: any) => {
    const updated = [...form.recipeIngredients]
    updated[index] = { ...updated[index], [field]: value }
    setForm({ ...form, recipeIngredients: updated })
  }

  const getIngredientName = (id: string) => {
    return ingredients.find(i => i.id === id)?.name || 'Unknown'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const avgFoodCost = recipes.length > 0
    ? (recipes.reduce((s, r) => s + (r.foodCostPercentage || 0), 0) / recipes.length)
    : 0;

  const breadcrumbs = [
    { type: 'link' as const, label: 'Dashboard', href: '' },
    { type: 'page' as const, label: 'Platform' },
    { type: 'page' as const, label: 'Recipes' }
  ]

  return (
    <div className="flex flex-col h-full">
      <PageBreadcrumbs items={breadcrumbs} />

      {/* Header */}
      <div className="px-6 py-6 border-b bg-gradient-to-br from-emerald-500/5 via-background to-amber-500/5">
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-1 flex items-center gap-3">
              Recipes & Costing
            </h1>
            <p className="text-muted-foreground">Master your culinary database and profitability</p>
          </div>
          <Button onClick={() => handleOpenDialog()} size="lg" className="bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-100 dark:shadow-none transition-all hover:scale-105 active:scale-95">
            <Plus className="h-5 w-5 mr-2" />
            Create Recipe
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="border-2 rounded-2xl bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/20 dark:to-background">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/20">
                  <Percent className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Avg Food Cost</div>
                  <div className="text-3xl font-black mt-1">{avgFoodCost.toFixed(1)}%</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 rounded-2xl hover:border-rose-500/30 transition-all">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-rose-500/10 dark:bg-rose-500/20">
                  <AlertTriangle className="h-6 w-6 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">High Cost Items</div>
                  <div className="text-3xl font-black mt-1">
                    {recipes.filter(r => (r.foodCostPercentage || 0) > 35).length}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-2 rounded-2xl hover:border-amber-500/30 transition-all">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-amber-500/10 dark:bg-amber-500/20">
                  <BookOpen className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Catalog Size</div>
                  <div className="text-3xl font-black mt-1">{recipes.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Main Content */}
      <ScrollArea className="flex-1">
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {recipes.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-3xl">
              <Utensils className="h-12 w-12 text-muted-foreground opacity-20 mb-4" />
              <h3 className="text-xl font-bold mb-2">Recipe book is empty</h3>
              <p className="text-muted-foreground mb-8 max-w-xs mx-auto">Build your digital kitchen catalog to track profitability.</p>
              <Button onClick={() => handleOpenDialog()} variant="outline" className="rounded-xl border-2">
                <Plus className="h-4 w-4 mr-2" />
                Add First Recipe
              </Button>
            </div>
          ) : (
            recipes.map((recipe) => (
              <Card 
                key={recipe.id} 
                className="border-2 rounded-3xl hover:border-emerald-500/30 transition-all cursor-pointer group overflow-hidden flex flex-col h-full bg-card shadow-sm hover:shadow-xl"
                onClick={() => handleOpenDialog(recipe)}
              >
                {/* Recipe Header Card Section */}
                <div className="p-6 flex-1 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-xl font-bold tracking-tight line-clamp-2">{recipe.name}</h3>
                      {recipe.menuItem && (
                        <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                          <Utensils className="h-3 w-3" />
                          {recipe.menuItem.name}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end">
                       <Badge className={cn("rounded-lg px-2.5 py-1 text-[10px] font-black tracking-widest uppercase", getFoodCostColor(recipe.foodCostPercentage), "bg-muted border-none")}>
                        {recipe.foodCostPercentage ? `${recipe.foodCostPercentage.toFixed(1)}% FC` : 'No Cost'}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/40 p-3 rounded-2xl flex flex-col justify-center">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Cost/Serving</div>
                      <div className="font-black text-lg">${(recipe.costPerServing || 0).toFixed(2)}</div>
                    </div>
                    <div className="bg-muted/40 p-3 rounded-2xl flex flex-col justify-center">
                      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Menu Price</div>
                      <div className="font-black text-lg">
                        {recipe.menuItem ? `$${parseFloat(recipe.menuItem.price).toFixed(2)}` : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                    <div className="flex items-center gap-1.5">
                      <Scale className="size-3.5" />
                      <span>Yield: {recipe.yield}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Timer className="size-3.5" />
                      <span>Prep: {recipe.prepTime || 0}m</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Layers className="size-3.5" />
                      <span>{recipe.recipeIngredients?.length || 0} Ingredients</span>
                    </div>
                  </div>
                </div>

                <div className="px-6 py-4 bg-muted/20 border-t flex items-center justify-between">
                   <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                      View Recipe <ArrowUpRight className="size-3" />
                   </div>
                   <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 group-hover:opacity-100 opacity-0 transition-opacity"
                      onClick={(e) => { e.stopPropagation(); handleDelete(recipe.id) }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
              </Card>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Editor Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-[2rem] p-0">
          <DialogHeader className="p-8 pb-4">
            <DialogTitle className="text-2xl font-black tracking-tight">{editingRecipe ? 'Edit Master Recipe' : 'New Master Recipe'}</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 px-8 pb-8">
            <div className="space-y-8 pt-4">
              {/* Basic Info Group */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Recipe Name *</Label>
                  <Input
                    className="h-12 rounded-2xl border-2 px-4 font-bold text-lg"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Signature Dish Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Menu Item Link</Label>
                  <Select value={form.menuItemId} onValueChange={(v) => setForm({ ...form, menuItemId: v })}>
                    <SelectTrigger className="h-12 rounded-2xl border-2 px-4 font-bold">
                      <SelectValue placeholder="Link to Sales Item" />
                    </SelectTrigger>
                    <SelectContent className="rounded-2xl">
                      {menuItems.map((item) => (
                        <SelectItem key={item.id} value={item.id} className="rounded-xl">
                          {item.name} (${parseFloat(item.price).toFixed(2)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Specs Group */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Yield (Servings)</Label>
                  <div className="relative">
                    <Scale className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min={1}
                      className="h-12 rounded-2xl border-2 pl-12 font-bold"
                      value={form.yield}
                      onChange={(e) => setForm({ ...form, yield: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Prep Time (Min)</Label>
                  <div className="relative">
                    <Timer className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min={0}
                      className="h-12 rounded-2xl border-2 pl-12 font-bold"
                      value={form.prepTime}
                      onChange={(e) => setForm({ ...form, prepTime: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
              </div>

              {/* Ingredients List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Ingredient Composition</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addIngredient} className="rounded-xl border-2 font-bold h-8">
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Add Entry
                  </Button>
                </div>

                <div className="space-y-3">
                  {form.recipeIngredients.length === 0 ? (
                    <div className="text-center py-10 border-2 border-dashed rounded-[2rem] bg-muted/30">
                       <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Empty composition</p>
                    </div>
                  ) : (
                    form.recipeIngredients.map((ri, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-muted/30 p-3 rounded-2xl border-2 border-transparent hover:border-muted-foreground/10 transition-all">
                        <Select
                          value={ri.ingredientId}
                          onValueChange={(v) => updateIngredient(idx, 'ingredientId', v)}
                        >
                          <SelectTrigger className="flex-1 rounded-xl h-10 border-none bg-background shadow-sm font-medium">
                            <SelectValue placeholder="Choose Ingredient" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            {ingredients.map((ing) => (
                              <SelectItem key={ing.id} value={ing.id} className="rounded-lg">
                                {ing.name} (${ing.costPerUnit || '0'}/{ing.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          type="number"
                          className="w-24 rounded-xl h-10 border-none bg-background shadow-sm font-bold text-center"
                          value={ri.quantity}
                          onChange={(e) => updateIngredient(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          placeholder="Qty"
                        />
                        <Select value={ri.unit} onValueChange={(v) => updateIngredient(idx, 'unit', v)}>
                          <SelectTrigger className="w-24 rounded-xl h-10 border-none bg-background shadow-sm font-bold">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="kg">kg</SelectItem>
                            <SelectItem value="lb">lb</SelectItem>
                            <SelectItem value="oz">oz</SelectItem>
                            <SelectItem value="liter">liter</SelectItem>
                            <SelectItem value="each">each</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeIngredient(idx)} className="text-rose-500 rounded-xl hover:bg-rose-50">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Instructions Section */}
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Preparation Instructions</Label>
                <Textarea
                  className="rounded-2xl border-2 px-4 py-4 min-h-[120px] resize-none font-medium leading-relaxed"
                  value={form.instructions}
                  onChange={(e) => setForm({ ...form, instructions: e.target.value })}
                  placeholder="Describe the culinary process step by step..."
                />
              </div>

              <div className="pt-4">
                <Button onClick={handleSave} className="w-full h-14 rounded-2xl text-lg font-black uppercase tracking-widest bg-emerald-600 hover:bg-emerald-700 shadow-xl shadow-emerald-500/20">
                   {editingRecipe ? 'Commit Recipe Changes' : 'Publish Master Recipe'}
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default RecipesPage
