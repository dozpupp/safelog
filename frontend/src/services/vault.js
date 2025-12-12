import { encryptVault, decryptVault, generateAccount, signMessagePQC, decryptMessagePQC } from '../utils/crypto';

class VaultService {
    constructor() {
        this.vault = null; // Will ONLY contain sanitized accounts (No Private Keys)
        this.isLocked = true;
        // NO currentPassword stored here!
    }

    hasVault() {
        return !!localStorage.getItem('safelog_vault');
    }

    // Helper to sanitize an account (remove private keys)
    _sanitize(account) {
        return {
            ...account,
            dilithium: {
                publicKey: account.dilithium.publicKey
                // privateKey is REMOVED
            },
            kyber: {
                publicKey: account.kyber.publicKey
                // privateKey is REMOVED
            }
        };
    }

    // Helper to get the FULL vault (decrypted) temporarily
    // ONLY used within this class for specific operations
    async _getFullVault(password) {
        if (!password) throw new Error("Password required");
        const encryptedJson = localStorage.getItem('safelog_vault');
        if (!encryptedJson) throw new Error("No vault found");

        const encrypted = JSON.parse(encryptedJson);
        return await decryptVault(encrypted, password);
    }

    async setup(name, password) {
        if (this.hasVault()) throw new Error("Vault already exists");

        // 1. Generate full account with keys
        const account = await generateAccount(name);

        // 2. Create full vault
        const fullVault = {
            accounts: [account],
            activeAccountId: account.id
        };

        // 3. Encrypt and Save Full Vault
        await this._save(fullVault, password);

        // 4. Update Memory with SANITIZED vault
        this.vault = {
            accounts: [this._sanitize(account)],
            activeAccountId: account.id
        };
        this.isLocked = false;

        return this._sanitize(account);
    }

    // Internal helper to save a FULL vault
    async _save(fullVault, password) {
        if (!password) throw new Error("Password required to save");
        const encrypted = await encryptVault(fullVault, password);
        localStorage.setItem('safelog_vault', JSON.stringify(encrypted));
    }

    // Public save is removed/disabled because we don't save the in-memory (sanitized) vault
    // Operations like add/delete handle saving internally via _save(fullVault)

    async unlock(password) {
        const encryptedJson = localStorage.getItem('safelog_vault');
        if (!encryptedJson) throw new Error("No vault found");

        try {
            const encrypted = JSON.parse(encryptedJson);

            // 1. Decrypt Full Vault
            const fullVault = await decryptVault(encrypted, password);

            // 2. Sanitize for Memory
            this.vault = {
                accounts: fullVault.accounts.map(acc => this._sanitize(acc)),
                activeAccountId: fullVault.activeAccountId
            };

            this.isLocked = false;
            // Password is intentionally NOT saved
            return true;
        } catch (e) {
            console.error("Unlock failed", e);
            return false;
        }
    }

    lock() {
        this.vault = null;
        this.isLocked = true;
    }

    getActiveAccount() {
        if (this.isLocked || !this.vault) return null;
        // Returns SANITIZED account
        return this.vault.accounts.find(a => a.id === this.vault.activeAccountId);
    }

    getAccounts() {
        if (this.isLocked || !this.vault) return [];
        return this.vault.accounts.map(a => ({
            id: a.id,
            name: a.name,
            isActive: a.id === this.vault.activeAccountId,
            createdAt: a.createdAt,
            // Public keys are available if needed for UI, but no private keys
            dilithiumPublicKey: a.dilithium.publicKey,
            kyberPublicKey: a.kyber.publicKey
        }));
    }

    async addAccount(name, password) {
        if (this.isLocked) throw new Error("Vault locked");

        // 1. Decrypt full vault to modify it
        const fullVault = await this._getFullVault(password);

        // 2. Generate new account
        const account = await generateAccount(name);
        fullVault.accounts.push(account);

        // 3. Save full vault
        await this._save(fullVault, password);

        // 4. Update memory (sanitized)
        this.vault.accounts.push(this._sanitize(account));

        return this._sanitize(account);
    }

    async switchAccount(id, password) {
        if (this.isLocked) throw new Error("Vault locked");

        // 1. Load full vault
        const fullVault = await this._getFullVault(password);

        // 2. Validate ID
        const exists = fullVault.accounts.find(a => a.id === id);
        if (!exists) throw new Error("Account not found");

        // 3. Update Active ID
        fullVault.activeAccountId = id;

        // 4. Save
        await this._save(fullVault, password);

        // 5. Update Memory
        this.vault.activeAccountId = id;
        console.log("VaultService: switched to", id);

        return this._sanitize(exists);
    }

    async deleteAccount(id, password) {
        if (this.isLocked) throw new Error("Vault locked");

        const fullVault = await this._getFullVault(password);

        if (fullVault.accounts.length <= 1) throw new Error("Cannot delete last account");

        if (fullVault.activeAccountId === id) {
            const other = fullVault.accounts.find(a => a.id !== id);
            fullVault.activeAccountId = other.id;
            this.vault.activeAccountId = other.id; // Sync memory
        }

        fullVault.accounts = fullVault.accounts.filter(a => a.id !== id);
        await this._save(fullVault, password);

        // Sync memory
        this.vault.accounts = this.vault.accounts.filter(a => a.id !== id);
    }

    async exportVault(password) {
        if (this.isLocked) throw new Error("Vault locked");
        const fullVault = await this._getFullVault(password);
        // Export plaintext (sensitive!)
        return JSON.stringify(fullVault, null, 2);
    }

    async importVault(jsonString, password) {
        if (this.isLocked) throw new Error("Vault locked");
        try {
            const data = JSON.parse(jsonString);
            if (!data.accounts || !Array.isArray(data.accounts)) throw new Error("Invalid vault format");

            // 1. Get Full Vault
            const fullVault = await this._getFullVault(password);

            let addedCount = 0;
            for (const acc of data.accounts) {
                // FORCE ID normalization
                if (acc.dilithium && acc.dilithium.publicKey) {
                    acc.id = acc.dilithium.publicKey;
                }

                const existingIndex = fullVault.accounts.findIndex(existing => existing.id === acc.id);
                if (existingIndex >= 0) {
                    fullVault.accounts[existingIndex] = acc;
                } else {
                    fullVault.accounts.push(acc);
                }
                addedCount++;
            }

            if (addedCount > 0) {
                await this._save(fullVault, password);

                // Re-sync memory completely to ensure consistency
                this.vault = {
                    accounts: fullVault.accounts.map(acc => this._sanitize(acc)),
                    activeAccountId: fullVault.activeAccountId
                };
            }
            return addedCount;
        } catch (e) {
            throw new Error("Import failed: " + e.message);
        }
    }

    async sign(message, password) {
        if (this.isLocked) throw new Error("Vault locked");

        // 1. DECRYPT ON DEMAND
        const fullVault = await this._getFullVault(password);
        const account = fullVault.accounts.find(a => a.id === fullVault.activeAccountId);

        if (!account) throw new Error("Active account not found in vault");

        // 2. USE KEY
        const signature = await signMessagePQC(message, account.dilithium.privateKey);

        // 3. DISCARD (fullVault goes out of scope)
        return signature;
    }

    async decrypt(encryptedData, password) {
        if (this.isLocked) throw new Error("Vault locked");

        // 1. DECRYPT ON DEMAND
        const fullVault = await this._getFullVault(password);
        const account = fullVault.accounts.find(a => a.id === fullVault.activeAccountId);

        if (!account) throw new Error("Active account not found in vault");

        // 2. USE KEY
        const plaintext = await decryptMessagePQC(encryptedData, account.kyber.privateKey);

        // 3. DISCARD
        return plaintext;
    }
}

export const vaultService = new VaultService();
