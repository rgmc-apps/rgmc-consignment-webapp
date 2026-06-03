import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import bcrypt from 'bcryptjs';
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

      const trimmedUsername = username.trim().toLowerCase();

      const candidate = contacts.find(
        (c) => c.username?.trim().toLowerCase() === trimmedUsername,
      );

      const passwordValid =
        !!candidate?.passwordHash &&
        (await bcrypt.compare(password, candidate.passwordHash));

      const match = passwordValid ? candidate : undefined;

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

  function updateUser(updates: Partial<Contact>): void {
    if (!user.value) return;
    user.value = { ...user.value, ...updates };
    if (brand.value) {
      StorageService.setAuth({ brand: brand.value, user: user.value });
    }
    const contacts = StorageService.getCachedContacts();
    const idx = contacts.findIndex((c) => c.id === user.value!.id);
    if (idx >= 0) {
      contacts[idx] = user.value;
      StorageService.setCachedContacts(contacts);
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
    updateUser,
    logout,
    clearError,
  };
});
