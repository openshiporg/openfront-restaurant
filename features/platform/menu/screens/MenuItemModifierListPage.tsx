import { ListPage } from '@/features/dashboard/screens/ListPage'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export function MenuItemModifierListPage({ searchParams }: PageProps) {
  return <ListPage params={Promise.resolve({ listKey: "menu-item-modifiers" })} searchParams={searchParams} />
}

export default MenuItemModifierListPage
