type CategorizedMenuItem = { id: string; featured?: boolean | null; popular?: boolean | null; category?: any; categoryId?: string | null };

export function buildMenuVisibility<T extends CategorizedMenuItem, C extends { id: string; name: string }>(allItems: T[], categories: C[]) {
  const featuredItems = allItems.filter((item) => Boolean(item.featured));
  const popularItems = allItems.filter((item) => Boolean(item.popular)).slice(0, 4);
  const houseItems = featuredItems.slice(0, 3);
  const houseIds = new Set(houseItems.map((item) => item.id));

  const categorySections = categories.map((category) => {
    const items = allItems.filter((item) => {
      const categoryId = typeof item.category === "object" && item.category?.id
        ? item.category.id
        : typeof item.category === "string"
          ? item.category
          : item.categoryId;
      return categoryId === category.id && !houseIds.has(item.id);
    });
    return { category, items, sectionId: `category-${category.id}` };
  }).filter((section) => section.items.length > 0);

  const categorizedIds = new Set(categorySections.flatMap((section) => section.items.map((item) => item.id)));
  const otherItems = allItems.filter((item) => !houseIds.has(item.id) && !categorizedIds.has(item.id));
  return { featuredItems, popularItems, houseItems, categorySections, otherItems };
}

export function selectHeroMenuItems<T extends { id: string }>(
  allItems: T[],
  featuredItems: T[],
  popularItems: T[],
) {
  const prioritized = [...featuredItems, ...popularItems, ...allItems.slice(0, 6)];
  return [...new Map(prioritized.map((item) => [item.id, item])).values()].slice(0, 4);
}
