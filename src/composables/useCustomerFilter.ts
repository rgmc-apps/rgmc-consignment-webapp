import { computed } from 'vue';
import type { Ref } from 'vue';
import type { Brand, Customer } from '@/types';

const BRAND_FILTER_MAP: Record<string, string[]> = {
  'E-CONTAINER': ['ECON', 'ECONTAINER', 'ECO'],
  'PDCO': ['PD & CO', 'PDC'],
  'PD&CO': ['PD & CO', 'PDC'],
  'PD CO': ['PD & CO', 'PDC'],
  'TREEHOUSE': ['TREEHOUSE'],
  'APPLE & EVE': ['APPLE & EVE'],
  'APPLE AND EVE': ['APPLE & EVE'],
  'HEAD OFFICE': ['HO', 'HEAD OFFICE'],
  'SCOOP PROJECT': ['SCOOP PROJECT', 'SP', 'SCOOP'],
};

function normalize(str: string): string {
  return str
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

function getFilterKeywords(brandDisplayName: string): string[] {
  const raw = brandDisplayName.toUpperCase().trim();
  const clean = normalize(raw);

  /* Exact match on raw name */
  if (BRAND_FILTER_MAP[raw]) return BRAND_FILTER_MAP[raw];

  /* Normalized match */
  for (const [key, keywords] of Object.entries(BRAND_FILTER_MAP)) {
    if (normalize(key) === clean) return keywords;
  }

  /* Partial containment match */
  for (const [key, keywords] of Object.entries(BRAND_FILTER_MAP)) {
    if (raw.includes(key.toUpperCase()) || key.toUpperCase().includes(raw)) {
      return keywords;
    }
  }

  return [];
}

export function useCustomerFilter(
  brand: Ref<{ displayName: string } | null>,
  allCustomers: Ref<Customer[]>,
  searchQuery: Ref<string> = computed(() => ''),
) {
  const brandFilteredCustomers = computed(() => {
    if (!brand.value) return [];
    const keywords = getFilterKeywords(brand.value.displayName);
    if (!keywords.length) return allCustomers.value;

    return allCustomers.value.filter((c) => {
      const name = c.displayName.toUpperCase();
      return keywords.some((kw) => name.includes(kw.toUpperCase()));
    });
  });

  const filteredCustomers = computed(() => {
    const query = searchQuery.value.trim().toUpperCase();
    if (!query) return brandFilteredCustomers.value;
    return brandFilteredCustomers.value.filter(
      (c) =>
        c.displayName.toUpperCase().includes(query) ||
        c.number.toUpperCase().includes(query) ||
        c.city?.toUpperCase().includes(query),
    );
  });

  return {
    brandFilteredCustomers,
    filteredCustomers,
  };
}
