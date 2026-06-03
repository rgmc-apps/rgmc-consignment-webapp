import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import bcrypt from 'bcryptjs';
import type { Brand, Contact } from '@/types';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';

function isBcryptHash(value: string): boolean {
  try {
    bcrypt.getRounds(value);
    return true;
  } catch {
    return false;
  }
}

export const useAuthStore = defineStore('auth', () => {
  const brand = ref<Brand | null>(null);
  const user = ref<Contact | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  /** Set when a matched contact has an empty or non-bcrypt passwordHash */
  const forcePasswordSetup = ref(false);
  const pendingSetupData = ref<{ brand: Brand; contact: Contact } | null>(null);

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

      // Contact found but has no valid bcrypt hash — needs first-time password setup
      if (candidate && (!candidate.passwordHash || !isBcryptHash(candidate.passwordHash))) {
        pendingSetupData.value = { brand: selectedBrand, contact: candidate };
        forcePasswordSetup.value = true;
        return false;
      }

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

  async function completePasswordSetup(newPassword: string): Promise<void> {
    if (!pendingSetupData.value) return;
    const { brand: b, contact: c } = pendingSetupData.value;

    const hash = await bcrypt.hash(newPassword, 10);
    const updated: Contact = { ...c, passwordHash: hash };

    // Persist to cached contacts list so the hash survives future logins
    const contacts = StorageService.getCachedContacts();
    const idx = contacts.findIndex((x) => x.id === updated.id);
    if (idx >= 0) contacts[idx] = updated;
    StorageService.setCachedContacts(contacts);

    brand.value = b;
    user.value = updated;
    StorageService.setAuth({ brand: b, user: updated });

    forcePasswordSetup.value = false;
    pendingSetupData.value = null;
  }

  function clearPasswordSetup(): void {
    forcePasswordSetup.value = false;
    pendingSetupData.value = null;
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
    forcePasswordSetup,
    pendingSetupData,
    loadFromStorage,
    login,
    completePasswordSetup,
    clearPasswordSetup,
    updateUser,
    logout,
    clearError,
  };
});
