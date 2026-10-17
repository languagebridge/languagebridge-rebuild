import { getPilotsContainer } from './cosmos-client';
import { AzurePrices, DEFAULT_PRICES } from './azure-quotas';

/**
 * Azure unit prices + value assumptions in effect. Stored as one config record in
 * `pilots` (id '__azure_prices__') so a super-admin can change them without a
 * deploy (PUT /api/ops/pricing); falls back to DEFAULT_PRICES.
 */
export const PRICES_ID = '__azure_prices__';

export async function loadPrices(): Promise<AzurePrices> {
  try {
    const { resource } = await getPilotsContainer().item(PRICES_ID, PRICES_ID).read<AzurePrices & { id: string }>();
    if (resource) {
      const { id: _id, ...prices } = resource;
      return { ...DEFAULT_PRICES, ...prices };
    }
  } catch { /* fall back to defaults */ }
  return DEFAULT_PRICES;
}
