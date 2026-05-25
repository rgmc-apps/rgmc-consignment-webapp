import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Brand, Contact } from '@/types';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';

export const useAuthStore = defineStore('auth', () => {
  const brand = ref<Brand | null>(null);
  const user = ref<Contact | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const isAuthenticated = computed(() => !!brand.value && !!user.value);

  function loadFromStorage(): void {
    const saved = StorageService.getAuth();
    if (saved) {
      brand.value = saved.brand;
      user.value = saved.user;
    }
  }

  async function login(
    selectedBrand: Brand,
    username: string,
    password: string,
  ): Promise<boolean> {
    isLoading.value = true;
    error.value = null;

    try {
      let contacts = StorageService.getCachedContacts();

      if (!contacts.length) {
        contacts = await ApiService.getContacts();
        StorageService.setCachedContacts(contacts);
      }

      const trimmedUsername = username.trim().toUpperCase();
      const trimmedPassword = password.trim();

      const match = contacts.find(
        (c) =>
          c.displayName.trim().toUpperCase() === trimmedUsername &&
          c.phoneNumber.trim() === trimmedPassword,
      );

      if (!match) {
        error.value = 'Invalid username or password.';
        return false;
      }

      brand.value = selectedBrand;
      user.value = match;
      StorageService.setAuth({ brand: selectedBrand, user: match });
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed. Please try again.';
      return false;
    } finally {
      isLoading.value = false;
    }
  }

  function logout(): void {
    brand.value = null;
    user.value = null;
    StorageService.clearAuth();
  }

  function clearError(): void {
    error.value = null;
  }

  return {
    brand,
    user,
    isAuthenticated,
    isLoading,
    error,
    loadFromStorage,
    login,
    logout,
    clearError,
  };
});
