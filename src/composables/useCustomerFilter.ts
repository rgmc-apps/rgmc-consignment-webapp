import { computed } from 'vue';
import type { Ref } from 'vue';
import type { Customer } from '@/types';

export function useCustomerFilter(
  allCustomers: Ref<Customer[]>,
  searchQuery: Ref<string> = computed(() => ''),
) {
  const filteredCustomers = computed(() => {
    const query = searchQuery.value.trim().toUpperCase();
    if (!query) return allCustomers.value;
    return allCustomers.value.filter(
      (c) =>
        c.displayName.toUpperCase().includes(query) ||
        c.number.toUpperCase().includes(query) ||
        c.city?.toUpperCase().includes(query),
    );
  });

  return { filteredCustomers };
}
