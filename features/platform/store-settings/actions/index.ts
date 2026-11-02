'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { revalidatePath } from 'next/cache';
import { buildStoreSettingsPayload } from '../lib/store-settings-payload';

export async function updateStoreSettings(storeId: string | undefined, data: Record<string, any> & {
  logoIcon?: string;
  logoColor?: string;
}) {
  // Sanitize SVG before saving to prevent XSS attacks
  const payload = buildStoreSettingsPayload(data);
  if (!payload.success) return payload;

  const mutation = storeId
    ? `
    mutation UpdateStoreSettings($id: ID!, $data: StoreSettingsUpdateInput!) {
      updateStoreSettings(where: { id: $id }, data: $data) {
        id
        name
        logoIcon
        logoColor
      }
    }
  `
    : `
    mutation CreateStoreSettings($data: StoreSettingsCreateInput!) {
      createStoreSettings(data: $data) {
        id
        name
        logoIcon
        logoColor
      }
    }
  `;

  const response = await keystoneClient(mutation, storeId ? { id: storeId, data: payload.data } : { data: payload.data });

  if (!response.success) {
    return { success: false, error: response.error };
  }

  revalidatePath('/dashboard');
  revalidatePath('/', 'layout');

  return { success: true, data: response.data?.updateStoreSettings ?? response.data?.createStoreSettings };
}
