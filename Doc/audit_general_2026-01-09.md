# Audit Général de Safelog
**Date** : 09 Janvier 2026

## 1. Usages Pertinents et Concept
Safelog se positionne comme une application de **haute sécurité** ("Post-Quantum") pour la gestion de secrets et la signature de documents.

*   **Pertinence** : L'approche "Crypto-Agile" (hybride RSA/ECC classique + Dilithium/Kyber Post-Quantique) est très avant-gardiste et pertinente dans un contexte où la menace quantique ("Harvest Now, Decrypt Later") grandit.
*   **Cas d'usage forts** :
    *   Workflow de validation multi-signatures pour des opérations critiques (ex: lancement de prod, accès bancaires).
    *   Messagerie sécurisée interne.
    *   Stockage de clés privées ou secrets d'infrastructure.

## 2. Architecture Technique
L'architecture est modulaire mais présente des choix atypiques liés à la cryptographie.

*   **Backend** :
    *   **Core** : Python (FastAPI). Choix solide pour la rapidité de dev et la performance I/O.
    *   **Crypto PQC** : Microservice Node.js (`pqc_service.js`).
        *   *Analyse* : C'est une architecture "Sidecar". Nécessaire car les bibliothèques PQC (Crystals-Dilithium) sont souvent mieux supportées ou plus performantes en JS/WASM ou C wrappers à ce stade. Cependant, cela ajoute une latence HTTP pour chaque signature/vérification.
    *   **Base de données** : SQLite (par défaut).
*   **Frontend** :
    *   React + Vite + Tailwind. Stack moderne, performante et standard.
    *   Usage des Contextes (`AuthContext`, `PQCContext`) bien structuré pour séparer la logique crypto de l'UI.
*   **Extension TrustKeys** :
    *   Déporte la gestion des clés privées hors du contexte de la page web. C'est le **point fort architectural** majeur. Cela empêche une attaque XSS simple de voler les clés (contrairement à un stockage en `localStorage` ou `sessionStorage`).

## 3. Qualité de Code
*   **Backend** :
    *   Code propre, typé (Type Hints Python), utilisation correcte de Pydantic pour la validation.
    *   Structure claire (`routers/`, `models.py`, `schemas.py`).
*   **Frontend** :
    *   Code React idiomatique (Hooks, functional components).
    *   Pas de "prop drilling" excessif grâce aux Contexts.
*   **Extension** :
    *   Séparation claire entre le script de fond (background) et l'injection dans la page (content script), respectant le modèle de sécurité des extensions.

## 4. Sécurité
L'audit révèle un niveau de sécurité conceptuel très élevé, mais quelques faiblesses d'implémentation à corriger avant la production.

### Forces (🟢)
*   **Post-Quantum Ready** : Utilisation de Kyber (KEM) et Dilithium (Signature).
*   **Isolation des clés** : L'extension TrustKeys agit comme un "Wallet" crypto, les clés privées ne sont jamais exposées au frontend Safelog.
*   **Chiffrement de bout en bout (E2EE)** : Le backend ne voit jamais les secrets en clair.
*   **Signature des JWT** : Les tokens de session sont signés avec Dilithium, ce qui protège même l'authentification API contre les futures attaques quantiques.

### Faiblesses et Risques (🔴)
*   **Déni de Service (DoS)** : Dans `backend/schemas.py`, les champs `encrypted_data` et `signature` autorisent jusqu'à **~52 Mo** (`max_length=52_500_000`).
    *   *Risque* : Un attaquant peut envoyer plusieurs requêtes simultanées de 50 Mo. Le serveur va tenter de tout charger en RAM, provoquant un crash par manque de mémoire (OOM).
*   **Politique de sécurité (CSP)** : Manque de headers stricts `Content-Security-Policy` dans `backend/main.py`. Seul `X-XSS-Protection` (obsolète) et `Referrer-Policy` sont présents.
*   **Communication Inter-Processus** : La communication entre FastAPI et le service Node.js se fait via HTTP (`localhost:3002`) avec une clé statique (`PQC_SHARED_SECRET`).
    *   *Risque* : Si un attaquant a un accès local au serveur, il peut intercepter ou forger des signatures.
*   **Taille des Headers** : Les signatures Dilithium sont très lourdes (plusieurs Ko). Cela oblige à augmenter les buffers des serveurs web (comme Nginx), ce qui peut être un vecteur d'attaque si mal configuré.

## 5. Capacité à Scaler en Production
Actuellement, l'application est en mode "Proof of Concept" ou "MVP".

*   **Freins au scaling** :
    1.  **SQLite** : La base de données est un fichier unique (`sql_app.db`). Impossible à scaler horizontalement et performances limitées en écriture concurrente.
        *   *Solution* : Migrer vers PostgreSQL.
    2.  **Service PQC Node.js** : Goulot d'étranglement CPU. Le chiffrement PQC est lourd. Un seul processus Node single-thread limitera fortement le débit.
    3.  **Bande Passante** : Les clés et signatures PQC sont **très volumineuses**. Les coûts de bande passante seront significatifs à grande échelle.

## Synthèse
Safelog est une application **technologiquement impressionnante** qui démontre une vraie maîtrise des enjeux cryptographiques futurs. L'architecture de sécurité (TrustKeys + Backend E2EE) est solide. Cependant, le backend nécessite un "durcissement" (Hardening) avant une mise en production : migration DB, limites de taille de payload plus strictes, et optimisation du microservice crypto.
