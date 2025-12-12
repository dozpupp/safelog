import { encryptVault, decryptVault, generateAccount, signMessagePQC, decryptMessagePQC } from '../utils/crypto';

class VaultService {
    constructor() {
        this.vault = null;
        this.isLocked = true;
        this.currentPassword = null;
    }

    hasVault() {
        return !!localStorage.getItem('safelog_vault');
    }

    async setup(name, password) {
        if (this.hasVault()) throw new Error("Vault already exists");

        const account = await generateAccount(name);
        this.vault = {
            accounts: [account],
            activeAccountId: account.id
        };
        this.currentPassword = password;

        await this.save();
        this.isLocked = false;
        return account;
    }

    async save() {
        if (!this.vault || !this.currentPassword) return;
        const encrypted = await encryptVault(this.vault, this.currentPassword);
        localStorage.setItem('safelog_vault', JSON.stringify(encrypted));
    }

    async unlock(password) {
        const encryptedJson = localStorage.getItem('safelog_vault');
        if (!encryptedJson) throw new Error("No vault found");

        try {
            const encrypted = JSON.parse(encryptedJson);
            this.vault = await decryptVault(encrypted, password);
            this.isLocked = false;
            this.currentPassword = password;
            return true;
        } catch (e) {
            console.error("Unlock failed", e);
            this.currentPassword = null;
            return false;
        }
    }

    lock() {
        this.vault = null;
        this.isLocked = true;
        this.currentPassword = null;
    }

    getActiveAccount() {
        if (this.isLocked || !this.vault) return null;
        return this.vault.accounts.find(a => a.id === this.vault.activeAccountId);
    }

    getAccounts() {
        if (this.isLocked || !this.vault) return [];
        return this.vault.accounts.map(a => ({
            id: a.id,
            name: a.name,
            isActive: a.id === this.vault.activeAccountId,
            createdAt: a.createdAt
        }));
    }

    async addAccount(name) {
        if (this.isLocked) throw new Error("Vault locked");
        const account = await generateAccount(name);
        this.vault.accounts.push(account);
        // Auto-switch to new account? Maybe not.
        await this.save();
        return account;
    }

    async switchAccount(id) {
        if (this.isLocked) throw new Error("Vault locked");
        console.log("VaultService: switching to", id);
        const exists = this.vault.accounts.find(a => a.id === id);
        if (!exists) throw new Error("Account not found");
        this.vault.activeAccountId = id;
        await this.save();
        console.log("VaultService: active account is now", this.vault.activeAccountId);
        return exists;
    }

    async deleteAccount(id) {
        if (this.isLocked) throw new Error("Vault locked");
        if (this.vault.accounts.length <= 1) throw new Error("Cannot delete last account");

        if (this.vault.activeAccountId === id) {
            // Switch to first available before delete
            const other = this.vault.accounts.find(a => a.id !== id);
            this.vault.activeAccountId = other.id;
        }

        this.vault.accounts = this.vault.accounts.filter(a => a.id !== id);
        await this.save();
    }

    async exportVault() {
        if (this.isLocked) throw new Error("Vault locked");
        // Return decrypted vault structure (excluding sensitive implementation details if any, but currently just accounts)
        return JSON.stringify(this.vault, null, 2);
    }

    async importVault(jsonString) {
        if (this.isLocked) throw new Error("Vault locked");
        try {
            const data = JSON.parse(jsonString);
            if (!data.accounts || !Array.isArray(data.accounts)) throw new Error("Invalid vault format");

            // Merge strategy: Add accounts that don't exist (by ID)
            let addedCount = 0;
            for (const acc of data.accounts) {
                // FORCE ID normalization: ID must be the Public Key
                if (acc.dilithium && acc.dilithium.publicKey) {
                    acc.id = acc.dilithium.publicKey;
                }

                const existingIndex = this.vault.accounts.findIndex(existing => existing.id === acc.id);
                if (existingIndex >= 0) {
                    // Overwrite existing account with imported data
                    this.vault.accounts[existingIndex] = acc;
                    addedCount++;
                } else {
                    this.vault.accounts.push(acc);
                    addedCount++;
                }
            }
            if (addedCount > 0) await this.save();
            return addedCount;
        } catch (e) {
            throw new Error("Import failed: " + e.message);
        }
    }

    async sign(message) {
        const account = this.getActiveAccount();
        if (!account) throw new Error("Vault locked or empty");
        return await signMessagePQC(message, account.dilithium.privateKey);
    }

    async decrypt(encryptedData) {
        const account = this.getActiveAccount();
        if (!account) throw new Error("Vault locked or empty");
        return await decryptMessagePQC(encryptedData, account.kyber.privateKey);
    }
}

export const vaultService = new VaultService();
