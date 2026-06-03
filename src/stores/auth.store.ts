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

  /** Set when a contact was matched by displayName because username is missing */
  const forceUsernameSetup = ref(false);
  const pendingUsernameData = ref<{ brand: Brand; contact: Contact } | null>(null);

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

      // Primary lookup: by username field
      let candidate = contacts.find(
        (c) => c.username?.trim().toLowerCase() === trimmedUsername,
      );
      let foundByNameOnly = false;

      // Fallback: match by displayName when username column is empty
      if (!candidate) {
        const nameMatch = contacts.find(
          (c) => !c.username && c.displayName?.trim().toLowerCase() === trimmedUsername,
        );
        if (nameMatch) {
          candidate = nameMatch;
          foundByNameOnly = true;
        }
      }

      if (!candidate) {
        error.value = 'Invalid username or password.';
        return false;
      }

      // Validate password (plain-text or bcrypt)
      const hash = candidate.passwordHash;
      let passwordValid = false;
      if (!hash) {
        passwordValid = true; // no password set — let setup handle it
      } else if (!isBcryptHash(hash)) {
        passwordValid = hash === password; // plain-text comparison
      } else {
        passwordValid = await bcrypt.compare(password, hash);
      }

      if (!passwordValid) {
        error.value = 'Invalid username or password.';
        return false;
      }

      // Username missing — prompt to set one (may chain into password setup)
      if (foundByNameOnly) {
        pendingUsernameData.value = { brand: selectedBrand, contact: candidate };
        forceUsernameSetup.value = true;
        return false;
      }

      // Password needs setup (plain-text or missing hash)
      if (!hash || !isBcryptHash(hash)) {
        pendingSetupData.value = { brand: selectedBrand, contact: candidate };
        forcePasswordSetup.value = true;
        return false;
      }

      brand.value = selectedBrand;
      user.value = candidate;
      StorageService.setAuth({ brand: selectedBrand, user: candidate });
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

  /**
   * Saves the chosen username then either chains into password setup
   * (if passwordHash is still plain-text/missing) or completes login.
   * Returns true when login is fully complete (caller should sync + navigate).
   */
  async function completeUsernameSetup(newUsername: string): Promise<boolean> {
    if (!pendingUsernameData.value) return false;
    const { brand: b, contact: c } = pendingUsernameData.value;

    const updated: Contact = { ...c, username: newUsername };

    const contacts = StorageService.getCachedContacts();
    const idx = contacts.findIndex((x) => x.id === updated.id);
    if (idx >= 0) contacts[idx] = updated;
    StorageService.setCachedContacts(contacts);

    forceUsernameSetup.value = false;
    pendingUsernameData.value = null;

    // If password also needs setup, chain into that flow
    if (!updated.passwordHash || !isBcryptHash(updated.passwordHash)) {
      pendingSetupData.value = { brand: b, contact: updated };
      forcePasswordSetup.value = true;
      return false;
    }

    brand.value = b;
    user.value = updated;
    StorageService.setAuth({ brand: b, user: updated });
    return true;
  }

  function clearUsernameSetup(): void {
    forceUsernameSetup.value = false;
    pendingUsernameData.value = null;
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
    forceUsernameSetup,
    pendingUsernameData,
    loadFromStorage,
    login,
    completePasswordSetup,
    clearPasswordSetup,
    completeUsernameSetup,
    clearUsernameSetup,
    updateUser,
    logout,
    clearError,
  };
});
