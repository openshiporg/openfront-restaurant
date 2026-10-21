import { ListPage } from '@/features/dashboard/screens/ListPage'

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export function MenuCategoryListPage({ searchParams }: PageProps) {
  return <ListPage params={Promise.resolve({ listKey: "menu-categories" })} searchParams={searchParams} />
}

export default MenuCategoryListPage
