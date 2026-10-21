import { ListPage } from '@/features/dashboard/screens/ListPage'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export function MenuItemListPage({ searchParams }: PageProps) {
  return <ListPage params={Promise.resolve({ listKey: "menu-items" })} searchParams={searchParams} />
}

export default MenuItemListPage
