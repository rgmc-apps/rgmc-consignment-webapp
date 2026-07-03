import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import bcrypt from 'bcryptjs';
import type { Brand, Company, Contact } from '@/types';
import { ApiService, setApiCompany } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';

function isBcryptHash(value: string): boolean {
  return /^\$2[abyA-Z]\$\d{2}\$/.test(value);
}

export const useAuthStore = defineStore('auth', () => {
  const company = ref<Company | null>(StorageService.getCompany());
  const brand = ref<Brand | null>(null);
  const user = ref<Contact | null>(null);
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const photoUrl = ref<string | null>(StorageService.getAuthPhoto());

  // Restore the API interceptor if a company was already persisted (e.g. page refresh)
  if (company.value) setApiCompany(company.value);

  /** Set when a matched contact has an empty or non-bcrypt passwordHash */
  const forcePasswordSetup = ref(false);
  const pendingSetupData = ref<{ brand: Brand; contact: Contact } | null>(null);

  const isAuthenticated = computed(() => !!brand.value && !!user.value);

  function setPhotoUrl(url: string): void {
    photoUrl.value = url;
    StorageService.setAuthPhoto(url);
  }

  async function fetchAndCachePhoto(): Promise<void> {
    if (!user.value) return;
    const url = await ApiService.getContactPicture(user.value.id);
    if (url) setPhotoUrl(url);
  }

  function loadFromStorage(): void {
    const saved = StorageService.getAuth();
    photoUrl.value = StorageService.getAuthPhoto();
    const savedCompany = StorageService.getCompany();
    if (savedCompany) {
      company.value = savedCompany;
      setApiCompany(savedCompany);
    }
    if (saved) {
      brand.value = saved.brand;
      user.value = saved.user;
      // Push credentials from auth session back into the contacts cache so
      // login lookups always have the latest username/passwordHash even after
      // a fresh API fetch that doesn't return these fields.
      const { id, username, passwordHash } = saved.user;
      const patch: Partial<typeof saved.user> = {};
      if (username)     patch.username     = username;
      if (passwordHash) patch.passwordHash = passwordHash;
      if (Object.keys(patch).length) StorageService.patchContact(id, patch);
    }
  }

  async function checkBrandAccess(contactId: string, brand: Brand): Promise<boolean> {
    try {
      const tags = await ApiService.getContactBrandTags(contactId);
      if (tags.length === 0) {
        error.value = 'No brand access has been configured for your account. Please contact head office for configuration.';
        return false;
      }
      const brandKey = brand.itemFamilyCode ?? brand.code;
    if (!tags.includes(brandKey)) {
        error.value = `You are not authorized to access ${brand.displayName}.`;
        return false;
      }
      return true;
    } catch {
      return true; // fail-open if offline or endpoint unavailable
    }
  }

  async function login(
    selectedCompany: Company,
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
        contacts = StorageService.getCachedContacts();
      }

      const trimmedUsername = username.trim().toLowerCase();

      const findCandidate = (list: Contact[]) =>
        list.find((c) => c.username?.trim().toLowerCase() === trimmedUsername) ??
        list.find((c) => c.displayName?.trim().toLowerCase() === trimmedUsername);

      let candidate = findCandidate(contacts);

      // Candidate not found in cache — cache may be stale (e.g. pre-custom-endpoint data).
      // Try a fresh fetch so the latest username/passwordHash fields are available.
      if (!candidate) {
        try {
          const fresh = await ApiService.getContacts();
          StorageService.setCachedContacts(fresh);
          contacts = StorageService.getCachedContacts();
          candidate = findCandidate(contacts);
        } catch {
          // Offline — proceed with cached result
        }
      }

      if (!candidate) {
        error.value = 'Invalid username or password.';
        return false;
      }

      // No password hash set — go straight to setup without verifying anything
      if (!candidate.passwordHash) {
        pendingSetupData.value = { brand: selectedBrand, contact: candidate };
        forcePasswordSetup.value = true;
        return false;
      }

      // Plain-text (non-bcrypt) password — verify match, log in, silently upgrade to bcrypt
      if (!isBcryptHash(candidate.passwordHash)) {
        const storedPlain = candidate.passwordHash.trim();
        const typedPlain  = password.trim();
        if (storedPlain !== typedPlain) {
          error.value = 'Invalid username or password.';
          return false;
        }
        if (!await checkBrandAccess(candidate.id, selectedBrand)) return false;
        const hash = await bcrypt.hash(typedPlain, 10);
        const upgraded = { ...candidate, passwordHash: hash };
        const all = StorageService.getCachedContacts();
        const idx = all.findIndex((x) => x.id === upgraded.id);
        if (idx >= 0) all[idx] = upgraded;
        StorageService.setCachedContacts(all);
        company.value = selectedCompany;
        brand.value = selectedBrand;
        user.value = upgraded;
        setApiCompany(selectedCompany);
        StorageService.setCompany(selectedCompany);
        StorageService.setAuth({ brand: selectedBrand, user: upgraded, company: selectedCompany });
        ApiService.updateContact(upgraded.id, { passwordHash: hash }).catch(() => {});
        fetchAndCachePhoto();
        return true;
      }

      // Bcrypt hash — verify login and check for default password concurrently
      const [passwordValid, isDefaultPassword] = await Promise.all([
        bcrypt.compare(password, candidate.passwordHash),
        bcrypt.compare('12345678', candidate.passwordHash),
      ]);

      if (!passwordValid) {
        error.value = 'Invalid username or password.';
        return false;
      }

      if (isDefaultPassword) {
        pendingSetupData.value = { brand: selectedBrand, contact: candidate };
        forcePasswordSetup.value = true;
        return false;
      }

      if (!await checkBrandAccess(candidate.id, selectedBrand)) return false;

      company.value = selectedCompany;
      brand.value = selectedBrand;
      user.value = candidate;
      setApiCompany(selectedCompany);
      StorageService.setCompany(selectedCompany);
      StorageService.setAuth({ brand: selectedBrand, user: candidate, company: selectedCompany });
      fetchAndCachePhoto();
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
    const { contact: c } = pendingSetupData.value;

    const hash = await bcrypt.hash(newPassword, 10);
    const updated: Contact = { ...c, passwordHash: hash };

    // Persist to cached contacts list so the hash survives future logins
    const contacts = StorageService.getCachedContacts();
    const idx = contacts.findIndex((x) => x.id === updated.id);
    if (idx >= 0) contacts[idx] = updated;
    StorageService.setCachedContacts(contacts);

    ApiService.updateContact(updated.id, { passwordHash: hash }).catch(() => {});

    // Don't auto-login — modal dismisses to reveal the login page underneath
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
    ApiService.updateContact(user.value.id, updates).catch(() => {});
  }

  function logout(): void {
    company.value = null;
    brand.value = null;
    user.value = null;
    photoUrl.value = null;
    setApiCompany(null);
    StorageService.clearAuth();
    StorageService.clearAuthPhoto();
    StorageService.clearCompany();
  }

  function clearError(): void {
    error.value = null;
  }

  return {
    company,
    brand,
    user,
    photoUrl,
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
    setPhotoUrl,
    fetchAndCachePhoto,
    logout,
    clearError,
  };
});
